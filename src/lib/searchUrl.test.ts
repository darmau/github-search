import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, parseSearchUrl, toSearchUrl } from './searchUrl'

describe('parseSearchUrl', () => {
  it('falls back to defaults for an empty URL', () => {
    expect(parseSearchUrl('')).toEqual({ q: '', page: 1, perPage: DEFAULT_PAGE_SIZE })
  })

  it('reads q, page and per_page', () => {
    expect(parseSearchUrl('?q=react&page=3&per_page=50')).toEqual({ q: 'react', page: 3, perPage: 50 })
  })

  it('decodes and trims the query', () => {
    expect(parseSearchUrl('?q=++react+stars%3A%3E1000++').q).toBe('react stars:>1000')
  })

  it.each(['abc', '0', '-2', '1.5', ''])('treats page=%j as page 1', (page) => {
    expect(parseSearchUrl(`?q=react&page=${page}`).page).toBe(1)
  })

  it.each(['7', '1000', 'abc'])('treats per_page=%j as the default', (perPage) => {
    expect(parseSearchUrl(`?q=react&per_page=${perPage}`).perPage).toBe(DEFAULT_PAGE_SIZE)
  })

  it('clamps the page to the 1000-result limit', () => {
    expect(parseSearchUrl('?q=react&page=999').page).toBe(50)
    expect(parseSearchUrl('?q=react&page=999&per_page=100').page).toBe(10)
  })

  it('ignores the page without a query', () => {
    expect(parseSearchUrl('?page=4').page).toBe(1)
  })
})

describe('toSearchUrl', () => {
  it('leaves defaults out', () => {
    expect(toSearchUrl({ q: '', page: 1, perPage: DEFAULT_PAGE_SIZE })).toBe('')
    expect(toSearchUrl({ q: 'react', page: 1, perPage: DEFAULT_PAGE_SIZE })).toBe('?q=react')
  })

  it('writes non-default values', () => {
    expect(toSearchUrl({ q: 'react', page: 2, perPage: 50 })).toBe('?q=react&page=2&per_page=50')
  })

  it('drops the page when there is no query', () => {
    expect(toSearchUrl({ q: '', page: 3, perPage: 50 })).toBe('?per_page=50')
  })

  it('keeps unrelated params and removes stale ones', () => {
    expect(toSearchUrl({ q: 'vue', page: 1, perPage: DEFAULT_PAGE_SIZE }, '?ref=home&q=react&page=4')).toBe(
      '?ref=home&q=vue',
    )
  })

  it('round-trips through parseSearchUrl', () => {
    const state = { q: 'react language:typescript stars:>1000', page: 7, perPage: 100 }
    expect(parseSearchUrl(toSearchUrl(state))).toEqual(state)
  })
})
