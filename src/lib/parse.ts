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

export function parseInput(raw: string): ParseResult {
  const lines = raw
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0) return { pairs: [], error: null }

  const hasTab = lines.some(line => line.includes('\t'))
  const hasComma = lines.some(line => line.includes(','))

  if (hasTab || hasComma) {
    const delimiter = hasTab ? '\t' : ','
    const pairs = lines.map(line => {
      const [front, back] = splitOnFirst(line, delimiter)
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
