import { describe, expect, test } from 'vitest'
import {
  adjustIndexAfterRemoval,
  buildListPath,
  parseListIdFromPath,
  shouldConfirmBeforeNewList,
} from '../src/lib/listnav'

describe('parseListIdFromPath', () => {
  test('extracts the id from /l/{id}', () => {
    expect(parseListIdFromPath('/l/abc123')).toBe('abc123')
  })

  test('tolerates a trailing slash', () => {
    expect(parseListIdFromPath('/l/abc123/')).toBe('abc123')
  })

  test('root path has no id', () => {
    expect(parseListIdFromPath('/')).toBeNull()
  })

  test('a bare /l/ with no id is null', () => {
    expect(parseListIdFromPath('/l/')).toBeNull()
  })

  test('an unrelated path is null', () => {
    expect(parseListIdFromPath('/about')).toBeNull()
  })

  test('a nested extra segment after the id is not matched', () => {
    expect(parseListIdFromPath('/l/abc123/extra')).toBeNull()
  })

  test('decodes a URL-encoded id', () => {
    expect(parseListIdFromPath('/l/a%20b')).toBe('a b')
  })

  test('malformed percent-encoding falls back to null rather than throwing', () => {
    expect(parseListIdFromPath('/l/%')).toBeNull()
  })
})

describe('buildListPath', () => {
  test('builds /l/{id}', () => {
    expect(buildListPath('abc123')).toBe('/l/abc123')
  })

  test('encodes characters that need escaping in a URL path segment', () => {
    expect(buildListPath('a b')).toBe('/l/a%20b')
  })

  test('round-trips through parseListIdFromPath', () => {
    const id = 'some-id_123'
    expect(parseListIdFromPath(buildListPath(id))).toBe(id)
  })
})

describe('adjustIndexAfterRemoval', () => {
  test('a target after the removed index shifts down by one', () => {
    expect(adjustIndexAfterRemoval(0, 3)).toBe(2)
  })

  test('a target before the removed index is unaffected', () => {
    expect(adjustIndexAfterRemoval(3, 1)).toBe(1)
  })

  test('a target equal to the removed index is unaffected (caller-defined semantics)', () => {
    expect(adjustIndexAfterRemoval(2, 2)).toBe(2)
  })

  test('removing the very first element shifts every later index down', () => {
    expect(adjustIndexAfterRemoval(0, 1)).toBe(0)
  })
})

describe('shouldConfirmBeforeNewList', () => {
  test('false while under the cap', () => {
    expect(shouldConfirmBeforeNewList(49, 50)).toBe(false)
  })

  test('true exactly at the cap', () => {
    expect(shouldConfirmBeforeNewList(50, 50)).toBe(true)
  })

  test('true past the cap', () => {
    expect(shouldConfirmBeforeNewList(51, 50)).toBe(true)
  })

  test('true for a zero cap and zero count (edge case, degenerate config)', () => {
    expect(shouldConfirmBeforeNewList(0, 0)).toBe(true)
  })
})
