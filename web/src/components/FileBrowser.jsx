import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

// Navegador de arquivos do servidor. Cada "adicionar" chama onPick(path, type)
// sem perder a posição de navegação — dá pra acumular várias origens.
export default function FileBrowser({ onPick, startPath }) {
  const [cur, setCur] = useState(null)
  const [err, setErr] = useState('')
  const [typed, setTyped] = useState(startPath || '')

  const load = (p) => {
    api.browse(p)
      .then((d) => { setCur(d); setTyped(d.path); setErr('') })
      .catch((e) => setErr(e.message))
  }
  useEffect(() => { load(startPath || '') }, []) // eslint-disable-line

  return (
    <div>
      <div className="cat-row">
        <input
          type="text" value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(typed)}
          placeholder="digite um caminho e Enter..."
        />
        <button type="button" className="btn" onClick={() => load(typed)}>Ir</button>
      </div>
      {err && <div className="error">{err}</div>}
      {cur && (
        <div className="browser">
          <div className="path">
            <button type="button" className="btn" disabled={!cur.parent} onClick={() => load(cur.parent)}>⬆ acima</button>
            <button type="button" className="btn primary" onClick={() => onPick(cur.path, 'dir')}>+ adicionar esta pasta</button>
          </div>
          <div className="list">
            {cur.entries.map((e) => (
              <div key={e.path} className="item" onClick={() => (e.type === 'dir' ? load(e.path) : onPick(e.path, 'file'))}>
                <span className="ic">{e.type === 'dir' ? '📁' : '📄'}</span>
                <span>{e.name}</span>
                <button type="button" className="btn pick" onClick={(ev) => { ev.stopPropagation(); onPick(e.path, e.type) }}>+ adicionar</button>
              </div>
            ))}
            {cur.entries.length === 0 && <div className="empty">pasta vazia</div>}
          </div>
        </div>
      )}
    </div>
  )
}
