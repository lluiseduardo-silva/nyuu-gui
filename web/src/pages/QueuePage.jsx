import React, { useState } from 'react'
import { api } from '../api.js'
import LogModal from '../components/LogModal.jsx'

const STATUS = {
  queued: 'Na fila', running: 'Rodando', paused: 'Pausado', done: 'Concluído', failed: 'Falhou',
}
const STAGE = {
  nfo: 'Gerando NFO', par2: 'Gerando PAR2', posting: 'Postando (nyuu)', indexing: 'Indexando (Curupira)',
}

export default function QueuePage({ jobs, setJobs }) {
  const [logJob, setLogJob] = useState(null)
  const [busy, setBusy] = useState(false)

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
      {jobs.map((job) => (
        <div className="card job" key={job.id}>
          <div className="job-head">
            <span className="pos">#{job.position}</span>
            <span className="name">{job.name}</span>
            <span className={`badge ${job.status}`}>{STATUS[job.status] || job.status}</span>
            {job.status === 'running' && job.stage && (
              <span className="stage-tag">{STAGE[job.stage] || job.stage}</span>
            )}
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
                <button className="btn primary" disabled={busy} onClick={() => act(() => api.retryJob(job.id))}>tentar de novo</button>
              )}
              {job.status === 'done' && (
                <button className="btn" disabled={busy} onClick={() => act(() => api.retryJob(job.id))}>repostar</button>
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
          {job.status === 'running' && (
            <div className={`bar ${job.progress ? '' : 'indeterminate'}`}>
              <i style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} />
            </div>
          )}
          <div className="job-meta">
            {job.category_id && <span>categoria {job.category_id}</span>}
            {job.nzb_path && <span>NZB ✓</span>}
            {job.result?.body?.id && <span>Curupira: {String(job.result.body.id)}</span>}
            {job.error && <span className="error">erro: {job.error}</span>}
          </div>
        </div>
      ))}
      {logJob && <LogModal job={logJob} onClose={() => setLogJob(null)} />}
    </div>
  )
}
