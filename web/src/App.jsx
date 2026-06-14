import React, { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import { useEvents } from './useEvents.js'
import QueuePage from './pages/QueuePage.jsx'
import AddJobPage from './pages/AddJobPage.jsx'
import IndexerPage from './pages/IndexerPage.jsx'
import GeneralPage from './pages/GeneralPage.jsx'
import NyuuConfigPage from './pages/NyuuConfigPage.jsx'

const TABS = [
  { id: 'queue', label: 'Fila' },
  { id: 'add', label: '+ Novo backup' },
  { id: 'indexer', label: 'Indexador' },
  { id: 'general', label: 'Geral' },
  { id: 'nyuu', label: 'Config nyuu' },
]

const byPos = (a, b) => a.position - b.position || a.id - b.id

export default function App() {
  const [tab, setTab] = useState('queue')
  const [jobs, setJobs] = useState([])
  const [system, setSystem] = useState(null)

  const refresh = useCallback(async () => {
    const { jobs } = await api.jobs()
    setJobs(jobs.sort(byPos))
  }, [])

  const loadSystem = useCallback(async () => {
    try { setSystem(await api.system()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    refresh()
    loadSystem()
  }, [refresh, loadSystem])

  const connected = useEvents((ev) => {
    setJobs((prev) => {
      if (ev.type === 'job:update' && ev.job) {
        const i = prev.findIndex((j) => j.id === ev.job.id)
        const next = i === -1 ? [...prev, ev.job] : prev.map((j) => (j.id === ev.job.id ? ev.job : j))
        return next.sort(byPos)
      }
      if (ev.type === 'job:delete') return prev.filter((j) => j.id !== ev.id)
      if (ev.type === 'job:progress') {
        return prev.map((j) => (j.id === ev.id ? { ...j, stage: ev.stage, progress: ev.progress } : j))
      }
      return prev
    })
  })

  const activeCount = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length

  return (
    <div className="app">
      <header className="top">
        <span className="brand">Nyuu GUI <small>backups Usenet</small></span>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'queue' && activeCount ? ` (${activeCount})` : ''}
            </button>
          ))}
        </nav>
        <span title={connected ? 'conectado ao servidor' : 'desconectado'} className={`dot ${connected ? 'on' : 'off'}`} />
      </header>

      {system?.mock && (
        <div className="banner">
          ⚙️ <b>Modo MOCK ativo</b> — nyuu/par2/mediainfo são simulados (ideal para testar no Windows).
          Desative na aba <b>Geral</b> quando rodar no servidor com os binários reais.
        </div>
      )}

      {tab === 'queue' && <QueuePage jobs={jobs} setJobs={setJobs} />}
      {tab === 'add' && <AddJobPage system={system} onCreated={() => { refresh(); setTab('queue') }} />}
      {tab === 'indexer' && <IndexerPage />}
      {tab === 'general' && <GeneralPage onSaved={loadSystem} />}
      {tab === 'nyuu' && <NyuuConfigPage />}
    </div>
  )
}
