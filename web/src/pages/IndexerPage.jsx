import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

// Tela do indexador (factory): escolhe o provider ativo e configura dinamicamente
// os campos que ele declara (configSchema) + a lista de categorias.
export default function IndexerPage() {
  const [providers, setProviders] = useState([])
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([api.providers(), api.getSettings()])
      .then(([p, st]) => { setProviders(p.providers); setS(st.settings) })
      .catch((e) => setErr(e.message))
  }, [])

  if (!s) return <div className="empty">carregando...</div>

  const indexer = s.indexer
  const activeId = indexer.provider
  const active = providers.find((p) => p.id === activeId)
  const cfg = indexer.configs[activeId] || {}
  const cats = cfg.categories || []

  const setIndexer = (patch) => setS((prev) => ({ ...prev, indexer: { ...prev.indexer, ...patch } }))
  const setCfg = (patch) =>
    setS((prev) => ({
      ...prev,
      indexer: {
        ...prev.indexer,
        configs: { ...prev.indexer.configs, [activeId]: { ...prev.indexer.configs[activeId], ...patch } },
      },
    }))

  const setCat = (i, field, val) => setCfg({ categories: cats.map((c, j) => (j === i ? { ...c, [field]: val } : c)) })
  const addCat = () => setCfg({ categories: [...cats, { id: '', label: '' }] })
  const delCat = (i) => setCfg({ categories: cats.filter((_, j) => j !== i) })

  // Troca o provider ativo; semeia a config com os defaults se ainda não existir.
  const changeProvider = (id) => {
    setS((prev) => {
      const next = structuredClone(prev)
      next.indexer.provider = id
      if (!next.indexer.configs[id]) {
        const def = providers.find((p) => p.id === id)
        next.indexer.configs[id] = { ...(def?.defaultConfig || {}), categories: def?.defaultCategories || [] }
      }
      return next
    })
  }

  const save = async () => {
    setErr(''); setMsg('')
    try {
      const { settings } = await api.saveSettings(s)
      setS(settings); setMsg('Salvo!')
    } catch (e) {
      setErr('Erro: ' + e.message)
    }
  }

  return (
    <div className="card">
      <h2>Indexador</h2>
      <label className="row" style={{ marginBottom: '1rem' }}>
        <input type="checkbox" checked={!!indexer.enabled} onChange={(e) => setIndexer({ enabled: e.target.checked })} />
        Enviar NZBs para o indexador após postar
      </label>

      <label className="field">
        <span>Provider</span>
        <select value={activeId} onChange={(e) => changeProvider(e.target.value)}>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>

      {active?.configSchema.map((f) => (
        <label className="field" key={f.key}>
          <span>{f.label}</span>
          <input
            type={f.type === 'password' ? 'password' : 'text'}
            value={cfg[f.key] ?? ''}
            placeholder={f.placeholder || (f.secret ? '(inalterado)' : '')}
            onChange={(e) => setCfg({ [f.key]: e.target.value })}
          />
        </label>
      ))}

      <span className="muted">Categorias (id → rótulo)</span>
      <div style={{ marginTop: '.5rem' }}>
        {cats.map((c, i) => (
          <div className="cat-row" key={i}>
            <input type="text" value={c.id} onChange={(e) => setCat(i, 'id', e.target.value)} placeholder="id (ex: 2040)" />
            <input type="text" value={c.label} onChange={(e) => setCat(i, 'label', e.target.value)} placeholder="rótulo" />
            <button className="btn danger" onClick={() => delCat(i)}>×</button>
          </div>
        ))}
        <button className="btn" onClick={addCat}>+ categoria</button>
      </div>

      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <button className="btn primary" onClick={save} style={{ marginTop: '1rem' }}>Salvar</button>
    </div>
  )
}
