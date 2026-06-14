import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Navegador de diretórios para escolher a pasta/arquivo de origem na UI.
export function registerFs(app) {
  app.get('/api/fs', async (req, reply) => {
    let target = req.query.path ? String(req.query.path) : os.homedir()
    target = path.resolve(target)

    let stat
    try {
      stat = fs.statSync(target)
    } catch {
      return reply.code(400).send({ error: `caminho inacessível: ${target}` })
    }
    if (!stat.isDirectory()) target = path.dirname(target)

    let dirents
    try {
      dirents = fs.readdirSync(target, { withFileTypes: true })
    } catch (e) {
      return reply.code(400).send({ error: String(e.message) })
    }

    const entries = dirents
      .map((e) => {
        const full = path.join(target, e.name)
        let isDir = e.isDirectory()
        if (e.isSymbolicLink()) {
          try { isDir = fs.statSync(full).isDirectory() } catch { /* link quebrado */ }
        }
        return { name: e.name, path: full, type: isDir ? 'dir' : 'file' }
      })
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
      )

    const parent = path.dirname(target)
    return { path: target, parent: parent === target ? null : parent, entries }
  })
}
