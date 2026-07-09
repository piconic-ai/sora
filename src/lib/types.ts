export interface Pair {
  front: string
  back: string
}

export interface Settings {
  bands: number
  panelHeightMm: number
  fontSizePt: number
  marginMm: number
}

export type PanelKind = 'front' | 'back' | 'empty'

export interface Panel {
  kind: PanelKind
  text: string
  pairIndex: number | null
}

export interface Band {
  panels: Panel[]
}

export interface PageLayout {
  bands: Band[]
}

export interface Capacity {
  panelsPerBand: number
  pairsPerBand: number
  pairsPerPage: number
  valid: boolean
}

export interface LayoutResult {
  pages: PageLayout[]
  capacity: Capacity
  totalPages: number
  pageBreakAfterPairIndex: number[]
  warning?: string
}
