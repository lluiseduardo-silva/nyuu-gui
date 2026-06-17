import path from 'node:path'
import { run } from '../runner.js'

// Algoritmo de paridade: par2cmdline (e o drop-in par2cmdline-turbo, mesma CLI).
// Recebe files/basePath já resolvidos pelo dispatcher (tools.generatePar2) e só
// monta os args + roda. O dispatcher re-lista os *.par2 gerados no workDir.
export const id = 'par2cmdline'
export const label = 'par2cmdline (compatível / turbo)'
export const defaultBin = 'par2'
export const binKey = 'par2'
export const configSchema = []
export const defaultConfig = {}

export async function generate({
  workDir, base, files, basePath, redundancy, volumes, memoryMB, bin, onLine, signal,
}) {
  const par2Out = path.join(workDir, `${base}.par2`)
  const args = ['create', '-q', `-r${redundancy}`]
  if (volumes > 0) args.push(`-n${volumes}`)
  if (memoryMB > 0) args.push(`-m${memoryMB}`)
  args.push('-a', par2Out, '-B', basePath, '--', ...files)

  onLine?.(`[PAR2] par2cmdline redundância ${redundancy}% sobre ${files.length} arquivo(s)${memoryMB > 0 ? ` (memória ${memoryMB} MB)` : ''}`)
  const { code } = await run(bin, args, { onLine, signal })
  if (code !== 0) throw new Error(`par2 saiu com código ${code}`)
}
