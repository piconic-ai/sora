import { describe, expect, test } from 'vitest'
import { parseInput } from '../src/lib/parse'

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
})
