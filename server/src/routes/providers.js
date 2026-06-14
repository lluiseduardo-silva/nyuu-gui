import { listProviders } from '../providers/index.js'

// Lista os providers de indexador disponíveis (para a UI montar as telas).
export function registerProviders(app) {
  app.get('/api/providers', async () => ({ providers: listProviders() }))
}
