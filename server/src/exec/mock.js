import fs from 'node:fs'
import path from 'node:path'
import { AbortError } from './runner.js'
import { emptyDir } from './tools.js'

// Sleep que rejeita se o job for cancelado.
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())
    const onAbort = () => { clearTimeout(t); reject(new AbortError()) }
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
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

export async function generatePar2({ source, workDir, base, redundancy, algorithm, onLine, signal }) {
  fs.mkdirSync(workDir, { recursive: true })
  emptyDir(workDir) // idempotência: começa de um workdir limpo (igual ao caminho real)
  onLine?.(`[PAR2] (mock) ${algorithm || 'parpar'} redundância ${redundancy}%`)
  await fakeProgress('[PAR2] Constructing', 2500, onLine, signal)
  const files = [
    path.join(workDir, `${base}.par2`),
    path.join(workDir, `${base}.vol00+01.par2`),
  ]
  for (const f of files) fs.writeFileSync(f, 'MOCK PAR2')
  onLine?.(`[PAR2] (mock) ${files.length} arquivo(s) gerados`)
  return files
}

// NZB simulado com um <file> por input (suficiente p/ exercitar o merge do two-pass).
// O message-id inclui o nome do NZB para ser único entre invocações (igual ao nyuu real).
function mockNzb(inputs, nzbPath) {
  const tag = String(nzbPath).split(/[\\/]/).pop()?.replace(/\W+/g, '') || 'nzb'
  const files = inputs
    .map((p, i) => {
      const name = String(p).split(/[\\/]/).pop() || `input${i}`
      return (
        `  <file subject="${name}" date="0" poster="mock">\n` +
        `    <segments>\n      <segment bytes="1" number="1">${tag}-${i}@nyuu-gui</segment>\n    </segments>\n` +
        `  </file>`
      )
    })
    .join('\n')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">\n` +
    `  <head><meta type="generator">nyuu-gui (mock)</meta></head>\n` +
    `${files}\n</nzb>\n`
  )
}

export async function postNyuuInputs({ inputs, nzbPath, onLine, signal }) {
  onLine?.(`[POST] (mock) nyuu enviando ${inputs.length} input(s)`)
  await fakeProgress('[POST] Posting', 3000, onLine, signal)
  fs.writeFileSync(nzbPath, mockNzb(inputs, nzbPath))
  onLine?.(`[POST] (mock) NZB salvo em ${nzbPath}`)
  return { nzbPath }
}

export async function postNyuu({ source, par2Files, nzbPath, onLine, signal }) {
  onLine?.(`[POST] (mock) nyuu enviando "${source}" + ${par2Files.length} par2`)
  return postNyuuInputs({ inputs: [source, ...par2Files], nzbPath, onLine, signal })
}
