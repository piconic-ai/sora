import { describe, expect, test } from 'vitest'
import { DRAFT_VERSION, deserializeDraft, serializeDraft } from '../src/lib/storage/schema'

describe('serializeDraft / deserializeDraft round trip', () => {
  test('round-trips pairs and updatedAt', () => {
    const pairs = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ]
    const draft = serializeDraft(pairs, 12345)
    expect(draft).toEqual({ v: DRAFT_VERSION, pairs, updatedAt: 12345 })
    expect(deserializeDraft(draft)).toEqual(draft)
  })

  test('round-trips an empty pairs list', () => {
    const draft = serializeDraft([], 1)
    expect(deserializeDraft(draft)).toEqual(draft)
  })
})

describe('serializeDraft', () => {
  test('coerces non-string front/back to strings', () => {
    const draft = serializeDraft([{ front: 42, back: null } as never], 1)
    expect(draft.pairs).toEqual([{ front: '42', back: '' }])
  })
})

describe('deserializeDraft rejects invalid input', () => {
  test('null', () => {
    expect(deserializeDraft(null)).toBeNull()
  })

  test('undefined', () => {
    expect(deserializeDraft(undefined)).toBeNull()
  })

  test('non-object primitives', () => {
    expect(deserializeDraft('draft')).toBeNull()
    expect(deserializeDraft(42)).toBeNull()
    expect(deserializeDraft(true)).toBeNull()
  })

  test('version mismatch', () => {
    expect(deserializeDraft({ v: 2, pairs: [], updatedAt: 1 })).toBeNull()
    expect(deserializeDraft({ pairs: [], updatedAt: 1 })).toBeNull()
  })

  test('pairs is not an array', () => {
    expect(deserializeDraft({ v: 1, pairs: 'nope', updatedAt: 1 })).toBeNull()
    expect(deserializeDraft({ v: 1, pairs: {}, updatedAt: 1 })).toBeNull()
    expect(deserializeDraft({ v: 1, pairs: null, updatedAt: 1 })).toBeNull()
  })

  test('a pair element has the wrong shape', () => {
    expect(deserializeDraft({ v: 1, pairs: [{ front: 'Apple' }], updatedAt: 1 })).toBeNull()
    expect(deserializeDraft({ v: 1, pairs: [{ front: 1, back: 'a' }], updatedAt: 1 })).toBeNull()
    expect(deserializeDraft({ v: 1, pairs: [null], updatedAt: 1 })).toBeNull()
    expect(deserializeDraft({ v: 1, pairs: ['Apple'], updatedAt: 1 })).toBeNull()
  })

  test('updatedAt is missing or not a number', () => {
    expect(deserializeDraft({ v: 1, pairs: [] })).toBeNull()
    expect(deserializeDraft({ v: 1, pairs: [], updatedAt: '1' })).toBeNull()
  })
})
