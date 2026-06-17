import fs from 'node:fs'

// Merge de NZBs (usado pelo modo paralelo two-pass: 1 NZB da fonte + 1 NZB dos par2).
// Sem dependência de parser XML: a saída do nyuu é determinística, então extraímos
// os blocos <file>...</file> por regex, preservamos o <head>/<meta> da 1ª parte
// (a fonte: guarda title/category) e concatenamos. Grava de forma atômica (.tmp +
// rename) para nunca publicar um NZB pela metade.
//
// NÃO há dedupe: no two-pass as partes são DISJUNTAS (fonte vs paridade), então
// concatenar é correto — e evita o risco de derrubar um arquivo real por engano.
// A integridade é garantida exigindo que CADA parte contribua com ao menos 1 <file>.

const FILE_BLOCK = /<file\b[\s\S]*?<\/file>/gi
const HEAD_BLOCK = /<head>[\s\S]*?<\/head>/i

function readText(p) {
  return fs.readFileSync(p, 'utf8')
}

function extractFiles(xml) {
  return xml.match(FILE_BLOCK) || []
}

function countSegments(blocks) {
  let n = 0
  for (const b of blocks) n += (b.match(/<segment\b/gi) || []).length
  return n
}

/**
 * Junta `parts` (caminhos de NZB) em `out`. A 1ª parte é a "principal" — dela
 * herdamos o cabeçalho/<head>. Retorna { files, segments }.
 */
export function mergeNzbFiles({ out, parts, log }) {
  const existing = parts.filter((p) => p && fs.existsSync(p))
  if (existing.length === 0) throw new Error('merge de NZB: nenhuma parte existe')

  const head = readText(existing[0])
  const headMatch = head.match(HEAD_BLOCK)
  const xmlDecl = head.match(/^<\?xml[^>]*\?>\s*/i)?.[0] || '<?xml version="1.0" encoding="UTF-8"?>\n'
  const docType = head.match(/<!DOCTYPE[\s\S]*?>\s*/i)?.[0] || ''
  const nzbOpen = head.match(/<nzb\b[^>]*>/i)?.[0] || '<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">'

  const merged = []
  for (const p of existing) {
    const blocks = extractFiles(readText(p))
    // Integridade: uma parte sem <file> indica NZB vazio/corrompido — não publicar.
    if (blocks.length === 0) throw new Error(`merge de NZB: parte sem <file> (${p})`)
    merged.push(...blocks)
  }

  const body = [
    xmlDecl.trimEnd(),
    docType.trim(),
    nzbOpen,
    headMatch ? headMatch[0] : '',
    ...merged,
    '</nzb>',
  ].filter(Boolean).join('\n') + '\n'

  const tmp = `${out}.tmp`
  fs.writeFileSync(tmp, body)
  fs.renameSync(tmp, out)

  const segments = countSegments(merged)
  log?.(`[MERGE] NZB final: ${merged.length} arquivo(s), ${segments} segmento(s)`)
  return { files: merged.length, segments }
}
