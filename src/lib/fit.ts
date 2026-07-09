// Estimates a font size (in pt) that keeps `text` from overflowing a
// single-line band of width `bandWidthMm`, by approximating each
// character's rendered width as a fraction of its em-square.
const MM_PER_PT = 0.3528

function charWeight(code: number): number {
  if (code >= 0x2e80) return 1.0 // CJK and other wide scripts
  if (code >= 0x20 && code <= 0x7e) return 0.55 // ASCII
  return 0.8 // other (accented latin, symbols, etc.)
}

function weightedLength(text: string): number {
  let total = 0
  for (const ch of text) {
    total += charWeight(ch.codePointAt(0) ?? 0)
  }
  return total
}

export function fitFontSizePt(text: string, bandWidthMm: number, basePt = 14, minPt = 8): number {
  const weightedLen = weightedLength(text)
  if (weightedLen === 0) return basePt

  const usableMm = bandWidthMm - 3
  const neededAtBase = basePt * MM_PER_PT * weightedLen
  if (neededAtBase <= usableMm) return basePt

  const fitted = usableMm / (MM_PER_PT * weightedLen)
  const stepped = Math.floor(fitted * 2) / 2
  return Math.max(minPt, Math.min(basePt, stepped))
}
