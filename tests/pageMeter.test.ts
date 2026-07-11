import { describe, expect, test } from 'vitest'
import { computePageFill } from '../src/lib/pageMeter'

describe('computePageFill', () => {
  test('0 pairs -> empty first page', () => {
    expect(computePageFill(0, 28)).toEqual({ page: 1, filled: 0, capacity: 28, ratio: 0, isFull: false })
  })

  test('1 pair -> barely started', () => {
    expect(computePageFill(1, 28)).toEqual({ page: 1, filled: 1, capacity: 28, ratio: 1 / 28, isFull: false })
  })

  test('27 pairs -> one short of full', () => {
    expect(computePageFill(27, 28)).toEqual({ page: 1, filled: 27, capacity: 28, ratio: 27 / 28, isFull: false })
  })

  test('28 pairs -> exactly full page', () => {
    expect(computePageFill(28, 28)).toEqual({ page: 1, filled: 28, capacity: 28, ratio: 1, isFull: true })
  })

  test('29 pairs -> rolls over to page 2, filled resets to 1', () => {
    expect(computePageFill(29, 28)).toEqual({ page: 2, filled: 1, capacity: 28, ratio: 1 / 28, isFull: false })
  })

  test('56 pairs -> exactly fills page 2', () => {
    expect(computePageFill(56, 28)).toEqual({ page: 2, filled: 28, capacity: 28, ratio: 1, isFull: true })
  })

  test('57 pairs -> rolls over to page 3, filled resets to 1', () => {
    expect(computePageFill(57, 28)).toEqual({ page: 3, filled: 1, capacity: 28, ratio: 1 / 28, isFull: false })
  })

  test('pairsPerPage <= 0 is guarded against division by zero', () => {
    expect(computePageFill(5, 0)).toEqual({ page: 1, filled: 0, capacity: 0, ratio: 0, isFull: false })
    expect(computePageFill(5, -3)).toEqual({ page: 1, filled: 0, capacity: -3, ratio: 0, isFull: false })
  })
})
