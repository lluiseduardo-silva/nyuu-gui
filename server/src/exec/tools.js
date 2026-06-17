import fs from 'node:fs'
import path from 'node:path'
import { run, runCapture } from './runner.js'
import { getAlgorithm, DEFAULT_ALGORITHM } from './algorithms/index.js'

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
// Dispatcher: resolve a parte comum (workdir, lista de arquivos, basePath, re-listar
// os .par2 gerados) e delega a montagem dos args + execução ao algoritmo escolhido
// (par2cmdline / parpar / ...), conforme exec/algorithms/.
export async function generatePar2({
  source, workDir, base, redundancy, volumes, memoryMB, algorithm, algoConfig, bin, onLine, signal,
}) {
  fs.mkdirSync(workDir, { recursive: true })
  const isDir = fs.statSync(source).isDirectory()

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

  const algo = getAlgorithm(algorithm || DEFAULT_ALGORITHM)
  await algo.generate({
    source, workDir, base, files, basePath,
    redundancy, volumes, memoryMB, config: algoConfig || {}, bin, onLine, signal,
  })

  const par2Files = fs
    .readdirSync(workDir)
    .filter((f) => f.toLowerCase().endsWith('.par2'))
    .map((f) => path.join(workDir, f))
  onLine?.(`[PAR2] ${par2Files.length} arquivo(s) par2 gerados`)
  return par2Files
}

// 3a. Posta uma lista arbitrária de inputs com o nyuu, gerando um NZB.
// Base genérica usada tanto pelo caminho sequencial (fonte + par2 juntos) quanto
// pelo modo paralelo two-pass (fonte e par2 em invocações separadas).
export async function postNyuuInputs({
  inputs, nzbPath, configPath, subdirs, bin, categoryId, nzbTitle, onLine, signal,
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
  args.push(...inputs)

  const { code } = await run(bin, args, { onLine, signal })
  if (code !== 0) throw new Error(`nyuu saiu com código ${code}`)
  return { nzbPath }
}

// 3b. Posta fonte + par2 num único NZB (caminho sequencial).
export async function postNyuu({
  source, par2Files, nzbPath, configPath, subdirs, bin, categoryId, nzbTitle, onLine, signal,
}) {
  onLine?.(`[POST] nyuu enviando "${source}" + ${par2Files.length} par2`)
  const r = await postNyuuInputs({
    inputs: [source, ...par2Files],
    nzbPath, configPath, subdirs, bin, categoryId, nzbTitle, onLine, signal,
  })
  onLine?.(`[POST] NZB salvo em ${nzbPath}`)
  return r
}
