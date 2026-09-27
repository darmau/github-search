import { describe, expect, it } from 'vitest'
import { getPageItems } from './pagination'

describe('getPageItems', () => {
  it('lists every page when they all fit', () => {
    expect(getPageItems(1, 1)).toEqual([1])
    expect(getPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('collapses the end when near the start', () => {
    expect(getPageItems(1, 50)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 50])
    expect(getPageItems(4, 50)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 50])
  })

  it('collapses the start when near the end', () => {
    expect(getPageItems(50, 50)).toEqual([1, 'ellipsis', 46, 47, 48, 49, 50])
    expect(getPageItems(47, 50)).toEqual([1, 'ellipsis', 46, 47, 48, 49, 50])
  })

  it('collapses both sides in the middle', () => {
    expect(getPageItems(25, 50)).toEqual([1, 'ellipsis', 24, 25, 26, 'ellipsis', 50])
  })

  it('never hides a single page behind an ellipsis', () => {
    // Not [1, …, 3, 4, 5, …, 50], where "…" would stand in for page 2 alone
    expect(getPageItems(4, 50)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 50])
    // From here on the ellipsis hides at least two pages (2 and 3)
    expect(getPageItems(5, 50)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 50])
  })

  it('keeps a constant length so the controls do not jump', () => {
    const lengths = new Set(Array.from({ length: 50 }, (_, i) => getPageItems(i + 1, 50).length))
    expect([...lengths]).toEqual([7])
  })

  it('widens the window with more siblings', () => {
    expect(getPageItems(25, 50, 2)).toEqual([1, 'ellipsis', 23, 24, 25, 26, 27, 'ellipsis', 50])
  })
})
