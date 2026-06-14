import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

// Tela dedicada: editor JSON puro do arquivo de config do nyuu (nyuu.json).
export default function NyuuConfigPage() {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api.getNyuuConfig()
      .then(({ config }) => { setText(JSON.stringify(config, null, 2)); setLoaded(true) })
      .catch((e) => setErr(e.message))
  }, [])

  const save = async () => {
    setErr(''); setMsg('')
    let config
    try {
      config = JSON.parse(text)
    } catch (e) {
      setErr('JSON inválido: ' + e.message)
      return
    }
    try {
      const { config: saved } = await api.saveNyuuConfig(config)
      setText(JSON.stringify(saved, null, 2))
      setMsg('Salvo!')
    } catch (e) {
      setErr('Erro: ' + e.message)
    }
  }

  if (!loaded && !err) return <div className="empty">carregando...</div>

  return (
    <div className="card">
      <h2>Config do nyuu — <code>nyuu.json</code></h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Editor JSON do arquivo que o nyuu lê via <code>-C</code>. A senha aparece mascarada
        (<code>••••••••</code>); deixe assim para mantê-la inalterada.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 440 }} spellCheck={false} />
      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <button className="btn primary" onClick={save} style={{ marginTop: '.5rem' }}>Salvar</button>
    </div>
  )
}
