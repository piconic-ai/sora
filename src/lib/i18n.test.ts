import { describe, expect, test } from 'vitest'
import { displayListTitle, historyItemTitle, pickLocale, resolveLocale } from './i18n'
import type { SavedList } from './storage/schema'
import type { Pair } from './types'

describe('pickLocale', () => {
  test('ja,en-US;q=0.9 -> ja', () => {
    expect(pickLocale('ja,en-US;q=0.9')).toBe('ja')
  })

  test('en-US,en -> en', () => {
    expect(pickLocale('en-US,en')).toBe('en')
  })

  test('null -> en', () => {
    expect(pickLocale(null)).toBe('en')
  })

  test('undefined -> en', () => {
    expect(pickLocale(undefined)).toBe('en')
  })

  test('empty string -> en', () => {
    expect(pickLocale('')).toBe('en')
  })

  test('ja-JP -> ja', () => {
    expect(pickLocale('ja-JP')).toBe('ja')
  })
})

describe('resolveLocale', () => {
  test("cookie 'ja' wins over accept-language", () => {
    expect(resolveLocale('ja', 'en-US,en')).toBe('ja')
  })

  test("cookie 'en' wins over accept-language", () => {
    expect(resolveLocale('en', 'ja,en-US;q=0.9')).toBe('en')
  })

  test('invalid cookie value falls back to accept-language', () => {
    expect(resolveLocale('fr', 'ja,en-US;q=0.9')).toBe('ja')
  })

  test('missing cookie falls back to accept-language', () => {
    expect(resolveLocale(undefined, 'ja,en-US;q=0.9')).toBe('ja')
  })

  test('null cookie falls back to accept-language', () => {
    expect(resolveLocale(null, null)).toBe('en')
  })

  test('empty string cookie falls back to accept-language', () => {
    expect(resolveLocale('', 'ja,en-US;q=0.9')).toBe('ja')
  })
})

describe('historyItemTitle', () => {
  // Local-time construction (rather than a hardcoded epoch ms) so the
  // expected "M/D" label doesn't depend on the test runner's timezone.
  const createdAt = new Date(2026, 0, 5).getTime() // Jan 5

  test('ja: empty pairs', () => {
    expect(historyItemTitle('ja', [], createdAt)).toBe('空のリスト · 1/5')
  })

  test('en: empty pairs', () => {
    expect(historyItemTitle('en', [], createdAt)).toBe('Empty list · 1/5')
  })

  test('ja: a single pair has no "ほかN語" suffix', () => {
    const pairs: Pair[] = [{ front: 'Apple', back: 'りんご' }]
    expect(historyItemTitle('ja', pairs, createdAt)).toBe('Apple · 1/5')
  })

  test('en: a single pair has no "+N" suffix', () => {
    const pairs: Pair[] = [{ front: 'Apple', back: 'りんご' }]
    expect(historyItemTitle('en', pairs, createdAt)).toBe('Apple · 1/5')
  })

  test('ja: multiple pairs append "ほかN語"', () => {
    const pairs: Pair[] = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
      { front: 'Cherry', back: 'さくらんぼ' },
    ]
    expect(historyItemTitle('ja', pairs, createdAt)).toBe('Apple ほか2語 · 1/5')
  })

  test('en: multiple pairs append "+N"', () => {
    const pairs: Pair[] = [
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
      { front: 'Cherry', back: 'さくらんぼ' },
    ]
    expect(historyItemTitle('en', pairs, createdAt)).toBe('Apple +2 · 1/5')
  })

  test('ja: a blank first front falls back to "(無題)"', () => {
    const pairs: Pair[] = [{ front: '  ', back: 'りんご' }]
    expect(historyItemTitle('ja', pairs, createdAt)).toBe('(無題) · 1/5')
  })

  test('en: a blank first front falls back to "(untitled)"', () => {
    const pairs: Pair[] = [{ front: '', back: 'りんご' }]
    expect(historyItemTitle('en', pairs, createdAt)).toBe('(untitled) · 1/5')
  })
})

describe('displayListTitle', () => {
  const createdAt = new Date(2026, 0, 5).getTime() // Jan 5
  const pairs: Pair[] = [
    { front: 'Apple', back: 'りんご' },
    { front: 'Banana', back: 'ばなな' },
  ]
  const base: SavedList = { v: 1, id: 'x', pairs, createdAt, updatedAt: createdAt }

  test('shows a custom title verbatim, regardless of locale', () => {
    const titled: SavedList = { ...base, title: 'My Fruits' }
    expect(displayListTitle('ja', titled)).toBe('My Fruits')
    expect(displayListTitle('en', titled)).toBe('My Fruits')
  })

  test('falls back to the auto-generated label when there is no title', () => {
    expect(displayListTitle('ja', base)).toBe('Apple ほか1語 · 1/5')
    expect(displayListTitle('en', base)).toBe('Apple +1 · 1/5')
  })

  test('an empty-pairs untitled list uses the auto-generated empty label', () => {
    const empty: SavedList = { v: 1, id: 'y', pairs: [], createdAt, updatedAt: createdAt }
    expect(displayListTitle('ja', empty)).toBe('空のリスト · 1/5')
    expect(displayListTitle('en', empty)).toBe('Empty list · 1/5')
  })
})
