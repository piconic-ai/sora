import { describe, expect, test } from 'vitest'
import { fitFontSizePt } from '../src/lib/fit'

describe('fitFontSizePt', () => {
  test('short text fits at base size', () => {
    expect(fitFontSizePt('Apple', 50)).toBe(14)
  })

  test('empty text stays at base size', () => {
    expect(fitFontSizePt('', 50)).toBe(14)
  })

  test('long english word shrinks', () => {
    const size = fitFontSizePt('internationalization', 50)
    expect(size).toBeLessThan(14)
  })

  test('long japanese text shrinks more than an equally-long english word at the same width', () => {
    const enSize = fitFontSizePt('internationalization', 50)
    const jaSize = fitFontSizePt('こくさいれんごうあんぜんほしょうりじかい', 50)
    expect(jaSize).toBeLessThan(enSize)
  })

  test('extremely long text bottoms out at minPt', () => {
    const size = fitFontSizePt('a'.repeat(200), 50)
    expect(size).toBe(8)
  })
})
