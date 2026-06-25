import {
  getNextQueued, getJob, updateJob, countRunning, requeueInterrupted,
} from '../store/jobs.js'
import { getSettings } from '../store/settings.js'
import { processJob } from './pipeline.js'
import { appendLog } from '../logger.js'
import { AbortError } from '../exec/runner.js'

const running = new Map() // jobId -> AbortController
let loopActive = false
let kickPending = false

const mapStages = (stages, fn) => (Array.isArray(stages) ? stages.map(fn) : stages ?? null)

export function startWorker() {
  const ids = requeueInterrupted()
  for (const id of ids) appendLog(id, '[WORKER] reenfileirado após restart do servidor')
  kick()
}

// Pede ao worker para reavaliar a fila (sem reentrância).
export function kick() {
  if (loopActive) {
    kickPending = true
    return
  }
  loop()
}

async function loop() {
  loopActive = true
  try {
    const concurrency = Math.max(1, getSettings().concurrency || 1)
    while (countRunning() < concurrency) {
      const job = getNextQueued()
      if (!job) break
      startJob(job.id)
    }
  } finally {
    loopActive = false
    if (kickPending) {
      kickPending = false
      loop()
    }
  }
}

function startJob(jobId) {
  const ac = new AbortController()
  running.set(jobId, ac)
  updateJob(jobId, { status: 'running', started_at: Date.now(), error: null })
  appendLog(jobId, '[WORKER] iniciando job')

  processJob(jobId, ac.signal)
    .then((res) => {
      updateJob(jobId, {
        status: 'done', stage: null, progress: 1,
        finished_at: Date.now(), result: res?.result ?? null,
      })
      appendLog(jobId, '[WORKER] ✓ concluído')
    })
    .catch((err) => {
      const stages = getJob(jobId)?.stages
      if (err instanceof AbortError || err?.name === 'AbortError') {
        // Pausa/cancelamento: a etapa em andamento não concluiu — volta a pendente.
        // Artefatos NÃO são apagados (o resume depende deles; a idempotência do par2
        // já é garantida pela limpeza do workdir no início da geração).
        updateJob(jobId, {
          status: 'paused', stage: null,
          stages: mapStages(stages, (s) => (s.status === 'running' ? { ...s, status: 'pending', startedAt: undefined } : s)),
        })
        appendLog(jobId, '[WORKER] ⏸ pausado/cancelado')
      } else {
        // Falha: marca a etapa em andamento como `failed` para o resume saber onde parou.
        const msg = String(err?.message || err)
        updateJob(jobId, {
          status: 'failed', error: msg, finished_at: Date.now(),
          stages: mapStages(stages, (s) => (s.status === 'running' ? { ...s, status: 'failed', finishedAt: Date.now(), error: msg } : s)),
        })
        appendLog(jobId, `[WORKER] ✗ falhou: ${msg}`)
      }
    })
    .finally(() => {
      running.delete(jobId)
      kick()
    })
}

// Cancela/pausa um job em execução (mata o subprocesso).
export function cancelRunningJob(jobId) {
  const ac = running.get(jobId)
  if (!ac) return false
  ac.abort()
  return true
}

export function isRunning(jobId) {
  return running.has(jobId)
}
