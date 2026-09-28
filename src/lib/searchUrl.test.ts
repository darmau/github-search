import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  parseSearchUrl,
  SEARCH_TYPES,
  SORT_OPTIONS,
  sortFor,
  toSearchUrl,
  withSearchType,
  type SearchUrlState,
} from './searchUrl'

const base: SearchUrlState = {
  type: 'repositories',
  q: 'react',
  ...DEFAULT_SORT,
  page: 1,
  perPage: DEFAULT_PAGE_SIZE,
}

describe('parseSearchUrl', () => {
  it('falls back to defaults for an empty URL', () => {
    expect(parseSearchUrl('')).toEqual({ ...base, q: '' })
  })

  it('reads q, page and per_page', () => {
    expect(parseSearchUrl('?q=react&sort=forks&order=asc&page=3&per_page=50')).toEqual({
      type: 'repositories',
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

  it.each(SEARCH_TYPES)('reads type=%s', (type) => {
    expect(parseSearchUrl(`?type=${type}&q=react`).type).toBe(type)
  })

  it.each(['?type=wikis', '?type=', '?type=REPOSITORIES'])('treats %j as a repository search', (search) => {
    expect(parseSearchUrl(`${search}&q=react`).type).toBe('repositories')
  })

  it('reads a sort offered for the type', () => {
    expect(parseSearchUrl('?type=issues&q=bug&sort=reactions-%2B1')).toMatchObject({
      type: 'issues',
      sort: 'reactions-+1',
      order: 'desc',
    })
    expect(parseSearchUrl('?type=users&q=tom&sort=joined&order=asc')).toMatchObject({
      sort: 'joined',
      order: 'asc',
    })
  })

  it.each([
    '?type=users&sort=stars',
    '?type=code&sort=indexed',
    '?type=topics&sort=updated',
    '?type=commits&sort=updated',
  ])('treats a sort the type does not offer (%j) as best match', (search) => {
    expect(parseSearchUrl(`${search}&q=react`)).toMatchObject(DEFAULT_SORT)
  })
})

describe('toSearchUrl', () => {
  it('leaves defaults out', () => {
    expect(toSearchUrl({ ...base, q: '' })).toBe('')
    expect(toSearchUrl(base)).toBe('?q=react')
    expect(toSearchUrl({ ...base, sort: 'stars', order: 'desc' })).toBe('?q=react&sort=stars')
  })

  it('writes non-default values', () => {
    expect(toSearchUrl({ ...base, type: 'issues', sort: 'updated', order: 'asc', page: 2, perPage: 50 })).toBe(
      '?type=issues&q=react&sort=updated&order=asc&page=2&per_page=50',
    )
  })

  it('drops the page when there is no query', () => {
    expect(toSearchUrl({ ...base, q: '', page: 3, perPage: 50 })).toBe('?per_page=50')
  })

  it('keeps unrelated params and removes stale ones', () => {
    expect(
      toSearchUrl(
        { ...base, q: 'vue' },
        '?ref=home&type=users&q=react&sort=stars&order=asc&page=4',
      ),
    ).toBe(
      '?ref=home&q=vue',
    )
  })

  it('round-trips through parseSearchUrl', () => {
    const state: SearchUrlState = {
      type: 'repositories',
      q: 'react language:typescript stars:>1000',
      sort: 'stars',
      order: 'asc',
      page: 7,
      perPage: 100,
    }
    expect(parseSearchUrl(toSearchUrl(state))).toEqual(state)
  })

  it.each(SEARCH_TYPES.flatMap((type) => SORT_OPTIONS[type].map((option) => [type, option.label, option] as const)))(
    'round-trips %s sorted by %s',
    (type, _label, { sort, order }) => {
      const state: SearchUrlState = { ...base, type, sort, order, page: 2 }
      expect(parseSearchUrl(toSearchUrl(state))).toEqual(state)
    },
  )
})

describe('sortFor', () => {
  it('keeps a sort the type offers', () => {
    expect(sortFor('users', { sort: 'followers', order: 'asc' })).toEqual({ sort: 'followers', order: 'asc' })
  })

  it('falls back to best match for a sort the type does not offer', () => {
    expect(sortFor('users', { sort: 'stars', order: 'asc' })).toEqual(DEFAULT_SORT)
    expect(sortFor('topics', { sort: 'updated', order: 'desc' })).toEqual(DEFAULT_SORT)
  })
})

describe('withSearchType', () => {
  it('keeps the query and page size but resets the sort and page', () => {
    const state: SearchUrlState = { ...base, sort: 'stars', order: 'asc', page: 4, perPage: 50 }
    expect(withSearchType(state, 'users')).toEqual({ ...base, type: 'users', perPage: 50 })
  })

  it('leaves the state alone when the type is unchanged', () => {
    const state: SearchUrlState = { ...base, sort: 'stars', order: 'asc', page: 4 }
    expect(withSearchType(state, 'repositories')).toBe(state)
  })
})
