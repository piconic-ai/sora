import type { Settings } from './types'

export const A4 = { widthMm: 210, heightMm: 297 } as const

export const DEFAULTS: Settings = {
  bands: 4,
  panelHeightMm: 20,
  fontSizePt: 14,
  marginMm: 0,
}

export const LIMITS = {
  bands: [1, 12] as const,
  panelHeightMm: [8, 100] as const,
  fontSizePt: [6, 48] as const,
}
