import fs from 'node:fs'
import { NYUU_CONFIG_PATH } from '../config.js'

export const SECRET_MASK = '••••••••'

// Config padrão do nyuu, baseada no config-sample.json do projeto.
function sample() {
  return {
    host: '',
    port: 563,
    ssl: true,
    'ignore-cert': false,
    user: '',
    password: '',
    connections: 10,
    'article-size': 716800,
    from: '',
    groups: 'alt.binaries.test',
    comment: '',
    'check-connections': 1,
    'check-tries': 2,
    'check-delay': 5000,
    'check-retry-delay': 30000,
    'skip-errors': false,
  }
}

export function getNyuuConfig() {
  if (!fs.existsSync(NYUU_CONFIG_PATH)) return sample()
  try {
    return JSON.parse(fs.readFileSync(NYUU_CONFIG_PATH, 'utf8'))
  } catch {
    return sample()
  }
}

export function saveNyuuConfig(incoming) {
  const current = getNyuuConfig()
  const next = { ...incoming }
  // Preserva a senha quando o frontend manda o valor mascarado.
  if (next.password === SECRET_MASK || next.password === undefined) {
    next.password = current.password ?? ''
  }
  fs.writeFileSync(NYUU_CONFIG_PATH, JSON.stringify(next, null, 2))
  return next
}

export function getNyuuConfigRedacted() {
  const c = getNyuuConfig()
  return { ...c, password: c.password ? SECRET_MASK : '' }
}

// Garante que existe um nyuu.json em disco (o nyuu lê via -C <arquivo>).
export function ensureNyuuConfigFile() {
  if (!fs.existsSync(NYUU_CONFIG_PATH)) {
    fs.writeFileSync(NYUU_CONFIG_PATH, JSON.stringify(sample(), null, 2))
  }
  return NYUU_CONFIG_PATH
}
