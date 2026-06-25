import fs from 'node:fs'
import path from 'node:path'
import { getJob, updateJob } from '../store/jobs.js'
import { getSettings } from '../store/settings.js'
import { ensureNyuuConfigFile } from '../store/nyuuConfig.js'
import { getExecutor, parsePercent, getAlgorithm, DEFAULT_ALGORITHM, binaryAvailable, listPar2Files } from '../exec/index.js'
import { mergeNzbFiles } from '../exec/nzb.js'
import { getProvider, mockUpload } from '../providers/index.js'
import { appendLog } from '../logger.js'
import { emit } from '../events.js'
import { DATA_DIR } from '../config.js'

function deriveBase(source) {
  const clean = source.replace(/[/\\]+$/, '')
  const bn = path.basename(clean)
  const isDir = fs.statSync(source).isDirectory()
  return isDir ? bn : bn.replace(/\.[^.]+$/, '')
}

const STAGE_LABELS = { nfo: 'NFO', par2: 'Paridade', posting: 'Postagem', indexing: 'Indexador' }

// Monta o plano de etapas aplicáveis ao job. No modo paralelo (two-pass) a paridade é
// gerada DENTRO da postagem, então não há etapa 'par2' separada (posting.parallel=true).
function buildPlan({ makeNfo, doPar2Seq, useParallel, doIndex }) {
  const plan = []
  if (makeNfo) plan.push({ key: 'nfo' })
  if (doPar2Seq) plan.push({ key: 'par2' })
  plan.push(useParallel ? { key: 'posting', parallel: true } : { key: 'posting' })
  if (doIndex) plan.push({ key: 'indexing' })
  return plan.map((s) => ({ ...s, label: STAGE_LABELS[s.key], status: 'pending' }))
}

// Resume: herda os marcadores `done` (e seus tempos) de um run anterior por chave de etapa.
function mergePlan(plan, prior) {
  if (!Array.isArray(prior)) return plan
  const byKey = new Map(prior.map((s) => [s.key, s]))
  return plan.map((s) => {
    const p = byKey.get(s.key)
    return p?.status === 'done'
      ? { ...s, status: 'done', startedAt: p.startedAt, finishedAt: p.finishedAt }
      : s
  })
}

// Roda dois ramos em paralelo sob o mesmo cancelamento do job. Se UM falhar com erro
// real (não-abort), aborta o irmão na hora (evita processo órfão) e propaga o erro.
// Um abort externo (pausa/cancelar) já mata os dois via o mesmo signal-filho.
function raceBothOrAbort(signal, makeBranches) {
  const ac = new AbortController()
  const onOuter = () => ac.abort()
  if (signal.aborted) ac.abort()
  else signal.addEventListener('abort', onOuter, { once: true })
  return Promise.all(makeBranches(ac.signal))
    .catch((err) => { ac.abort(); throw err })
    .finally(() => signal.removeEventListener('abort', onOuter))
}

