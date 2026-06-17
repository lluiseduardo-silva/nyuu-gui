import os from 'node:os'
import { getSettings } from '../store/settings.js'
import { binaryAvailable, listAlgorithms } from '../exec/index.js'
import { DATA_DIR, IS_WINDOWS } from '../config.js'

export function registerSystem(app) {
  app.get('/api/system', async () => {
    const s = getSettings()
    // Binários dos algoritmos de paridade (par2, parpar, ...) vêm do registry.
    const algoBinKeys = [...new Set(listAlgorithms().map((a) => a.binKey))]
    const binaries = s.mock
      ? {
          nyuu: 'mock', mediainfo: 'mock',
          ...Object.fromEntries(algoBinKeys.map((k) => [k, 'mock'])),
        }
      : {
          nyuu: binaryAvailable(s.bin.nyuu),
          mediainfo: binaryAvailable(s.bin.mediainfo),
          ...Object.fromEntries(algoBinKeys.map((k) => [k, binaryAvailable(s.bin[k])])),
        }
    return {
      mock: s.mock,
      platform: process.platform,
      isWindows: IS_WINDOWS,
      dataDir: DATA_DIR,
      homedir: os.homedir(),
      mem: {
        totalMB: Math.round(os.totalmem() / 1048576),
        freeMB: Math.round(os.freemem() / 1048576),
      },
      binaries,
    }
  })
}
