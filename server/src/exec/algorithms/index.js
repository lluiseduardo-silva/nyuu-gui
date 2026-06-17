import * as parpar from './parpar.js'
import * as par2cmdline from './par2cmdline.js'

/**
 * Registro (factory) de algoritmos de paridade — mesmo padrão de providers/index.js.
 *
 * Contrato de cada módulo:
 *   id            string  identificador único ('parpar', 'par2cmdline')
 *   label         string  nome amigável
 *   defaultBin    string  binário padrão ('parpar', 'par2')
 *   binKey        string  chave em settings.bin (ex: 'parpar' -> settings.bin.parpar)
 *   configSchema  [{ key, label, type, placeholder? }]  campos extras p/ a UI
 *   defaultConfig {}      valores iniciais desses campos
 *   async generate({ source, workDir, base, files, basePath,
 *                    redundancy, volumes, memoryMB, config, bin, onLine, signal })
 *         -> só monta os args do seu binário e chama run(); NÃO lista os .par2
 *            (a listagem é feita uma vez no dispatcher, em tools.generatePar2).
 *
 * Para remover um algoritmo (ex: deixar só o parpar): tire-o do REGISTRY abaixo.
 * Para adicionar outro: crie o módulo e registre aqui.
 */
const REGISTRY = {
  [parpar.id]: parpar,
  [par2cmdline.id]: par2cmdline,
}

// Algoritmo padrão da aplicação (1º do registro). O ParPar é a opção mais orgânica
// com o nyuu e ataca o gargalo de geração de paridade.
export const DEFAULT_ALGORITHM = parpar.id

export function getAlgorithm(id) {
  const a = REGISTRY[id]
  if (!a) throw new Error(`algoritmo de paridade desconhecido: ${id}`)
  return a
}

// Metadados de todos os algoritmos (para a UI montar as telas dinamicamente).
export function listAlgorithms() {
  return Object.values(REGISTRY).map((a) => ({
    id: a.id,
    label: a.label,
    defaultBin: a.defaultBin,
    binKey: a.binKey,
    configSchema: a.configSchema || [],
    defaultConfig: a.defaultConfig || {},
  }))
}

export function algorithmIds() {
  return Object.keys(REGISTRY)
}
