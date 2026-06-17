import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import FileBrowser from '../components/FileBrowser.jsx'

const baseName = (p) => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || ''
const previewName = (it) => (it.type === 'dir' ? baseName(it.path) : baseName(it.path).replace(/\.[^.]+$/, ''))

export default function AddJobPage({ system, onCreated }) {
  const [settings, setSettings] = useState(null)
  const [sources, setSources] = useState([]) // [{ path, type }]
  const [singleName, setSingleName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [makeNfo, setMakeNfo] = useState(true)
  const [doIndex, setDoIndex] = useState(true)
  const [redundancy, setRedundancy] = useState('')
  const [volumes, setVolumes] = useState('')
  const [subdirs, setSubdirs] = useState('')
  const [algorithm, setAlgorithm] = useState('')
  const [algorithms, setAlgorithms] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getSettings().then((d) => setSettings(d.settings)).catch(() => {})
    api.algorithms().then((a) => setAlgorithms(a.algorithms)).catch(() => {})
  }, [])

  const indexer = settings?.indexer
  const provId = indexer?.provider
  const cats = indexer?.configs?.[provId]?.categories || []
  const indexerOn = !!indexer?.enabled

  const addSource = (path, type) =>
    setSources((prev) => (prev.some((s) => s.path === path) ? prev : [...prev, { path, type }]))
  const removeSource = (i) => setSources((prev) => prev.filter((_, j) => j !== i))

  // Ao ficar com exatamente 1 origem, pré-preenche o nome editável.
  useEffect(() => {
    if (sources.length === 1) setSingleName(previewName(sources[0]))
  }, [sources])

  const submit = async () => {
    setErr('')
    if (!sources.length) { setErr('adicione ao menos uma origem'); return }
    setBusy(true)
    try {
      const items = sources.map((s) => ({
        source_path: s.path,
        name: sources.length === 1 ? (singleName.trim() || undefined) : undefined,
      }))
      const res = await api.createJobsBatch({
        items,
        category_id: doIndex && indexerOn ? (categoryId || null) : null,
        options: {
          makeNfo,
          index: doIndex,
          redundancy: redundancy === '' ? undefined : Number(redundancy),
          volumes: volumes === '' ? undefined : Number(volumes),
          subdirs: subdirs || undefined,
          algorithm: algorithm || undefined,
        },
      })
      if (res.errors?.length) {
        alert('Alguns itens não foram enfileirados:\n' + res.errors.map((e) => `• ${e.source}: ${e.error}`).join('\n'))
      }
      if (res.created?.length) onCreated()
      else setErr('nenhum job foi criado')
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
        <span>Origens — clique em <b>+ adicionar</b> para empilhar quantas quiser</span>
        <FileBrowser onPick={addSource} startPath={system?.homedir} />
      </label>

      {sources.length > 0 && (
        <div className="card" style={{ background: 'var(--panel-2)', marginTop: '.25rem' }}>
          <b>{sources.length} origem(ns) selecionada(s)</b>
          <div style={{ marginTop: '.5rem' }}>
            {sources.map((s, i) => (
              <div className="cat-row" key={s.path} style={{ alignItems: 'center' }}>
                <span className="ic">{s.type === 'dir' ? '📁' : '📄'}</span>
                <span style={{ flex: 1, fontSize: '.85rem', wordBreak: 'break-all' }}>
                  <b>{previewName(s)}</b> <span className="muted">— {s.path}</span>
                </span>
                <button type="button" className="btn danger" onClick={() => removeSource(i)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid2">
        {sources.length === 1 && (
          <label className="field">
            <span>Nome do release</span>
            <input type="text" value={singleName} onChange={(e) => setSingleName(e.target.value)} placeholder="auto a partir da origem" />
          </label>
        )}
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

      <div className="grid2">
        <label className="field">
          <span>Algoritmo de paridade</span>
          <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
            <option value="">padrão ({settings?.parity?.algorithm || 'parpar'})</option>
            {algorithms.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
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
      <button className="btn primary" disabled={busy || !sources.length} onClick={submit}>
        {busy ? 'enfileirando...' : `Adicionar ${sources.length || ''} à fila`.trim()}
      </button>
    </div>
  )
}
