import {
  getNextQueued, updateJob, countRunning, requeueInterrupted,
} from '../store/jobs.js'
import { getSettings } from '../store/settings.js'
import { processJob } from './pipeline.js'
import { appendLog } from '../logger.js'
import { AbortError } from '../exec/runner.js'

const running = new Map() // jobId -> AbortController
let loopActive = false
let kickPending = false

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
      if (err instanceof AbortError || err?.name === 'AbortError') {
        updateJob(jobId, { status: 'paused', stage: null })
        appendLog(jobId, '[WORKER] ⏸ pausado/cancelado')
      } else {
        updateJob(jobId, {
          status: 'failed', error: String(err?.message || err), finished_at: Date.now(),
        })
        appendLog(jobId, `[WORKER] ✗ falhou: ${err?.message || err}`)
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
