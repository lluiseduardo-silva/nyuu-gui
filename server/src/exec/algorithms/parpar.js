import path from 'node:path'
import { run } from '../runner.js'

// Algoritmo de paridade: ParPar (animetosho) — criador de PAR2 multi-thread/SIMD,
// bem mais rápido que o par2cmdline single-thread. CLI incompatível com o par2cmdline:
//   parpar -s <slices|tamanho> -r <redundância%> [-m <mem>M] [-t <threads>]
//          --filepath-format path -B <basePath> -o <base> -- <files...>
//
// Equivalências de flags (verificado na doc oficial do ParPar 0.4.x):
//   redundância %        -> `-r<n>%`   (sem o `%`, `-r<n>` seria CONTAGEM de slices!)
//   memória MB           -> `-m<n>M`
//   caminhos relativos   -> `--filepath-format common` (descarta o prefixo comum dos
//                           caminhos) ≡ ao `-B <source>` do par2cmdline, SEM flag de base.
//                           (Não usar `-B`: o short flag não é aceito em algumas versões.)
//   saída                -> `-o <base>` (o ParPar acrescenta `.par2`)
//   "volumes" (par2 -n)  -> SEM equivalente direto (o ParPar controla via slices) — ignorado
export const id = 'parpar'
export const label = 'ParPar (rápido, multi-thread)'
export const defaultBin = 'parpar'
export const binKey = 'parpar'

// Padrão de slices: contagem fixa (2000) é robusta para qualquer tamanho de arquivo
// (não estoura o limite de 32768 slices do PAR2 em fontes grandes). Para alinhar os
// slices ao tamanho de artigo do nyuu, informe um tamanho (ex: 700k / 716800).
const DEFAULT_SLICES = '2000'

export const configSchema = [
  {
    key: 'sliceSize',
    label: 'Slices do ParPar (-s)',
    type: 'text',
    placeholder: `tamanho (700k / 5M) ou contagem (2000) — vazio = ${DEFAULT_SLICES}`,
  },
  {
    key: 'threads',
    label: 'Threads do ParPar (-t) — 0 = todos os núcleos',
    type: 'number',
    placeholder: '0',
  },
]
export const defaultConfig = { sliceSize: '', threads: 0 }

export async function generate({
  workDir, base, files, redundancy, memoryMB, config, bin, onLine, signal,
}) {
  const outBase = path.join(workDir, base)
  const slices = String(config?.sliceSize ?? '').trim() || DEFAULT_SLICES
  const threads = Number(config?.threads) || 0

  const args = ['-s', slices, '-r', `${redundancy}%`]
  if (memoryMB > 0) args.push('-m', `${memoryMB}M`)
  if (threads > 0) args.push('-t', String(threads))
  args.push('--filepath-format', 'common')
  args.push('-o', outBase, '--', ...files)

  onLine?.(`[PAR2] ParPar redundância ${redundancy}% (slices ${slices}) sobre ${files.length} arquivo(s)${memoryMB > 0 ? ` (memória ${memoryMB} MB)` : ''}`)
  const { code } = await run(bin, args, { onLine, signal })
  if (code !== 0) throw new Error(`parpar saiu com código ${code}`)
}
