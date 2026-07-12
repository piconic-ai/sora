import { describe, expect, test } from 'vitest'
import { LIST_VERSION, deserializeList, pairsEqual, serializeList } from '../src/lib/storage/schema'

describe('serializeList / deserializeList round trip', () => {
  test('round-trips id, pairs and createdAt', () => {
    const pairs = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    const list = serializeList('list-1', pairs, 12345)
    expect(list).toEqual({ v: LIST_VERSION, id: 'list-1', pairs, createdAt: 12345 })
    expect(deserializeList(list)).toEqual(list)
  })

  test('round-trips an empty pairs list', () => {
    const list = serializeList('list-2', [], 1)
    expect(deserializeList(list)).toEqual(list)
  })
})

describe('serializeList', () => {
  test('coerces non-string front/back to strings', () => {
    const list = serializeList('list-3', [{ front: 42, back: null } as never], 1)
    expect(list.pairs).toEqual([{ front: '42', back: '' }])
  })
})

describe('deserializeList rejects invalid input', () => {
  test('null', () => {
    expect(deserializeList(null)).toBeNull()
  })

  test('undefined', () => {
    expect(deserializeList(undefined)).toBeNull()
  })

  test('non-object primitives', () => {
    expect(deserializeList('list')).toBeNull()
    expect(deserializeList(42)).toBeNull()
    expect(deserializeList(true)).toBeNull()
  })

  test('version mismatch', () => {
    expect(deserializeList({ v: 2, id: 'a', pairs: [], createdAt: 1 })).toBeNull()
    expect(deserializeList({ id: 'a', pairs: [], createdAt: 1 })).toBeNull()
  })

  test('id is missing, not a string, or empty', () => {
    expect(deserializeList({ v: 1, pairs: [], createdAt: 1 })).toBeNull()
    expect(deserializeList({ v: 1, id: 42, pairs: [], createdAt: 1 })).toBeNull()
    expect(deserializeList({ v: 1, id: '', pairs: [], createdAt: 1 })).toBeNull()
  })

  test('pairs is not an array', () => {
    expect(deserializeList({ v: 1, id: 'a', pairs: 'nope', createdAt: 1 })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: {}, createdAt: 1 })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: null, createdAt: 1 })).toBeNull()
  })

  test('a pair element has the wrong shape', () => {
    expect(deserializeList({ v: 1, id: 'a', pairs: [{ front: 'Apple' }], createdAt: 1 })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: [{ front: 1, back: 'a' }], createdAt: 1 })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: [null], createdAt: 1 })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: ['Apple'], createdAt: 1 })).toBeNull()
  })

  test('createdAt is missing or not a number', () => {
    expect(deserializeList({ v: 1, id: 'a', pairs: [] })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: [], createdAt: '1' })).toBeNull()
  })

  test('createdAt is NaN or Infinity', () => {
    expect(deserializeList({ v: 1, id: 'a', pairs: [], createdAt: Number.NaN })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: [], createdAt: Number.POSITIVE_INFINITY })).toBeNull()
    expect(deserializeList({ v: 1, id: 'a', pairs: [], createdAt: Number.NEGATIVE_INFINITY })).toBeNull()
  })
})

describe('pairsEqual', () => {
  test('true for identical content, even as distinct array/object instances', () => {
    const a = [{ front: 'Apple', back: 'りんご' }]
    const b = [{ front: 'Apple', back: 'りんご' }]
    expect(pairsEqual(a, b)).toBe(true)
  })

  test('true for two empty lists', () => {
    expect(pairsEqual([], [])).toBe(true)
  })

  test('false when lengths differ', () => {
    expect(pairsEqual([{ front: 'Apple', back: 'りんご' }], [])).toBe(false)
  })

  test('false when a front differs', () => {
    expect(
      pairsEqual([{ front: 'Apple', back: 'りんご' }], [{ front: 'Banana', back: 'りんご' }]),
    ).toBe(false)
  })

  test('false when a back differs', () => {
    expect(
      pairsEqual([{ front: 'Apple', back: 'りんご' }], [{ front: 'Apple', back: 'ばなな' }]),
    ).toBe(false)
  })

  test('false when order differs', () => {
    const a = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    const b = [
      { front: 'Banana', back: 'ばなな' },
      { front: 'Apple', back: 'りんご' },
    ]
    expect(pairsEqual(a, b)).toBe(false)
  })
})
