import type { Pair } from './types'

export interface ParseResult {
  pairs: Pair[]
  error: string | null
}

function splitOnFirst(line: string, delimiter: string): [string, string] {
  const idx = line.indexOf(delimiter)
  if (idx === -1) return [line, '']
  return [line.slice(0, idx), line.slice(idx + delimiter.length)]
}

// Strips one layer of RFC 4180 field quoting: surrounding double quotes,
// with "" inside them unescaping to ". Unquoted fields pass through as-is.
function unquoteField(field: string): string {
  const trimmed = field.trim()
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed
  return trimmed.slice(1, -1).replace(/""/g, '"')
}

// Splits a CSV line on its first comma OUTSIDE of quotes, so exported
// spreadsheet rows like `"Hello, world",挨拶` keep the comma inside the
// quoted field. Everything after that first top-level comma is the back —
// same "first delimiter only" rule as the plain split above.
function splitCsvLine(line: string): [string, string] {
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) {
      return [unquoteField(line.slice(0, i)), unquoteField(line.slice(i + 1))]
    }
  }
  return [unquoteField(line), '']
}

export function parseInput(raw: string): ParseResult {
  const lines = raw
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0) return { pairs: [], error: null }

  const hasTab = lines.some(line => line.includes('\t'))
  const hasComma = lines.some(line => line.includes(','))

  if (hasTab || hasComma) {
    const pairs = lines.map(line => {
      const [front, back] = hasTab ? splitOnFirst(line, '\t') : splitCsvLine(line)
      return { front: front.trim(), back: back.trim() }
    })
    return { pairs, error: null }
  }

  if (lines.length % 2 !== 0) {
    return {
      pairs: [],
      error: '交互形式の行数が奇数です（ペアを作れません）',
    }
  }

  const pairs: Pair[] = []
  for (let i = 0; i < lines.length; i += 2) {
    pairs.push({ front: lines[i], back: lines[i + 1] })
  }
  return { pairs, error: null }
}

// The "copy list as text" format: TSV, because it round-trips through
// parseInput's tab branch and pastes straight into Excel / Google Sheets
// as two columns. Cells are flattened to single-line (inputs can't hold
// tabs/newlines through normal editing, but a defensive replace keeps a
// pathological cell from corrupting neighboring pairs on re-import).
export function serializePairs(pairs: Pair[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim()
  return pairs.map(p => `${clean(p.front)}\t${clean(p.back)}`).join('\n')
}
