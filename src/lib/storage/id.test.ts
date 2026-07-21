import { describe, expect, test, vi } from 'vitest'
import { generateId } from './id'

const URL_SAFE = /^[A-Za-z0-9_-]+$/

describe('generateId', () => {
  test('defaults to a 21-character id', () => {
    expect(generateId()).toHaveLength(21)
  })

  test('honours a custom size', () => {
    expect(generateId(10)).toHaveLength(10)
    expect(generateId(1)).toHaveLength(1)
  })

  test('only uses URL-path-safe characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateId()).toMatch(URL_SAFE)
    }
  })

  test('produces distinct ids across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()))
    // 1000 draws from a 64^21 space collide with negligible probability.
    expect(ids.size).toBe(1000)
  })

  test('falls back to Math.random when crypto.getRandomValues throws', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('no CSPRNG here')
    })
    try {
      const id = generateId()
      expect(id).toHaveLength(21)
      expect(id).toMatch(URL_SAFE)
    } finally {
      spy.mockRestore()
    }
  })
})
