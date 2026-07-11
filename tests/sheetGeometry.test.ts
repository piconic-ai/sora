import { describe, expect, test } from 'vitest'
import { DEFAULTS } from '../src/lib/constants'
import { computeSheetGeometry } from '../src/lib/sheetGeometry'

describe('computeSheetGeometry', () => {
  // DEFAULTS: bands=4, panelHeightMm=20, marginMm=0.
  // panelsPerBand=14 comes from computeCapacity(DEFAULTS) — floor(297/20).
  const panelsPerBand = 14

  test('usable bounds match the full A4 page when marginMm=0', () => {
    const geo = computeSheetGeometry(DEFAULTS, panelsPerBand)
    expect(geo.usableX0).toBe(0)
    expect(geo.usableX1).toBe(210)
    expect(geo.usableY0).toBe(0)
    expect(geo.usableY1).toBe(297)
  })

  test('bandWidth splits the usable width evenly across bands', () => {
    const geo = computeSheetGeometry(DEFAULTS, panelsPerBand)
    expect(geo.bandWidth).toBe(52.5) // 210 / 4
  })

  test('gridTop centers the leftover height between top and bottom margins', () => {
    const geo = computeSheetGeometry(DEFAULTS, panelsPerBand)
    // usableH=297, panelsPerBand*panelH=14*20=280, leftover=17, split in half
    expect(geo.gridTop).toBe(8.5)
  })

  test('foldRows has one entry per panel boundary, including both outer edges', () => {
    const geo = computeSheetGeometry(DEFAULTS, panelsPerBand)
    expect(geo.foldRows).toHaveLength(panelsPerBand + 1) // 15
  })

  test('cutBands has one entry per interior band boundary', () => {
    const geo = computeSheetGeometry(DEFAULTS, panelsPerBand)
    expect(geo.cutBands).toHaveLength(DEFAULTS.bands - 1) // 3
  })
})
