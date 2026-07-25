import { describe, expect, test } from 'vitest'
import { parseInput, serializePairs } from './parse'

describe('parseInput', () => {
  test('comma-delimited pairs', () => {
    const { pairs, error } = parseInput('Apple,りんご\nBanana,ばなな')
    expect(error).toBeNull()
    expect(pairs).toEqual([
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ])
  })

  test('tab-delimited pairs (TSV, prioritized over comma)', () => {
    const { pairs, error } = parseInput('Apple\tりんご')
    expect(error).toBeNull()
    expect(pairs).toEqual([{ front: 'Apple', back: 'りんご' }])
  })

  test('alternating single-line pairs when no delimiter present', () => {
    const { pairs, error } = parseInput('Apple\nりんご\nBanana\nばなな')
    expect(error).toBeNull()
    expect(pairs).toEqual([
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ])
  })

  test('alternating mode errors on odd line count', () => {
    const { pairs, error } = parseInput('Apple\nりんご\nBanana')
    expect(pairs).toEqual([])
    expect(error).toBe('交互形式の行数が奇数です（ペアを作れません）')
  })

  test('trims whitespace and ignores blank lines', () => {
    const { pairs, error } = parseInput('  Apple , りんご  \n\n\nBanana,ばなな\n')
    expect(error).toBeNull()
    expect(pairs).toEqual([
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ])
  })

  test('splits only on the first delimiter occurrence', () => {
    const { pairs, error } = parseInput('Circle,円,extra')
    expect(error).toBeNull()
    expect(pairs).toEqual([{ front: 'Circle', back: '円,extra' }])
  })

  test('empty input yields no pairs and no error', () => {
    const { pairs, error } = parseInput('')
    expect(pairs).toEqual([])
    expect(error).toBeNull()
  })

  test('front-only line in delimited mode gets empty back', () => {
    const { pairs, error } = parseInput('Apple,りんご\nBanana')
    expect(error).toBeNull()
    expect(pairs).toEqual([
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: '' },
    ])
  })

  test('CSV: a quoted field keeps its embedded comma', () => {
    const { pairs, error } = parseInput('"Hello, world",挨拶\nBanana,ばなな')
    expect(error).toBeNull()
    expect(pairs).toEqual([
      { front: 'Hello, world', back: '挨拶' },
      { front: 'Banana', back: 'ばなな' },
    ])
  })

  test('CSV: doubled quotes inside a quoted field unescape to one', () => {
    const { pairs, error } = parseInput('"He said ""hi""",彼は言った')
    expect(error).toBeNull()
    expect(pairs).toEqual([{ front: 'He said "hi"', back: '彼は言った' }])
  })

  test('CSV: back field may be quoted too', () => {
    const { pairs, error } = parseInput('greeting,"Hello, world"')
    expect(error).toBeNull()
    expect(pairs).toEqual([{ front: 'greeting', back: 'Hello, world' }])
  })
})

describe('serializePairs', () => {
  test('produces one tab-separated line per pair', () => {
    const text = serializePairs([
      { front: 'Apple', back: 'りんご' },
      { front: 'Banana', back: 'ばなな' },
    ])
    expect(text).toBe('Apple\tりんご\nBanana\tばなな')
  })

  test('round-trips through parseInput', () => {
    const pairs = [
      { front: 'Hello, world', back: '挨拶' },
      { front: 'Circle', back: '円' },
    ]
    expect(parseInput(serializePairs(pairs)).pairs).toEqual(pairs)
  })

  test('flattens tabs and newlines inside a cell to spaces', () => {
    const text = serializePairs([{ front: 'a\tb', back: 'c\nd' }])
    expect(text).toBe('a b\tc d')
  })

  test('empty list serializes to an empty string', () => {
    expect(serializePairs([])).toBe('')
  })
})
