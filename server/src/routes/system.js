import os from 'node:os'
import { getSettings } from '../store/settings.js'
import { binaryAvailable } from '../exec/index.js'
import { DATA_DIR, IS_WINDOWS } from '../config.js'

export function registerSystem(app) {
  app.get('/api/system', async () => {
    const s = getSettings()
    const binaries = s.mock
      ? { nyuu: 'mock', par2: 'mock', mediainfo: 'mock' }
      : {
          nyuu: binaryAvailable(s.bin.nyuu),
          par2: binaryAvailable(s.bin.par2),
          mediainfo: binaryAvailable(s.bin.mediainfo),
        }
    return {
      mock: s.mock,
      platform: process.platform,
      isWindows: IS_WINDOWS,
      dataDir: DATA_DIR,
      homedir: os.homedir(),
      binaries,
    }
  })
}
