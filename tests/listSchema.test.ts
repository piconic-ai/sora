import { describe, expect, test } from 'vitest'
import { LIST_VERSION, deserializeList, normalizeTitle, pairsEqual, serializeList } from '../src/lib/storage/schema'

describe('serializeList / deserializeList round trip', () => {
  test('round-trips id, pairs, createdAt and updatedAt', () => {
    const pairs = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    const list = serializeList('list-1', pairs, 12345, 67890)
    expect(list).toEqual({ v: LIST_VERSION, id: 'list-1', pairs, createdAt: 12345, updatedAt: 67890 })
    expect(deserializeList(list)).toEqual(list)
  })

  test('round-trips an empty pairs list', () => {
    const list = serializeList('list-2', [], 1, 1)
    expect(deserializeList(list)).toEqual(list)
  })
})

describe('serializeList', () => {
  test('coerces non-string front/back to strings', () => {
    const list = serializeList('list-3', [{ front: 42, back: null } as never], 1, 1)
    expect(list.pairs).toEqual([{ front: '42', back: '' }])
  })

  test('omits the title key entirely when no title is given', () => {
    const list = serializeList('list-3', [], 1, 1)
    expect('title' in list).toBe(false)
  })
})

describe('normalizeTitle', () => {
  test('returns the trimmed string for non-blank input', () => {
    expect(normalizeTitle('  My List  ')).toBe('My List')
    expect(normalizeTitle('Verbs')).toBe('Verbs')
  })

  test('returns undefined for empty or whitespace-only input', () => {
    expect(normalizeTitle('')).toBeUndefined()
    expect(normalizeTitle('   ')).toBeUndefined()
    expect(normalizeTitle('\t\n')).toBeUndefined()
  })
})

describe('serializeList / deserializeList title', () => {
  test('round-trips a custom title', () => {
    const list = serializeList('t-1', [{ front: 'a', back: 'b' }], 1, 2, 'My List')
    expect(list.title).toBe('My List')
    expect(deserializeList(list)).toEqual(list)
  })

  test('normalizes (trims) the title on serialize', () => {
    const list = serializeList('t-2', [], 1, 2, '  Trimmed  ')
    expect(list.title).toBe('Trimmed')
  })

  test('a blank/whitespace title is dropped on serialize (no title key)', () => {
    const list = serializeList('t-3', [], 1, 2, '   ')
    expect('title' in list).toBe(false)
  })

  test('deserialize reads old records (no title field) as having no title', () => {
    const list = deserializeList({ v: 1, id: 't-4', pairs: [], createdAt: 1, updatedAt: 2 })
    expect(list?.title).toBeUndefined()
    expect('title' in (list as object)).toBe(false)
  })

  test('deserialize drops a non-string title', () => {
    expect(deserializeList({ v: 1, id: 't-5', pairs: [], createdAt: 1, updatedAt: 2, title: 42 })?.title).toBeUndefined()
    expect(
      deserializeList({ v: 1, id: 't-6', pairs: [], createdAt: 1, updatedAt: 2, title: null })?.title,
    ).toBeUndefined()
  })

  test('deserialize drops a whitespace-only title', () => {
    expect(
      deserializeList({ v: 1, id: 't-7', pairs: [], createdAt: 1, updatedAt: 2, title: '   ' })?.title,
    ).toBeUndefined()
  })

  test('deserialize keeps a valid non-blank title', () => {
    expect(
      deserializeList({ v: 1, id: 't-8', pairs: [], createdAt: 1, updatedAt: 2, title: 'Nouns' })?.title,
    ).toBe('Nouns')
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

describe('deserializeList backfills updatedAt for backward compatibility', () => {
  test('a pre-carousel entry with no updatedAt at all falls back to createdAt', () => {
    const list = deserializeList({ v: 1, id: 'a', pairs: [], createdAt: 500 })
    expect(list).toEqual({ v: LIST_VERSION, id: 'a', pairs: [], createdAt: 500, updatedAt: 500 })
  })

  test('an updatedAt of the wrong type falls back to createdAt', () => {
    const list = deserializeList({ v: 1, id: 'a', pairs: [], createdAt: 500, updatedAt: '999' })
    expect(list?.updatedAt).toBe(500)
  })

  test('an updatedAt of NaN or Infinity falls back to createdAt', () => {
    expect(deserializeList({ v: 1, id: 'a', pairs: [], createdAt: 500, updatedAt: Number.NaN })?.updatedAt).toBe(500)
    expect(
      deserializeList({ v: 1, id: 'a', pairs: [], createdAt: 500, updatedAt: Number.POSITIVE_INFINITY })?.updatedAt,
    ).toBe(500)
  })

  test('a valid updatedAt distinct from createdAt is preserved, not overwritten', () => {
    const list = deserializeList({ v: 1, id: 'a', pairs: [], createdAt: 500, updatedAt: 800 })
    expect(list).toEqual({ v: LIST_VERSION, id: 'a', pairs: [], createdAt: 500, updatedAt: 800 })
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
