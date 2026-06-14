import fs from 'node:fs'
import path from 'node:path'
import {
  listJobs, getJob, createJob, updateJob, deleteJob, retryJob, reorderJobs,
} from '../store/jobs.js'
import { readLog, clearLog } from '../logger.js'
import { kick, cancelRunningJob, isRunning } from '../queue/worker.js'

function deriveName(source) {
  const clean = source.replace(/[/\\]+$/, '')
  const bn = path.basename(clean)
  try {
    return fs.statSync(source).isDirectory() ? bn : bn.replace(/\.[^.]+$/, '')
  } catch {
    return bn.replace(/\.[^.]+$/, '')
  }
}

export function registerJobs(app) {
  app.get('/api/jobs', async () => ({ jobs: listJobs() }))

  app.get('/api/jobs/:id', async (req, reply) => {
    const job = getJob(Number(req.params.id))
    if (!job) return reply.code(404).send({ error: 'job não encontrado' })
    return { job, running: isRunning(job.id) }
  })

  app.get('/api/jobs/:id/log', async (req, reply) => {
    const job = getJob(Number(req.params.id))
    if (!job) return reply.code(404).send({ error: 'job não encontrado' })
    return { log: readLog(job.id) }
  })

  app.post('/api/jobs', async (req, reply) => {
    const body = req.body || {}
    const source = (body.source_path || '').trim()
    if (!source) return reply.code(400).send({ error: 'source_path é obrigatório' })
    if (!fs.existsSync(source)) return reply.code(400).send({ error: `caminho não existe: ${source}` })

    const name = (body.name || '').trim() || deriveName(source)
    const job = createJob({
      source_path: source,
      name,
      category_id: body.category_id || null,
      options: {
        makeNfo: body.options?.makeNfo !== false,
        redundancy: body.options?.redundancy,
        volumes: body.options?.volumes,
        subdirs: body.options?.subdirs,
        index: body.options?.index !== false,
      },
    })
    kick()
    return reply.code(201).send({ job })
  })

  app.post('/api/jobs/:id/retry', async (req, reply) => {
    const job = getJob(Number(req.params.id))
    if (!job) return reply.code(404).send({ error: 'job não encontrado' })
    clearLog(job.id)
    const updated = retryJob(job.id)
    kick()
    return { job: updated }
  })

  app.post('/api/jobs/:id/pause', async (req, reply) => {
    const job = getJob(Number(req.params.id))
    if (!job) return reply.code(404).send({ error: 'job não encontrado' })
    if (isRunning(job.id)) cancelRunningJob(job.id)
    else updateJob(job.id, { status: 'paused' })
    return { ok: true }
  })

  app.post('/api/jobs/:id/resume', async (req, reply) => {
    const job = getJob(Number(req.params.id))
    if (!job) return reply.code(404).send({ error: 'job não encontrado' })
    const updated = updateJob(job.id, { status: 'queued', error: null })
    kick()
    return { job: updated }
  })

  app.delete('/api/jobs/:id', async (req, reply) => {
    const id = Number(req.params.id)
    const job = getJob(id)
    if (!job) return reply.code(404).send({ error: 'job não encontrado' })
    if (isRunning(id)) cancelRunningJob(id)
    clearLog(id)
    deleteJob(id)
    return { ok: true }
  })

  app.post('/api/jobs/reorder', async (req, reply) => {
    const ids = req.body?.ids
    if (!Array.isArray(ids)) return reply.code(400).send({ error: 'ids[] obrigatório' })
    return { jobs: reorderJobs(ids.map(Number)) }
  })
}
