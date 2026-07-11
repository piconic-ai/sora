import { describe, expect, test } from 'vitest'
import { pageMeterCaption, pickLocale, resolveLocale } from '../src/lib/i18n'
import { computePageFill } from '../src/lib/pageMeter'

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

describe('pageMeterCaption', () => {
  test('ja not full', () => {
    expect(pageMeterCaption('ja', computePageFill(1, 28))).toBe('1ページ目 ・ 1/28語 ・ あと27語で1ページ')
  })

  test('ja full', () => {
    expect(pageMeterCaption('ja', computePageFill(28, 28))).toBe('1ページ目 ・ 28/28語 ・ ちょうど1ページ分')
  })

  test('ja rolled over to page 2', () => {
    expect(pageMeterCaption('ja', computePageFill(29, 28))).toBe('2ページ目 ・ 1/28語 ・ あと27語で1ページ')
  })

  test('en singular remaining word', () => {
    expect(pageMeterCaption('en', computePageFill(27, 28))).toBe('Page 1 · 27/28 words · 1 more word to fill the page')
  })

  test('en plural remaining words', () => {
    expect(pageMeterCaption('en', computePageFill(1, 28))).toBe('Page 1 · 1/28 words · 27 more words to fill the page')
  })

  test('en full', () => {
    expect(pageMeterCaption('en', computePageFill(28, 28))).toBe('Page 1 · 28/28 words · Fills the page exactly')
  })
})
