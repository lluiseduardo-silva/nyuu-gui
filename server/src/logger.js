import fs from 'node:fs'
import path from 'node:path'
import { LOGS_DIR } from './config.js'
import { emit } from './events.js'

function logPath(jobId) {
  return path.join(LOGS_DIR, `job-${jobId}.log`)
}

// Acrescenta uma linha ao log do job e dispara evento de SSE.
export function appendLog(jobId, line, { silent = false } = {}) {
  const stamp = new Date().toISOString()
  const text = `[${stamp}] ${line}\n`
  fs.appendFileSync(logPath(jobId), text)
  if (!silent) emit({ type: 'job:log', id: jobId, line: `${stamp} ${line}` })
}

export function readLog(jobId, { tailBytes = 200_000 } = {}) {
  const p = logPath(jobId)
  if (!fs.existsSync(p)) return ''
  const stat = fs.statSync(p)
  if (stat.size <= tailBytes) return fs.readFileSync(p, 'utf8')
  const fd = fs.openSync(p, 'r')
  try {
    const buf = Buffer.alloc(tailBytes)
    fs.readSync(fd, buf, 0, tailBytes, stat.size - tailBytes)
    return buf.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

export function clearLog(jobId) {
  const p = logPath(jobId)
  if (fs.existsSync(p)) fs.rmSync(p)
}
