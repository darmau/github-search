import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT, parseSearchUrl, toSearchUrl } from './searchUrl'

describe('parseSearchUrl', () => {
  it('falls back to defaults for an empty URL', () => {
    expect(parseSearchUrl('')).toEqual({ q: '', ...DEFAULT_SORT, page: 1, perPage: DEFAULT_PAGE_SIZE })
  })

  it('reads q, page and per_page', () => {
    expect(parseSearchUrl('?q=react&sort=forks&order=asc&page=3&per_page=50')).toEqual({
      q: 'react',
      sort: 'forks',
      order: 'asc',
      page: 3,
      perPage: 50,
    })
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

  it('defaults the order to descending', () => {
    expect(parseSearchUrl('?q=react&sort=stars')).toMatchObject({ sort: 'stars', order: 'desc' })
  })

  it.each(['?sort=name', '?sort=', '?order=asc'])('treats %j as best match', (search) => {
    expect(parseSearchUrl(`${search}&q=react`)).toMatchObject(DEFAULT_SORT)
  })

  it('falls back to the default order when one is not offered for the sort', () => {
    expect(parseSearchUrl('?q=react&sort=help-wanted-issues&order=asc')).toMatchObject({
      sort: 'help-wanted-issues',
      order: 'desc',
    })
  })
})

describe('toSearchUrl', () => {
  it('leaves defaults out', () => {
    expect(toSearchUrl({ q: '', ...DEFAULT_SORT, page: 1, perPage: DEFAULT_PAGE_SIZE })).toBe('')
    expect(toSearchUrl({ q: 'react', ...DEFAULT_SORT, page: 1, perPage: DEFAULT_PAGE_SIZE })).toBe(
      '?q=react',
    )
    expect(toSearchUrl({ q: 'react', sort: 'stars', order: 'desc', page: 1, perPage: DEFAULT_PAGE_SIZE })).toBe(
      '?q=react&sort=stars',
    )
  })

  it('writes non-default values', () => {
    expect(toSearchUrl({ q: 'react', sort: 'updated', order: 'asc', page: 2, perPage: 50 })).toBe(
      '?q=react&sort=updated&order=asc&page=2&per_page=50',
    )
  })

  it('drops the page when there is no query', () => {
    expect(toSearchUrl({ q: '', ...DEFAULT_SORT, page: 3, perPage: 50 })).toBe('?per_page=50')
  })

  it('keeps unrelated params and removes stale ones', () => {
    expect(
      toSearchUrl(
        { q: 'vue', ...DEFAULT_SORT, page: 1, perPage: DEFAULT_PAGE_SIZE },
        '?ref=home&q=react&sort=stars&order=asc&page=4',
      ),
    ).toBe(
      '?ref=home&q=vue',
    )
  })

  it('round-trips through parseSearchUrl', () => {
    const state = {
      q: 'react language:typescript stars:>1000',
      sort: 'stars',
      order: 'asc',
      page: 7,
      perPage: 100,
    } as const
    expect(parseSearchUrl(toSearchUrl(state))).toEqual(state)
  })
})