// Executa um job pelas etapas: NFO -> par2 -> nyuu -> Curupira.
// Cada etapa atualiza stage/progress no banco e dispara eventos de SSE.
export async function processJob(jobId, signal) {
  const settings = getSettings()
  const exec = getExecutor(settings.mock)
  const job = getJob(jobId)
  if (!job) return null

  const source = job.source_path
  if (!fs.existsSync(source)) throw new Error(`fonte não encontrada: ${source}`)

  const outDir = settings.paths.outDir || path.join(DATA_DIR, 'out')
  fs.mkdirSync(outDir, { recursive: true })

  const base = job.name || deriveBase(source)
  const nfoPath = path.join(outDir, `${base}.nfo`)
  const nzbPath = path.join(outDir, `${base}.nzb`)
  const workBase = settings.paths.workDirBase || outDir
  const workDir = path.join(workBase, `.par2_${base}`)

  // Se um workdir foi informado mas não existe, falha cedo em vez de auto-criar:
  // evita escrever na raiz caso o disco de scratch não esteja montado.
  if (settings.paths.workDirBase && !fs.existsSync(settings.paths.workDirBase)) {
    throw new Error(`workdir do par2 não existe — o disco de scratch está montado? (${settings.paths.workDirBase})`)
  }

  const opts = job.options || {}
  const makeNfo = opts.makeNfo !== false
  const redundancy = opts.redundancy ?? settings.par2.redundancy
  const volumes = opts.volumes ?? settings.par2.volumes
  const memoryMB = settings.par2.memoryMB || 0
  const subdirs = opts.subdirs || settings.post.subdirs
  const indexer = settings.indexer || {}
  const doIndex = opts.index !== false && indexer.enabled && !!job.category_id

  // Algoritmo de paridade: override por-job > global > default. Resolve binário e config dele.
  const parity = settings.parity || { algorithm: DEFAULT_ALGORITHM, configs: {} }
  const algorithm = opts.algorithm || parity.algorithm || DEFAULT_ALGORITHM
  const algoMeta = getAlgorithm(algorithm)
  const par2Bin = settings.bin[algoMeta.binKey] || algoMeta.defaultBin
  const algoConfig = parity.configs?.[algorithm] || {}
  const parallelMode = settings.post?.parallelMode || 'off'
  const useParallel = redundancy > 0 && parallelMode === 'twopass'

  const log = (line) => appendLog(jobId, line)

  // Plano de etapas (resume: herda os `done` de um run anterior, se houver).
  const stages = mergePlan(
    buildPlan({ makeNfo, doPar2Seq: redundancy > 0 && !useParallel, useParallel, doIndex }),
    job.stages,
  )
  const findStage = (key) => stages.find((s) => s.key === key)
  const isDone = (key) => findStage(key)?.status === 'done'
  const beginStage = (key) => {
    const s = findStage(key)
    if (s) { s.status = 'running'; s.startedAt = Date.now(); delete s.error; delete s.finishedAt }
    updateJob(jobId, { stage: key, progress: 0, stages })
    emit({ type: 'job:progress', id: jobId, stage: key, progress: 0 })
  }
  const endStage = (key) => {
    const s = findStage(key)
    if (s) { s.status = 'done'; s.finishedAt = Date.now() }
    updateJob(jobId, { stages })
  }
  // sub (opcional) rotula sub-fluxos concorrentes (ex: 'upload' vs 'par2') no modo paralelo.
  const makeOnLine = (stage, sub) => (line) => {
    log(line)
    const p = parsePercent(line)
    if (p != null) {
      updateJob(jobId, { progress: p }, { silent: true })
      emit({ type: 'job:progress', id: jobId, stage, sub, progress: p })
    }
  }

  // Persiste o plano inicial para a UI mostrar as etapas (pending) antes da 1ª transição.
  updateJob(jobId, { stages })

  if (exec.mock) log('[WORKER] modo MOCK ativo — binários simulados')

  // 1. NFO
  let nfoMade = false
  if (makeNfo) {
    if (isDone('nfo') && fs.existsSync(nfoPath)) {
      log('[NFO ] reaproveitado de run anterior')
      nfoMade = true
    } else {
      beginStage('nfo')
      const r = await exec.generateNfo({ source, nfoPath, bin: settings.bin.mediainfo, onLine: makeOnLine('nfo'), signal })
      nfoMade = !!r?.video
      endStage('nfo')
    }
  } else {
    log('[NFO ] desativado para este job')
  }

  // Falha cedo se o binário do algoritmo selecionado não existir (mensagem melhor que ENOENT).
  if (!exec.mock && redundancy > 0 && !binaryAvailable(par2Bin)) {
    throw new Error(`binário do algoritmo de paridade "${algorithm}" não encontrado: ${par2Bin}`)
  }

  const configPath = ensureNyuuConfigFile()

  if (useParallel) {
    // 2+3 PARALELO (two-pass): sobe a FONTE ∥ gera par2; depois sobe os par2; depois
    // junta os dois NZBs num só. Ganha em release grande único (rede ∥ CPU).
    if (isDone('posting') && fs.existsSync(nzbPath)) {
      log('[POST] reaproveitado de run anterior (NZB já existe)')
    } else {
      beginStage('posting')
      log(`[PARALELO] two-pass: subindo a fonte e gerando paridade (${algorithm}) ao mesmo tempo`)
      const nzbSource = path.join(outDir, `${base}.source.nzb`)
      const nzbPar2 = path.join(outDir, `${base}.par2.nzb`)

      const [, par2Files] = await raceBothOrAbort(signal, (s) => [
        exec.postNyuuInputs({
          inputs: [source], nzbPath: nzbSource, configPath, subdirs, bin: settings.bin.nyuu,
          categoryId: job.category_id, nzbTitle: base, onLine: makeOnLine('posting', 'upload'), signal: s,
        }),
        exec.generatePar2({
          source, workDir, base, redundancy, volumes, memoryMB, algorithm, algoConfig,
          bin: par2Bin, onLine: makeOnLine('posting', 'par2'), signal: s,
        }),
      ])

      const parts = [nzbSource]
      if (par2Files.length) {
        log(`[PARALELO] fonte enviada; subindo ${par2Files.length} arquivo(s) de paridade`)
        await exec.postNyuuInputs({
          inputs: par2Files, nzbPath: nzbPar2, configPath, subdirs, bin: settings.bin.nyuu,
          categoryId: job.category_id, nzbTitle: base, onLine: makeOnLine('posting', 'upload-par2'), signal,
        })
        parts.push(nzbPar2)
      }
      mergeNzbFiles({ out: nzbPath, parts, log })
      // Remove os NZBs intermediários só após o merge OK (mantê-los ajudaria no diagnóstico).
      for (const f of [nzbSource, nzbPar2]) { if (fs.existsSync(f)) fs.rmSync(f) }
      endStage('posting')
    }
  } else {
    // 2+3 SEQUENCIAL: par2 completo, depois nyuu sobe fonte + par2 num único NZB.
    let par2Files = []
    if (redundancy > 0) {
      // Reaproveita a paridade de um run anterior (resume) re-listando o workdir.
      if (isDone('par2')) {
        par2Files = listPar2Files(workDir)
        if (par2Files.length) log(`[PAR2] reaproveitado: ${par2Files.length} arquivo(s) de run anterior`)
      }
      if (!par2Files.length) {
        beginStage('par2')
        par2Files = await exec.generatePar2({
          source, workDir, base, redundancy, volumes, memoryMB, algorithm, algoConfig,
          bin: par2Bin, onLine: makeOnLine('par2'), signal,
        })
        endStage('par2')
      }
    } else {
      log('[PAR2] desativado (redundância 0)')
    }

    if (isDone('posting') && fs.existsSync(nzbPath)) {
      log('[POST] reaproveitado de run anterior (NZB já existe)')
    } else {
      beginStage('posting')
      await exec.postNyuu({
        source, par2Files, nzbPath, configPath, subdirs, bin: settings.bin.nyuu,
        categoryId: job.category_id, nzbTitle: base, onLine: makeOnLine('posting'), signal,
      })
      endStage('posting')
    }
  }
  updateJob(jobId, { nzb_path: nzbPath, nfo_path: nfoMade ? nfoPath : null })

  // 4. INDEX (provider de indexador — factory)
  let result = null
  if (doIndex) {
    if (isDone('indexing')) {
      log('[INDEX] já concluído anteriormente')
      result = getJob(jobId)?.result ?? null
    } else {
      beginStage('indexing')
      const providerId = indexer.provider
      const config = indexer.configs?.[providerId] || {}
      const release = {
        nzbPath, nfoPath: nfoMade ? nfoPath : null, categoryId: job.category_id, name: base,
      }
      const r = settings.mock
        ? await mockUpload({ ...release, onLine: makeOnLine('indexing') })
        : await getProvider(providerId).upload({ ...release, config, onLine: makeOnLine('indexing'), signal })
      result = r
      if (!r.ok) throw new Error(`indexador "${providerId}" recusou o upload (HTTP ${r.status})`)
      endStage('indexing')
    }
  } else if (indexer.enabled && !job.category_id) {
    log('[INDEX] pulado: job sem categoria definida')
  }

  // limpeza do workdir par2
  if (!settings.par2.keep && fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true })
    log('[DONE] workdir par2 removido')
  }

  return { nzbPath, nfoPath: nfoMade ? nfoPath : null, result }
}
