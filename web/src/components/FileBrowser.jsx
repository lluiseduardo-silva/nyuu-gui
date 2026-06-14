import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'

// Navegador de arquivos do servidor. Cada "adicionar" chama onPick(path, type)
// sem perder a posição de navegação — dá pra acumular várias origens.
// Tem busca parcial (client-side) sobre os itens da pasta atual.
export default function FileBrowser({ onPick, startPath }) {
  const [cur, setCur] = useState(null)
  const [err, setErr] = useState('')
  const [typed, setTyped] = useState(startPath || '')
  const [filter, setFilter] = useState('')

  const load = (p) => {
    api.browse(p)
      .then((d) => { setCur(d); setTyped(d.path); setErr(''); setFilter('') })
      .catch((e) => setErr(e.message))
  }
  useEffect(() => { load(startPath || '') }, []) // eslint-disable-line

  const entries = useMemo(() => {
    if (!cur) return []
    const q = filter.trim().toLowerCase()
    if (!q) return cur.entries
    return cur.entries.filter((e) => e.name.toLowerCase().includes(q))
  }, [cur, filter])

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
          <div className="filterbar">
            <input
              type="text" value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filtrar nesta pasta..."
            />
            {filter && <button type="button" className="btn" onClick={() => setFilter('')}>limpar</button>}
            <span className="muted count">{entries.length} de {cur.entries.length}</span>
          </div>
          <div className="list">
            {entries.map((e) => (
              <div key={e.path} className="item" onClick={() => (e.type === 'dir' ? load(e.path) : onPick(e.path, 'file'))}>
                <span className="ic">{e.type === 'dir' ? '📁' : '📄'}</span>
                <span>{e.name}</span>
                <button type="button" className="btn pick" onClick={(ev) => { ev.stopPropagation(); onPick(e.path, e.type) }}>+ adicionar</button>
              </div>
            ))}
            {cur.entries.length === 0 && <div className="empty">pasta vazia</div>}
            {cur.entries.length > 0 && entries.length === 0 && <div className="empty">nenhum item corresponde ao filtro</div>}
          </div>
        </div>
      )}
    </div>
  )
}
