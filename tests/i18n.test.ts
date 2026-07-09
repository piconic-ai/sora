import { describe, expect, test } from 'vitest'
import { pickLocale, summary } from '../src/lib/i18n'

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

describe('summary', () => {
  test('ja formatting', () => {
    expect(summary('ja', 2, 1)).toBe('2語 ・ 1ページ')
  })

  test('en singular', () => {
    expect(summary('en', 1, 1)).toBe('1 word · 1 page')
  })

  test('en plural', () => {
    expect(summary('en', 2, 1)).toBe('2 words · 1 page')
  })

  test('en plural pages', () => {
    expect(summary('en', 30, 2)).toBe('30 words · 2 pages')
  })
})
