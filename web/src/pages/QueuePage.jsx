import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import LogModal from '../components/LogModal.jsx'
import StageTracker from '../components/StageTracker.jsx'
import { formatDuration, jobElapsed } from '../format.js'

const STATUS = {
  queued: 'Na fila', running: 'Rodando', paused: 'Pausado', done: 'Concluído', failed: 'Falhou',
}

const FILTERS = [
  { id: 'active', label: 'Ativos', match: (j) => ['queued', 'running', 'paused'].includes(j.status) },
  { id: 'done', label: 'Concluídos', match: (j) => j.status === 'done' },
  { id: 'failed', label: 'Falhas', match: (j) => j.status === 'failed' },
  { id: 'all', label: 'Todos', match: () => true },
]
const FILTER_KEY = 'nyuu.queueFilter'

export default function QueuePage({ jobs, setJobs }) {
  const [logJob, setLogJob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState(() => localStorage.getItem(FILTER_KEY) || 'active')

  // Relógio de 1s só enquanto houver job rodando (para o tempo decorrido ao vivo).
  const hasRunning = jobs.some((j) => j.status === 'running')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!hasRunning) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [hasRunning])

  useEffect(() => { localStorage.setItem(FILTER_KEY, filter) }, [filter])

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, jobs.filter(f.match).length])),
    [jobs],
  )
  const current = FILTERS.find((f) => f.id === filter) || FILTERS[0]
  const shown = jobs.filter(current.match)

  const act = async (fn) => {
    setBusy(true)
    try { await fn() } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  const move = async (id, dir) => {
    const ids = jobs.map((j) => j.id)
    const i = ids.indexOf(id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const { jobs: updated } = await api.reorder(ids)
    setJobs(updated.sort((a, b) => a.position - b.position))
  }

  if (!jobs.length) {
    return <div className="empty">Nenhum backup na fila. Vá em <b>+ Novo backup</b> para adicionar.</div>
  }

  return (
    <div>
      <div className="queue-filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? 'active' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="cnt">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {!shown.length && <div className="empty">Nenhum item neste filtro.</div>}

      {shown.map((job) => {
        const elapsed = jobElapsed(job, now)
        const failedStage = Array.isArray(job.stages) ? job.stages.find((s) => s.status === 'failed') : null
        return (
          <div className="card job" key={job.id}>
            <div className="job-head">
              <span className="pos">#{job.position}</span>
              <span className="name">{job.name}</span>
              <span className={`badge ${job.status}`}>{STATUS[job.status] || job.status}</span>
              <div className="actions">
                {job.status === 'running' && (
                  <button className="btn" disabled={busy} onClick={() => act(() => api.pauseJob(job.id))}>pausar</button>
                )}
                {job.status === 'queued' && (
                  <>
                    <button className="btn icon" onClick={() => move(job.id, 'up')}>↑</button>
                    <button className="btn icon" onClick={() => move(job.id, 'down')}>↓</button>
                    <button className="btn" disabled={busy} onClick={() => act(() => api.pauseJob(job.id))}>pausar</button>
                  </>
                )}
                {job.status === 'paused' && (
                  <button className="btn primary" disabled={busy} onClick={() => act(() => api.resumeJob(job.id))}>retomar</button>
                )}
                {job.status === 'failed' && (
                  <>
                    <button className="btn primary" disabled={busy} onClick={() => act(() => api.retryJob(job.id))}>
                      {failedStage ? `retomar (${failedStage.label})` : 'retomar'}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => act(() => api.resetJob(job.id))}>reiniciar do zero</button>
                  </>
                )}
                {job.status === 'done' && (
                  <button className="btn" disabled={busy} onClick={() => act(() => api.resetJob(job.id))}>repostar</button>
                )}
                <button className="btn" onClick={() => setLogJob(job)}>log</button>
                {job.status !== 'running' && (
                  <button className="btn danger" disabled={busy}
                    onClick={() => act(async () => { if (confirm('Remover este job?')) await api.deleteJob(job.id) })}>
                    remover
                  </button>
                )}
              </div>
            </div>
            <div className="src">{job.source_path}</div>

            {Array.isArray(job.stages) && job.stages.length ? (
              <StageTracker stages={job.stages} now={now} />
            ) : (
              job.status === 'running' && (
                <div className={`bar ${job.progress ? '' : 'indeterminate'}`}>
                  <i style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} />
                </div>
              )
            )}

            <div className="job-meta">
              {elapsed != null && <span className="time">⏱ {formatDuration(elapsed)}</span>}
              {job.category_id && <span>categoria {job.category_id}</span>}
              {job.nzb_path && <span>NZB ✓</span>}
              {job.result?.body?.id && <span>Curupira: {String(job.result.body.id)}</span>}
              {job.error && <span className="error">erro: {job.error}</span>}
            </div>
          </div>
        )
      })}
      {logJob && <LogModal job={logJob} onClose={() => setLogJob(null)} />}
    </div>
  )
}
