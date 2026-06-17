import fs from 'node:fs'
import path from 'node:path'
import { getJob, updateJob } from '../store/jobs.js'
import { getSettings } from '../store/settings.js'
import { ensureNyuuConfigFile } from '../store/nyuuConfig.js'
import { getExecutor, parsePercent, getAlgorithm, DEFAULT_ALGORITHM, binaryAvailable } from '../exec/index.js'
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

  const log = (line) => appendLog(jobId, line)
  const setStage = (stage) => {
    updateJob(jobId, { stage, progress: 0 })
    emit({ type: 'job:progress', id: jobId, stage, progress: 0 })
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

  if (exec.mock) log('[WORKER] modo MOCK ativo — binários simulados')

  // 1. NFO
  let nfoMade = false
  if (makeNfo) {
    setStage('nfo')
    const r = await exec.generateNfo({ source, nfoPath, bin: settings.bin.mediainfo, onLine: makeOnLine('nfo'), signal })
    nfoMade = !!r?.video
  } else {
    log('[NFO ] desativado para este job')
  }

  // Falha cedo se o binário do algoritmo selecionado não existir (mensagem melhor que ENOENT).
  if (!exec.mock && redundancy > 0 && !binaryAvailable(par2Bin)) {
    throw new Error(`binário do algoritmo de paridade "${algorithm}" não encontrado: ${par2Bin}`)
  }

  const configPath = ensureNyuuConfigFile()
  const useParallel = redundancy > 0 && parallelMode === 'twopass'

  if (useParallel) {
    // 2+3 PARALELO (two-pass): sobe a FONTE ∥ gera par2; depois sobe os par2; depois
    // junta os dois NZBs num só. Ganha em release grande único (rede ∥ CPU).
    setStage('posting')
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
  } else {
    // 2+3 SEQUENCIAL: par2 completo, depois nyuu sobe fonte + par2 num único NZB.
    let par2Files = []
    if (redundancy > 0) {
      setStage('par2')
      par2Files = await exec.generatePar2({
        source, workDir, base, redundancy, volumes, memoryMB, algorithm, algoConfig,
        bin: par2Bin, onLine: makeOnLine('par2'), signal,
      })
    } else {
      log('[PAR2] desativado (redundância 0)')
    }

    setStage('posting')
    await exec.postNyuu({
      source, par2Files, nzbPath, configPath, subdirs, bin: settings.bin.nyuu,
      categoryId: job.category_id, nzbTitle: base, onLine: makeOnLine('posting'), signal,
    })
  }
  updateJob(jobId, { nzb_path: nzbPath, nfo_path: nfoMade ? nfoPath : null })

  // 4. INDEX (provider de indexador — factory)
  let result = null
  if (doIndex) {
    setStage('indexing')
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
