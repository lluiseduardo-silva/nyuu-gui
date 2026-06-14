import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(__dirname, '..')

export const PORT = Number(process.env.PORT) || 8787

// Diretório de dados persistentes (db, nyuu.json, logs). Configurável via DATA_DIR.
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(serverRoot, 'data')

export const LOGS_DIR = path.join(DATA_DIR, 'logs')
export const DB_PATH = path.join(DATA_DIR, 'nyuu-gui.db')
export const NYUU_CONFIG_PATH = path.join(DATA_DIR, 'nyuu.json')

// Raiz do frontend buildado (servido em produção).
export const WEB_DIST = path.resolve(serverRoot, '..', 'web', 'dist')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(LOGS_DIR, { recursive: true })

export const IS_WINDOWS = process.platform === 'win32'

// O modo mock simula nyuu/par2/mediainfo sem precisar dos binários.
// Liga sozinho no Windows; MOCK=1/0 força o comportamento.
export function resolveMockDefault() {
  if (process.env.MOCK === '1') return true
  if (process.env.MOCK === '0') return false
  return IS_WINDOWS
}
