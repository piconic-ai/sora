import { A4 } from './constants'
import type { Settings } from './types'

export interface SheetGeometry {
  usableX0: number
  usableX1: number
  usableY0: number
  usableY1: number
  bandWidth: number
  // Relative to usableY0 (i.e. gridTop - usableY0) — this is what the
  // --grid-top CSS variable expects, since .bands is already inset by
  // the sheet's own padding (= usableX0/usableY0).
  gridTop: number
  // Absolute Y positions (mm, page-relative) of every panel boundary,
  // including the grid's outer top and bottom edges.
  foldRows: number[]
  // Absolute X positions (mm, page-relative) of the interior band
  // boundaries.
  cutBands: number[]
}

export function computeSheetGeometry(settings: Settings, panelsPerBand: number): SheetGeometry {
  const bands = settings.bands
  const panelH = settings.panelHeightMm

  const usableX0 = settings.marginMm
  const usableX1 = A4.widthMm - settings.marginMm
  const usableY0 = settings.marginMm
  const usableY1 = A4.heightMm - settings.marginMm
  const bandWidth = (usableX1 - usableX0) / bands

  // Panels don't divide the page height exactly; split the leftover
  // evenly between the top and bottom so both margins match (the two
  // flaps fold behind the first/last panel when the strip is finished).
  const usableH = usableY1 - usableY0
  const gridTopAbs = usableY0 + (usableH - panelsPerBand * panelH) / 2

  // Fold lines at every panel boundary, including the grid's outer top
  // and bottom edges — those fold the margin flaps back.
  const foldRows = Array.from({ length: panelsPerBand + 1 }, (_, i) => gridTopAbs + i * panelH)
  const cutBands = Array.from({ length: bands - 1 }, (_, i) => usableX0 + (i + 1) * bandWidth)

  return {
    usableX0,
    usableX1,
    usableY0,
    usableY1,
    bandWidth,
    gridTop: gridTopAbs - usableY0,
    foldRows,
    cutBands,
  }
}
