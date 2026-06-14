import { spawn, spawnSync } from 'node:child_process'

class AbortError extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
    this.aborted = true
  }
}

// Roda um comando streamando linhas de stdout+stderr.
// onLine(line) é chamado por linha (split em \n e \r, p/ capturar barras de progresso).
// signal (AbortSignal) mata o processo. Resolve { code }; rejeita AbortError se cancelado.
export function run(cmd, args, { cwd, onLine, env, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())

    const child = spawn(cmd, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      windowsHide: true,
    })

    let buf = ''
    const handle = (chunk) => {
      buf += chunk.toString('utf8')
      const parts = buf.split(/\r\n|\r|\n/)
      buf = parts.pop() ?? ''
      for (const p of parts) {
        const line = p.trim()
        if (line) onLine?.(line)
      }
    }
    child.stdout.on('data', handle)
    child.stderr.on('data', handle)

    let killedByAbort = false
    const onAbort = () => {
      killedByAbort = true
      child.kill('SIGTERM')
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    child.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (buf.trim()) onLine?.(buf.trim())
      if (killedByAbort) return reject(new AbortError())
      resolve({ code })
    })
  })
}

// Roda capturando stdout/stderr completos (para mediainfo, cuja saída É o NFO).
export function runCapture(cmd, args, { cwd, env, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError())
    const child = spawn(cmd, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += c.toString('utf8')))
    child.stderr.on('data', (c) => (stderr += c.toString('utf8')))

    let killedByAbort = false
    const onAbort = () => {
      killedByAbort = true
      child.kill('SIGTERM')
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    child.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (killedByAbort) return reject(new AbortError())
      resolve({ code, stdout, stderr })
    })
  })
}

// Verifica se um binário existe (chamando --version).
export function binaryAvailable(bin) {
  try {
    const r = spawnSync(bin, ['--version'], { windowsHide: true, timeout: 5000 })
    if (r.error && r.error.code === 'ENOENT') return false
    return !r.error
  } catch {
    return false
  }
}

export { AbortError }
