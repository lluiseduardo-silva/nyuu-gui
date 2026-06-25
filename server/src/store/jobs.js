import { db } from '../db.js'
import { emit } from '../events.js'

const now = () => Date.now()

function rowToJob(row) {
  if (!row) return null
  return {
    ...row,
    options: row.options ? JSON.parse(row.options) : {},
    result: row.result ? JSON.parse(row.result) : null,
    stages: row.stages ? JSON.parse(row.stages) : null,
  }
}

// Reseta etapas não-finalizadas (failed/running) para pending, preservando as `done`.
// Usado no retry (resume) e no requeue após crash — o pipeline retoma na 1ª etapa não-done.
function flipUnfinished(stages) {
  if (!Array.isArray(stages)) return stages ?? null
  return stages.map((s) =>
    s.status === 'failed' || s.status === 'running'
      ? { ...s, status: 'pending', error: undefined, startedAt: undefined, finishedAt: undefined, subs: undefined }
      : s,
  )
}

export function listJobs() {
  const rows = db
    .prepare('SELECT * FROM jobs ORDER BY position ASC, id ASC')
    .all()
  return rows.map(rowToJob)
}

export function getJob(id) {
  return rowToJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id))
}

export function createJob({ source_path, name, category_id = null, options = {} }) {
  const ts = now()
  const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM jobs').get().m
  const info = db
    .prepare(
      `INSERT INTO jobs (source_path, name, category_id, status, position, options, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)`,
    )
    .run(source_path, name, category_id, max + 1, JSON.stringify(options), ts, ts)
  const job = getJob(info.lastInsertRowid)
  emit({ type: 'job:update', job })
  return job
}

const COLUMNS = new Set([
  'source_path', 'name', 'category_id', 'status', 'stage', 'progress',
  'position', 'options', 'error', 'nzb_path', 'nfo_path', 'result', 'stages',
  'started_at', 'finished_at',
])

const JSON_COLUMNS = new Set(['options', 'result', 'stages'])

export function updateJob(id, fields, { silent = false } = {}) {
  const sets = []
  const vals = []
  for (const [k, v] of Object.entries(fields)) {
    if (!COLUMNS.has(k)) continue
    sets.push(`${k} = ?`)
    vals.push(JSON_COLUMNS.has(k) ? JSON.stringify(v ?? null) : v)
  }
  if (sets.length === 0) return getJob(id)
  sets.push('updated_at = ?')
  vals.push(now(), id)
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  const job = getJob(id)
  if (job && !silent) emit({ type: 'job:update', job })
  return job
}

export function deleteJob(id) {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id)
  emit({ type: 'job:delete', id })
}

// Próximo job a processar (fila FIFO por posição).
export function getNextQueued() {
  return rowToJob(
    db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY position ASC, id ASC LIMIT 1").get(),
  )
}

export function countRunning() {
  return db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'running'").get().c
}

// Reordena a fila a partir de uma lista de ids na nova ordem.
export function reorderJobs(orderedIds) {
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => {
      db.prepare('UPDATE jobs SET position = ?, updated_at = ? WHERE id = ?').run(i + 1, now(), id)
    })
  })
  tx(orderedIds)
  return listJobs()
}

// Retry com RESUME: volta para a fila preservando as etapas já `done` (o pipeline
// retoma na 1ª etapa não-finalizada, reaproveitando NFO/par2/NZB). Não mexe nos artefatos.
export function retryJob(id) {
  const job = getJob(id)
  return updateJob(id, {
    status: 'queued', error: null, finished_at: null,
    stages: flipUnfinished(job?.stages),
  })
}

// Retry do ZERO ("reiniciar"): descarta etapas e artefatos para reprocessar tudo.
export function resetJob(id) {
  return updateJob(id, {
    status: 'queued', stage: null, progress: 0, error: null,
    started_at: null, finished_at: null,
    stages: null, nzb_path: null, nfo_path: null, result: null,
  })
}

// Na inicialização: jobs que estavam 'running' quando o processo morreu voltam para a fila.
// Preservam etapas `done` (resume após crash); só as não-finalizadas voltam para pending.
export function requeueInterrupted() {
  const running = db.prepare("SELECT id FROM jobs WHERE status = 'running'").all()
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE jobs SET status = 'queued', stage = NULL, progress = 0, started_at = NULL, updated_at = ? WHERE status = 'running'",
    ).run(now())
  })
  tx()
  for (const { id } of running) {
    const job = getJob(id)
    if (Array.isArray(job?.stages)) {
      updateJob(id, { stages: flipUnfinished(job.stages) }, { silent: true })
    }
  }
  return running.map((r) => r.id)
}
