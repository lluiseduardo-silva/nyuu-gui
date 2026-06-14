import fs from 'node:fs'
import path from 'node:path'

// Provider do indexador Curupira.
// Implementa o contrato universal definido em providers/index.js.
export const id = 'curupira'
export const label = 'Curupira'

// Campos de configuração que este provider precisa (renderizados na UI).
// secret:true => mascarado na API e preservado quando reenviado mascarado.
export const configSchema = [
  { key: 'baseUrl', label: 'Base URL', type: 'url', placeholder: 'https://curupira.cc' },
  { key: 'apiKey', label: 'API Key', type: 'password', secret: true },
]

export const defaultConfig = { baseUrl: 'https://curupira.cc', apiKey: '' }

export const defaultCategories = [
  { id: '2040', label: 'Movies / HD' },
  { id: '2045', label: 'Movies / UHD' },
  { id: '5040', label: 'TV / HD' },
  { id: '5045', label: 'TV / UHD' },
]

// upload(release, config) — release = { nzbPath, nfoPath, categoryId, name }
// POST {baseUrl}/v1/releases?apikey=...  (multipart: nzb_file, category_id, nfo_file)
export async function upload({ nzbPath, nfoPath, categoryId, config, onLine, signal }) {
  if (!fs.existsSync(nzbPath)) throw new Error(`NZB não encontrado: ${nzbPath}`)
  const baseUrl = (config.baseUrl || 'https://curupira.cc').replace(/\/+$/, '')
  const apiKey = config.apiKey || ''

  const fd = new FormData()
  const nzbBuf = await fs.promises.readFile(nzbPath)
  fd.append('nzb_file', new Blob([nzbBuf], { type: 'application/x-nzb' }), path.basename(nzbPath))
  fd.append('category_id', String(categoryId ?? ''))

  if (nfoPath && fs.existsSync(nfoPath)) {
    const nfoBuf = await fs.promises.readFile(nfoPath)
    fd.append('nfo_file', new Blob([nfoBuf], { type: 'text/plain' }), path.basename(nfoPath))
    onLine?.(`[INDEX] NFO incluído: ${path.basename(nfoPath)}`)
  }

  const url = `${baseUrl}/v1/releases?apikey=${encodeURIComponent(apiKey)}`
  onLine?.(`[INDEX] Curupira: enviando ${path.basename(nzbPath)} (categoria ${categoryId})`)

  const res = await fetch(url, { method: 'POST', body: fd, signal })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }

  const ok = res.status === 201
  if (ok) onLine?.('[INDEX] ✓ aceito pelo Curupira (201)')
  else onLine?.(`[INDEX] ✗ HTTP ${res.status}: ${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`)

  return { ok, status: res.status, body }
}
