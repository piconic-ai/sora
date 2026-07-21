import { describe, expect, test } from 'vitest'
import { DEFAULTS } from './constants'
import { computeSheetGeometry } from './sheetGeometry'

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

  // With marginMm=0 the relative gridTop and the absolute fold positions
  // coincide, which hides the most likely regression (mixing up the two).
  // A non-zero margin separates them: gridTop is page-margin-relative while
  // foldRows/cutBands are absolute page coordinates.
  test('separates relative gridTop from absolute fold/cut positions when marginMm!=0', () => {
    // bands=4, panelHeightMm=20, marginMm=10 -> panelsPerBand=floor(277/20)=13
    const settings = { bands: 4, panelHeightMm: 20, fontSizePt: 14, marginMm: 10 }
    const geo = computeSheetGeometry(settings, 13)

    expect(geo.usableX0).toBe(10)
    expect(geo.usableX1).toBe(200)
    expect(geo.usableY0).toBe(10)
    expect(geo.usableY1).toBe(287)
    expect(geo.bandWidth).toBe(47.5) // (200-10)/4

    // usableH=277, panels*h=260, leftover=17, half=8.5.
    // gridTop is relative to the margin; the first fold is that same offset
    // plus the top margin (absolute).
    expect(geo.gridTop).toBe(8.5)
    expect(geo.foldRows[0]).toBe(18.5) // usableY0(10) + 8.5
    expect(geo.foldRows).toHaveLength(14) // 13 panels + 1
    expect(geo.cutBands[0]).toBe(57.5) // usableX0(10) + bandWidth(47.5)
    expect(geo.cutBands).toHaveLength(3)
  })
})
