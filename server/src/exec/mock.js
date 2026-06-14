import fs from 'node:fs'
import path from 'node:path'
import { AbortError } from './runner.js'

// Sleep que rejeita se o job for cancelado.
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new AbortError()) }, { once: true })
  })
}

async function fakeProgress(label, ms, onLine, signal) {
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps, signal)
    onLine?.(`${label}: ${i * 10}%`)
  }
}

export async function generateNfo({ source, nfoPath, onLine, signal }) {
  onLine?.('[NFO ] (mock) gerando NFO simulado')
  await sleep(400, signal)
  fs.writeFileSync(nfoPath, `MOCK NFO\nFonte: ${source}\nGerado em ${new Date().toISOString()}\n`)
  onLine?.(`[NFO ] (mock) salvo em ${nfoPath}`)
  return { video: source }
}

export async function generatePar2({ source, workDir, base, redundancy, onLine, signal }) {
  fs.mkdirSync(workDir, { recursive: true })
  onLine?.(`[PAR2] (mock) redundância ${redundancy}%`)
  await fakeProgress('[PAR2] Constructing', 2500, onLine, signal)
  const files = [
    path.join(workDir, `${base}.par2`),
    path.join(workDir, `${base}.vol00+01.par2`),
  ]
  for (const f of files) fs.writeFileSync(f, 'MOCK PAR2')
  onLine?.(`[PAR2] (mock) ${files.length} arquivo(s) gerados`)
  return files
}

export async function postNyuu({ source, par2Files, nzbPath, onLine, signal }) {
  onLine?.(`[POST] (mock) nyuu enviando "${source}" + ${par2Files.length} par2`)
  await fakeProgress('[POST] Posting', 5000, onLine, signal)
  fs.writeFileSync(
    nzbPath,
    `<?xml version="1.0"?>\n<!-- MOCK NZB para ${source} gerado em ${new Date().toISOString()} -->\n<nzb></nzb>\n`,
  )
  onLine?.(`[POST] (mock) NZB salvo em ${nzbPath}`)
  return { nzbPath }
}
