import { A4 } from './constants'
import type { Band, Capacity, LayoutResult, Pair, PageLayout, Panel, Settings } from './types'

export function computeCapacity(settings: Settings): Capacity {
  const usableH = A4.heightMm - 2 * settings.marginMm
  const panelsPerBand = Math.floor(usableH / settings.panelHeightMm)
  const pairsPerBand = Math.floor(panelsPerBand / 2)
  const pairsPerPage = settings.bands * pairsPerBand
  return {
    panelsPerBand,
    pairsPerBand,
    pairsPerPage,
    valid: pairsPerBand >= 1,
  }
}

function emptyPanel(): Panel {
  return { kind: 'empty', text: '', pairIndex: null }
}

export function computeLayout(pairs: Pair[], settings: Settings): LayoutResult {
  const capacity = computeCapacity(settings)

  if (!capacity.valid) {
    return {
      pages: [],
      capacity,
      totalPages: 0,
      pageBreakAfterPairIndex: [],
      warning: `パネル高さ(${settings.panelHeightMm}mm)が大きすぎて1ペアも入りません。値を小さくしてください`,
    }
  }

  if (pairs.length === 0) {
    return {
      pages: [],
      capacity,
      totalPages: 0,
      pageBreakAfterPairIndex: [],
    }
  }

  const { panelsPerBand, pairsPerBand, pairsPerPage } = capacity
  const totalPages = Math.ceil(pairs.length / pairsPerPage)

  const pages: PageLayout[] = []
  for (let p = 0; p < totalPages; p++) {
    const bands: Band[] = []
    for (let b = 0; b < settings.bands; b++) {
      const panels: Panel[] = Array.from({ length: panelsPerBand }, emptyPanel)
      for (let pos = 0; pos < pairsPerBand; pos++) {
        const pairIndex = p * pairsPerPage + b * pairsPerBand + pos
        const pair = pairs[pairIndex]
        if (!pair) break
        panels[pos * 2] = { kind: 'front', text: pair.front, pairIndex }
        panels[pos * 2 + 1] = { kind: 'back', text: pair.back, pairIndex }
      }
      bands.push({ panels })
    }
    pages.push({ bands })
  }

  const pageBreakAfterPairIndex: number[] = []
  for (let p = 0; p < totalPages; p++) {
    const lastIndexOnPage = Math.min((p + 1) * pairsPerPage, pairs.length) - 1
    pageBreakAfterPairIndex.push(lastIndexOnPage)
  }

  return { pages, capacity, totalPages, pageBreakAfterPairIndex }
}
