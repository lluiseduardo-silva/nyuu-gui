import { getSettingsRedacted, updateSettings } from '../store/settings.js'
import { kick } from '../queue/worker.js'

export function registerSettings(app) {
  app.get('/api/settings', async () => ({ settings: getSettingsRedacted() }))

  app.put('/api/settings', async (req, reply) => {
    const patch = req.body?.settings
    if (!patch || typeof patch !== 'object') {
      return reply.code(400).send({ error: 'settings inválido' })
    }
    updateSettings(patch)
    kick() // concorrência pode ter mudado
    return { settings: getSettingsRedacted() }
  })
}
