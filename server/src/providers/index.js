import * as curupira from './curupira.js'

/**
 * Registro (factory) de providers de indexador.
 *
 * Contrato universal de um provider — cada módulo exporta:
 *   id               string  identificador único
 *   label            string  nome amigável
 *   configSchema     [{ key, label, type, placeholder?, secret? }]  campos da UI
 *   defaultConfig    {}      valores iniciais da config
 *   defaultCategories[{ id, label }]  categorias sugeridas
 *   async upload({ nzbPath, nfoPath, categoryId, name, config, onLine, signal })
 *         -> { ok: boolean, status: number, body: any }
 *
 * O que é UNIVERSAL para todo provider: ele recebe um NZB, um NFO e uma categoria.
 * O que MUDA por provider: endpoint, autenticação, nomes de campo — tudo dentro de upload().
 *
 * Para adicionar um novo provider (ex: nzbgeek):
 *   1. crie providers/nzbgeek.js com as exports acima.
 *   2. importe aqui e adicione ao REGISTRY.
 */
const REGISTRY = {
  [curupira.id]: curupira,
}

export function getProvider(id) {
  const p = REGISTRY[id]
  if (!p) throw new Error(`provider de indexador desconhecido: ${id}`)
  return p
}

// Metadados de todos os providers (para a UI montar as telas dinamicamente).
export function listProviders() {
  return Object.values(REGISTRY).map((p) => ({
    id: p.id,
    label: p.label,
    configSchema: p.configSchema || [],
    defaultConfig: p.defaultConfig || {},
    defaultCategories: p.defaultCategories || [],
  }))
}

export function providerIds() {
  return Object.keys(REGISTRY)
}

// Upload simulado (modo mock) — independe do provider escolhido.
export async function mockUpload({ nzbPath, categoryId, onLine }) {
  const name = nzbPath ? nzbPath.split(/[\\/]/).pop() : 'release.nzb'
  onLine?.(`[INDEX] (mock) enviando ${name} (categoria ${categoryId})`)
  await new Promise((r) => setTimeout(r, 600))
  onLine?.('[INDEX] (mock) ✓ aceito (201)')
  return { ok: true, status: 201, body: { id: `mock-${Date.now()}`, mock: true } }
}
