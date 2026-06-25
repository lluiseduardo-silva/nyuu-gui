// Formata uma duração em ms como "1h 2m 3s" / "2m 3s" / "3s". Vazio se inválida.
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h) return `${h}h ${m}m ${s}s`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

// Tempo decorrido de um job: ao vivo enquanto 'running' (usa `now`), total quando finalizado.
export function jobElapsed(job, now) {
  if (!job?.started_at) return null
  const end = job.status === 'running' ? now : job.finished_at
  if (end == null) return null
  return end - job.started_at
}

// Duração de uma etapa do tracker: ao vivo se 'running', total se já tem finishedAt.
export function stageDuration(s, now) {
  if (s?.startedAt == null) return null
  const end = s.finishedAt ?? (s.status === 'running' ? now : null)
  if (end == null) return null
  return end - s.startedAt
}
