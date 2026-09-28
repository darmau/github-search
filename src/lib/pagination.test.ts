import { describe, expect, it } from 'vitest'
import { getTotalPages } from './pagination'

describe('getTotalPages', () => {
  it('rounds partial pages up', () => {
    expect(getTotalPages(95, 20)).toBe(5)
    expect(getTotalPages(100, 20)).toBe(5)
  })

  it('stops at the result limit', () => {
    expect(getTotalPages(250_000, 20, 1000)).toBe(50)
    expect(getTotalPages(250_000, 30, 1000)).toBe(34)
  })

  it('is at least 1 even with no results', () => {
    expect(getTotalPages(0, 20)).toBe(1)
  })
})

