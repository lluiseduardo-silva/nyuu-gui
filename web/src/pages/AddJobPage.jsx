import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import FileBrowser from '../components/FileBrowser.jsx'

export default function AddJobPage({ system, onCreated }) {
  const [settings, setSettings] = useState(null)
  const [source, setSource] = useState('')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [makeNfo, setMakeNfo] = useState(true)
  const [doIndex, setDoIndex] = useState(true)
  const [redundancy, setRedundancy] = useState('')
  const [volumes, setVolumes] = useState('')
  const [subdirs, setSubdirs] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.getSettings().then((d) => setSettings(d.settings)).catch(() => {}) }, [])

  const indexer = settings?.indexer
  const provId = indexer?.provider
  const cats = indexer?.configs?.[provId]?.categories || []
  const indexerOn = !!indexer?.enabled

  const pick = (p) => {
    setSource(p)
    const base = p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || ''
    setName(base.replace(/\.[^.]+$/, ''))
  }

  const submit = async () => {
    setErr('')
    if (!source) { setErr('escolha uma origem'); return }
    setBusy(true)
    try {
      await api.createJob({
        source_path: source,
        name: name.trim() || undefined,
        category_id: doIndex && indexerOn ? (categoryId || null) : null,
        options: {
          makeNfo,
          index: doIndex,
          redundancy: redundancy === '' ? undefined : Number(redundancy),
          volumes: volumes === '' ? undefined : Number(volumes),
          subdirs: subdirs || undefined,
        },
      })
      onCreated()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Novo backup</h2>
      <label className="field">
        <span>Origem (pasta ou arquivo)</span>
        <FileBrowser value={source} onChange={pick} startPath={system?.homedir} />
      </label>

      <div className="grid2">
        <label className="field">
          <span>Nome do release</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="auto a partir da origem" />
        </label>
        <label className="field">
          <span>Categoria {provId ? `(${provId})` : ''}</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!doIndex || !indexerOn}>
            <option value="">— sem categoria —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.id})</option>)}
          </select>
        </label>
      </div>

      <div className="grid3">
        <label className="field">
          <span>Redundância par2 (%)</span>
          <input type="number" value={redundancy} onChange={(e) => setRedundancy(e.target.value)} placeholder={`padrão ${settings?.par2?.redundancy ?? 10}`} />
        </label>
        <label className="field">
          <span>Volumes par2</span>
          <input type="number" value={volumes} onChange={(e) => setVolumes(e.target.value)} placeholder={`padrão ${settings?.par2?.volumes ?? 7}`} />
        </label>
        <label className="field">
          <span>Subpastas</span>
          <select value={subdirs} onChange={(e) => setSubdirs(e.target.value)}>
            <option value="">padrão ({settings?.post?.subdirs || 'keep'})</option>
            <option value="keep">keep</option>
            <option value="include">include</option>
            <option value="skip">skip</option>
          </select>
        </label>
      </div>

      <label className="row" style={{ marginBottom: '.6rem' }}>
        <input type="checkbox" checked={makeNfo} onChange={(e) => setMakeNfo(e.target.checked)} /> Gerar NFO (mediainfo)
      </label>
      <label className="row" style={{ marginBottom: '1rem' }}>
        <input type="checkbox" checked={doIndex} onChange={(e) => setDoIndex(e.target.checked)} disabled={!indexerOn} />
        Enviar pro indexador após postar {indexerOn ? '' : '(ative o indexador na aba Indexador)'}
      </label>

      {err && <div className="error">{err}</div>}
      <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'enfileirando...' : 'Adicionar à fila'}</button>
    </div>
  )
}
