import fs from 'node:fs'
import path from 'node:path'
import {
  listJobs, getJob, createJob, updateJob, deleteJob, retryJob, resetJob, reorderJobs,
} from '../store/jobs.js'
import { appendLog, readLog, clearLog } from '../logger.js'
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

function normalizeOptions(o = {}) {
  return {
    makeNfo: o.makeNfo !== false,
    redundancy: o.redundancy,
    volumes: o.volumes,
    subdirs: o.subdirs,
    algorithm: o.algorithm || undefined, // undefined = usa o algoritmo global
    index: o.index !== false,
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
      options: normalizeOptions(body.options),
    })
    kick()
    return reply.code(201).send({ job })
  })

  // Cria vários jobs de uma vez (mesma categoria/opções; nome auto-derivado por item).
  app.post('/api/jobs/batch', async (req, reply) => {
    const body = req.body || {}
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return reply.code(400).send({ error: 'nenhuma origem informada' })

    const options = normalizeOptions(body.options)
    const category_id = body.category_id || null
    const created = []
    const errors = []
    for (const it of items) {
      const source = String(it?.source_path || '').trim()
      if (!source) { errors.push({ source: it?.source_path ?? '', error: 'caminho vazio' }); continue }
      if (!fs.existsSync(source)) { errors.push({ source, error: 'caminho não existe' }); continue }
      const name = (it.name || '').trim() || deriveName(source)
      created.push(createJob({ source_path: source, name, category_id, options }))
    }
    if (created.length) kick()
    return reply.code(201).send({ created, errors })
  })

  // mode=fresh: reinicia do zero (descarta etapas/artefatos e limpa o log).
  // padrão (resume): retoma da etapa que falhou, preservando o log e os artefatos.
  app.post('/api/jobs/:id/retry', async (req, reply) => {
    const job = getJob(Number(req.params.id))
    if (!job) return reply.code(404).send({ error: 'job não encontrado' })
    const fresh = req.query?.mode === 'fresh'
    let updated
    if (fresh) {
      clearLog(job.id)
      updated = resetJob(job.id)
    } else {
      appendLog(job.id, '[WORKER] ↻ retomando da última etapa não concluída')
      updated = retryJob(job.id)
    }
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
