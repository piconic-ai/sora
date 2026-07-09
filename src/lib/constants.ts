import type { Settings } from './types'

export const A4 = { widthMm: 210, heightMm: 297 } as const

export const DEFAULTS: Settings = {
  bands: 4,
  panelHeightMm: 20,
  fontSizePt: 14,
  marginMm: 0,
}
