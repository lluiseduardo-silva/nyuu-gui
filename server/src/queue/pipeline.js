import fs from 'node:fs'
import path from 'node:path'
import { getJob, updateJob } from '../store/jobs.js'
import { getSettings } from '../store/settings.js'
import { ensureNyuuConfigFile } from '../store/nyuuConfig.js'
import { getExecutor, parsePercent } from '../exec/index.js'
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

  const log = (line) => appendLog(jobId, line)
  const setStage = (stage) => {
    updateJob(jobId, { stage, progress: 0 })
    emit({ type: 'job:progress', id: jobId, stage, progress: 0 })
  }
  const makeOnLine = (stage) => (line) => {
    log(line)
    const p = parsePercent(line)
    if (p != null) {
      updateJob(jobId, { progress: p }, { silent: true })
      emit({ type: 'job:progress', id: jobId, stage, progress: p })
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

  // 2. par2
  let par2Files = []
  if (redundancy > 0) {
    setStage('par2')
    par2Files = await exec.generatePar2({
      source, workDir, base, redundancy, volumes, memoryMB, bin: settings.bin.par2, onLine: makeOnLine('par2'), signal,
    })
  } else {
    log('[PAR2] desativado (redundância 0)')
  }

  // 3. POST (nyuu)
  setStage('posting')
  const configPath = ensureNyuuConfigFile()
  await exec.postNyuu({
    source, par2Files, nzbPath, configPath, subdirs, bin: settings.bin.nyuu,
    categoryId: job.category_id, nzbTitle: base, onLine: makeOnLine('posting'), signal,
  })
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
