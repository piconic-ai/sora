export interface PageFill {
  page: number
  filled: number
  capacity: number
  ratio: number
  isFull: boolean
}

// Pure helper for the page-capacity progress bar (FB4): given how many
// pairs have been entered and how many pairs fit on a page, derive which
// page is currently being filled and how full it is.
export function computePageFill(pairCount: number, pairsPerPage: number): PageFill {
  const capacity = pairsPerPage

  // Guard against a degenerate layout (e.g. panelHeightMm too large for the
  // page — see computeCapacity's `valid` flag) where pairsPerPage <= 0
  // would otherwise divide by zero.
  if (pairsPerPage <= 0 || pairCount === 0) {
    return { page: 1, filled: 0, capacity, ratio: 0, isFull: false }
  }

  const filled = ((pairCount - 1) % pairsPerPage) + 1
  const page = Math.ceil(pairCount / pairsPerPage)
  const ratio = filled / capacity
  const isFull = filled === capacity

  return { page, filled, capacity, ratio, isFull }
}
