// Roda backend (Fastify) e frontend (Vite) juntos em dev, com logs prefixados.
// Substitui a dependência `concurrently` por spawn nativo (sem dependências de root).
import { spawn } from 'node:child_process'

const procs = [
  ['server', ['--prefix', 'server', 'run', 'dev']],
  ['web', ['--prefix', 'web', 'run', 'dev']],
]

const children = procs.map(([name, args]) => {
  const child = spawn('npm', args, { stdio: 'pipe', shell: true })
  const tag = (chunk) =>
    chunk.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`))
  child.stdout.on('data', tag)
  child.stderr.on('data', tag)
  child.on('exit', (code) => {
    console.log(`[${name}] encerrou (código ${code})`)
    shutdown()
  })
  return child
})

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) {
    try { c.kill() } catch { /* noop */ }
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
