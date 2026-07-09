import { describe, expect, test } from 'vitest'
import { DEFAULTS } from '../src/lib/constants'
import { computeCapacity, computeLayout } from '../src/lib/layout'
import type { Pair, Settings } from '../src/lib/types'

function makePairs(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => ({ front: `f${i}`, back: `b${i}` }))
}

describe('computeCapacity', () => {
  test('default settings: panelHeight=20mm, bands=4', () => {
    const cap = computeCapacity(DEFAULTS)
    expect(cap.panelsPerBand).toBe(14) // floor(297 / 20)
    expect(cap.pairsPerBand).toBe(7) // floor(14 / 2)
    expect(cap.pairsPerPage).toBe(28) // 4 * 7
    expect(cap.valid).toBe(true)
  })

  test('odd panelsPerBand leaves a leftover panel unused', () => {
    // 297 / 21 = 14.14 -> panelsPerBand=14 still even; use a value that yields odd count
    const settings: Settings = { ...DEFAULTS, panelHeightMm: 22 } // floor(297/22)=13
    const cap = computeCapacity(settings)
    expect(cap.panelsPerBand).toBe(13)
    expect(cap.pairsPerBand).toBe(6)
  })

  test('invalid when panel height exceeds usable height', () => {
    const settings: Settings = { ...DEFAULTS, panelHeightMm: 400 }
    const cap = computeCapacity(settings)
    expect(cap.valid).toBe(false)
    expect(cap.pairsPerBand).toBe(0)
  })
})

describe('computeLayout', () => {
  test('empty pairs yields no pages', () => {
    const result = computeLayout([], DEFAULTS)
    expect(result.pages).toEqual([])
    expect(result.totalPages).toBe(0)
    expect(result.warning).toBeUndefined()
  })

  test('exactly one page worth of pairs (28) fits on 1 page', () => {
    const result = computeLayout(makePairs(28), DEFAULTS)
    expect(result.totalPages).toBe(1)
    expect(result.pageBreakAfterPairIndex).toEqual([27])
  })

  test('one more than a page (29) spills to a second page', () => {
    const result = computeLayout(makePairs(29), DEFAULTS)
    expect(result.totalPages).toBe(2)
    expect(result.pageBreakAfterPairIndex).toEqual([27, 28])
  })

  test('three pages worth of pairs', () => {
    const result = computeLayout(makePairs(65), DEFAULTS) // 28+28+9
    expect(result.totalPages).toBe(3)
    expect(result.pageBreakAfterPairIndex).toEqual([27, 55, 64])
  })

  test('minimum valid capacity (pairsPerBand=1)', () => {
    const settings: Settings = { ...DEFAULTS, panelHeightMm: 90, bands: 2 } // floor(297/90)=3 -> pairsPerBand=1
    const cap = computeCapacity(settings)
    expect(cap.pairsPerBand).toBe(1)
    expect(cap.pairsPerPage).toBe(2)

    const result = computeLayout(makePairs(3), settings)
    expect(result.totalPages).toBe(2)
    expect(result.pages[0].bands[0].panels[0].pairIndex).toBe(0)
    expect(result.pages[0].bands[1].panels[0].pairIndex).toBe(1)
    expect(result.pages[1].bands[0].panels[0].pairIndex).toBe(2)
  })

  test('pairs never split across a band boundary', () => {
    const result = computeLayout(makePairs(8), DEFAULTS)
    const band0 = result.pages[0].bands[0]
    // pairsPerBand=7, so pair index 0..6 fill band0's 14 panels entirely (front/back)
    for (let pos = 0; pos < 7; pos++) {
      expect(band0.panels[pos * 2].pairIndex).toBe(pos)
      expect(band0.panels[pos * 2].kind).toBe('front')
      expect(band0.panels[pos * 2 + 1].pairIndex).toBe(pos)
      expect(band0.panels[pos * 2 + 1].kind).toBe('back')
    }
    // 8th pair (index 7) spills into band1, not split within band0
    const band1 = result.pages[0].bands[1]
    expect(band1.panels[0].pairIndex).toBe(7)
    expect(band1.panels[0].kind).toBe('front')
    expect(band1.panels[1].pairIndex).toBe(7)
    expect(band1.panels[1].kind).toBe('back')
  })

  test('leftover panel in a band is marked empty', () => {
    const settings: Settings = { ...DEFAULTS, panelHeightMm: 22, bands: 1 } // panelsPerBand=13, pairsPerBand=6
    const result = computeLayout(makePairs(6), settings)
    const band = result.pages[0].bands[0]
    expect(band.panels).toHaveLength(13)
    expect(band.panels[12].kind).toBe('empty')
  })

  test('unfilled trailing panels on the last page are empty', () => {
    const result = computeLayout(makePairs(1), DEFAULTS)
    const band0 = result.pages[0].bands[0]
    expect(band0.panels[0].kind).toBe('front')
    expect(band0.panels[1].kind).toBe('back')
    expect(band0.panels[2].kind).toBe('empty')
    expect(result.pages[0].bands[1].panels[0].kind).toBe('empty')
  })

  test('warning when panel height too large to fit any pair', () => {
    const settings: Settings = { ...DEFAULTS, panelHeightMm: 400 }
    const result = computeLayout(makePairs(3), settings)
    expect(result.pages).toEqual([])
    expect(result.warning).toContain('入りません')
  })
})
