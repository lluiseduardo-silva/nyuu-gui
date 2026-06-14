import { db } from '../db.js'
import { resolveMockDefault } from '../config.js'
import { listProviders } from '../providers/index.js'

const KEY = 'app'
export const SECRET_MASK = '••••••••'

// Configurações padrão da aplicação (mescladas com o que estiver salvo).
function defaults() {
  // Config inicial por provider, a partir do registro (factory).
  const configs = {}
  for (const p of listProviders()) {
    configs[p.id] = { ...p.defaultConfig, categories: p.defaultCategories }
  }
  return {
    paths: {
      outDir: '',       // pasta de saída de NZB/NFO (vazio = ./data/out)
      workDirBase: '',  // base do workdir do par2 (vazio = usa outDir)
    },
    bin: {
      nyuu: 'nyuu',
      par2: 'par2',
      mediainfo: 'mediainfo',
    },
    par2: { redundancy: 10, volumes: 7, keep: false },
    post: { subdirs: 'keep' },
    indexer: {
      enabled: false,
      provider: 'curupira', // provider ativo
      configs,              // config por provider: { [id]: { ...campos, categories } }
    },
    concurrency: 1,
    mock: resolveMockDefault(),
  }
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

// Merge profundo; arrays são substituídos por completo (não mesclados).
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v
  }
  return out
}

function load() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)
  return row ? JSON.parse(row.value) : {}
}

function save(obj) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(KEY, JSON.stringify(obj))
}

export function getSettings() {
  return deepMerge(defaults(), load())
}

export function updateSettings(patch) {
  const current = getSettings()
  // Não sobrescreve campos secretos de providers quando vierem mascarados/vazios.
  if (patch?.indexer?.configs) {
    for (const p of listProviders()) {
      const inCfg = patch.indexer.configs[p.id]
      if (!inCfg) continue
      for (const f of p.configSchema) {
        if (f.secret && (inCfg[f.key] === SECRET_MASK || inCfg[f.key] === undefined)) {
          delete inCfg[f.key]
        }
      }
    }
  }
  const next = deepMerge(current, patch)
  save(next)
  return next
}

// Versão para o frontend: mascara os campos secretos de cada provider.
export function getSettingsRedacted() {
  const s = getSettings()
  const out = structuredClone(s)
  for (const p of listProviders()) {
    const cfg = out.indexer?.configs?.[p.id]
    if (!cfg) continue
    for (const f of p.configSchema) {
      if (f.secret && cfg[f.key]) cfg[f.key] = SECRET_MASK
    }
  }
  return out
}
