import { listAlgorithms } from '../exec/algorithms/index.js'

// Lista os algoritmos de paridade disponíveis (para a UI montar as telas).
export function registerAlgorithms(app) {
  app.get('/api/algorithms', async () => ({ algorithms: listAlgorithms() }))
}
