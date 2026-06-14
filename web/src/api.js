async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  system: () => req('GET', '/api/system'),
  jobs: () => req('GET', '/api/jobs'),
  job: (id) => req('GET', `/api/jobs/${id}`),
  jobLog: (id) => req('GET', `/api/jobs/${id}/log`),
  createJob: (job) => req('POST', '/api/jobs', job),
  createJobsBatch: (payload) => req('POST', '/api/jobs/batch', payload),
  retryJob: (id) => req('POST', `/api/jobs/${id}/retry`),
  pauseJob: (id) => req('POST', `/api/jobs/${id}/pause`),
  resumeJob: (id) => req('POST', `/api/jobs/${id}/resume`),
  deleteJob: (id) => req('DELETE', `/api/jobs/${id}`),
  reorder: (ids) => req('POST', '/api/jobs/reorder', { ids }),
  getNyuuConfig: () => req('GET', '/api/nyuu-config'),
  saveNyuuConfig: (config) => req('PUT', '/api/nyuu-config', { config }),
  getSettings: () => req('GET', '/api/settings'),
  saveSettings: (settings) => req('PUT', '/api/settings', { settings }),
  providers: () => req('GET', '/api/providers'),
  browse: (p) => req('GET', `/api/fs?path=${encodeURIComponent(p || '')}`),
}
