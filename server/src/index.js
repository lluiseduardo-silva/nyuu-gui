import fs from 'node:fs'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { PORT, WEB_DIST } from './config.js'
import { migrate } from './db.js'
import { ensureNyuuConfigFile } from './store/nyuuConfig.js'
import { startWorker } from './queue/worker.js'
import { registerEvents } from './routes/events.js'
import { registerJobs } from './routes/jobs.js'
import { registerConfig } from './routes/config.js'
import { registerSettings } from './routes/settings.js'
import { registerSystem } from './routes/system.js'
import { registerFs } from './routes/fs.js'
import { registerProviders } from './routes/providers.js'

migrate()
ensureNyuuConfigFile()

const app = Fastify({
  logger: { level: 'info' },
  bodyLimit: 5 * 1024 * 1024,
})

registerEvents(app)
registerJobs(app)
registerConfig(app)
registerSettings(app)
registerSystem(app)
registerFs(app)
registerProviders(app)

// Em produção, serve o frontend buildado (web/dist) e faz fallback SPA.
if (fs.existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST })
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url || ''
    if (url.startsWith('/api') || url.startsWith('/events')) {
      return reply.code(404).send({ error: 'not found' })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.log.warn('web/dist não encontrado — rode o frontend via Vite (npm run dev) ou faça o build.')
}

startWorker()

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  app.log.info(`Nyuu GUI no ar em http://localhost:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
