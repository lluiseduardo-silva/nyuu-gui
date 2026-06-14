import fs from 'node:fs'
import path from 'node:path'
import { run, runCapture } from './runner.js'

const VIDEO_EXT = new Set(['.mkv', '.mp4', '.avi', '.mov', '.ts', '.m2ts', '.wmv', '.flv'])
const PCT = /(\d{1,3}(?:\.\d+)?)\s*%/

// Extrai um percentual (0..1) de uma linha de log, ou null.
export function parsePercent(line) {
  const m = line.match(PCT)
  if (!m) return null
  const v = parseFloat(m[1])
  if (Number.isNaN(v)) return null
  return Math.max(0, Math.min(1, v / 100))
}

// Lista recursiva de todos os arquivos sob um diretório (caminhos absolutos).
export function walkFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function findLargestVideo(dir) {
  let best = null
  let bestSize = -1
  for (const f of walkFiles(dir)) {
    if (!VIDEO_EXT.has(path.extname(f).toLowerCase())) continue
    const size = fs.statSync(f).size
    if (size > bestSize) {
      bestSize = size
      best = f
    }
  }
  return best
}

// 1. NFO via mediainfo (no maior vídeo). Não escreve dentro da fonte.
export async function generateNfo({ source, nfoPath, bin, onLine, signal }) {
  const isDir = fs.statSync(source).isDirectory()
  const video = isDir ? findLargestVideo(source) : source
  if (!video) {
    onLine?.('[NFO ] nenhum vídeo encontrado na fonte — NFO não gerado')
    return { video: null }
  }
  onLine?.(`[NFO ] mediainfo "${video}"`)
  const { code, stdout, stderr } = await runCapture(bin, [video], { signal })
  if (code !== 0) throw new Error(`mediainfo saiu com código ${code}: ${stderr.slice(0, 400)}`)
  fs.writeFileSync(nfoPath, stdout)
  onLine?.(`[NFO ] salvo em ${nfoPath}`)
  return { video }
}

// 2. par2 num workdir gravável (nunca dentro da fonte).
export async function generatePar2({ source, workDir, base, redundancy, volumes, bin, onLine, signal }) {
  fs.mkdirSync(workDir, { recursive: true })
  const isDir = fs.statSync(source).isDirectory()
  const par2Out = path.join(workDir, `${base}.par2`)

  let basePath
  let files
  if (isDir) {
    basePath = source
    files = walkFiles(source)
  } else {
    basePath = path.dirname(source)
    files = [source]
  }
  if (files.length === 0) {
    onLine?.('[PAR2] nenhum arquivo de entrada — pulando')
    return []
  }

  const args = ['create', '-q', `-r${redundancy}`]
  if (volumes > 0) args.push(`-n${volumes}`)
  args.push('-a', par2Out, '-B', basePath, '--', ...files)

  onLine?.(`[PAR2] redundância ${redundancy}% sobre ${files.length} arquivo(s)`)
  const { code } = await run(bin, args, { onLine, signal })
  if (code !== 0) throw new Error(`par2 saiu com código ${code}`)

  const par2Files = fs
    .readdirSync(workDir)
    .filter((f) => f.toLowerCase().endsWith('.par2'))
    .map((f) => path.join(workDir, f))
  onLine?.(`[PAR2] ${par2Files.length} arquivo(s) par2 gerados`)
  return par2Files
}

// 3. Posta fonte + par2 com o nyuu, gerando o NZB.
export async function postNyuu({
  source, par2Files, nzbPath, configPath, subdirs, bin, categoryId, nzbTitle, onLine, signal,
}) {
  const args = [
    '-C', configPath,
    '--subdirs', subdirs,
    '-o', nzbPath,
    '-O',
    '--progress', 'stderr',
    '--log-level', '3',
  ]
  if (categoryId) args.push('--nzb-category', String(categoryId))
  if (nzbTitle) args.push('--nzb-title', nzbTitle)
  args.push(source, ...par2Files)

  onLine?.(`[POST] nyuu enviando "${source}" + ${par2Files.length} par2`)
  const { code } = await run(bin, args, { onLine, signal })
  if (code !== 0) throw new Error(`nyuu saiu com código ${code}`)
  onLine?.(`[POST] NZB salvo em ${nzbPath}`)
  return { nzbPath }
}
