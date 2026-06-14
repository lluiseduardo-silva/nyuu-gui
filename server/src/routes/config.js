import { getNyuuConfigRedacted, saveNyuuConfig } from '../store/nyuuConfig.js'

export function registerConfig(app) {
  // Config do nyuu (nyuu.json) — senha mascarada na leitura.
  app.get('/api/nyuu-config', async () => ({ config: getNyuuConfigRedacted() }))

  app.put('/api/nyuu-config', async (req, reply) => {
    const incoming = req.body?.config
    if (!incoming || typeof incoming !== 'object') {
      return reply.code(400).send({ error: 'config inválida' })
    }
    saveNyuuConfig(incoming)
    return { config: getNyuuConfigRedacted() }
  })
}
