import { SEARCH_MAX_RESULTS } from '../api/github'
import type { RepositorySearchSort, SearchOrder } from '../types/github'
import { getTotalPages } from './pagination'

/** The API allows up to 100 per page */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50, 100]
export const DEFAULT_PAGE_SIZE = 20

/**
 * How GitHub should order the results. `sort: null` is GitHub's best match,
 * which has no order of its own, so `order` is always "desc" then.
 */
export interface SearchSort {
  sort: RepositorySearchSort | null
  order: SearchOrder
}

export interface SortOption extends SearchSort {
  label: string
}

export const DEFAULT_SORT: SearchSort = { sort: null, order: 'desc' }

/** The orderings offered in the UI; the URL can only select one of these */
export const SORT_OPTIONS: readonly SortOption[] = [
  { ...DEFAULT_SORT, label: 'Best match' },
  { sort: 'stars', order: 'desc', label: 'Most stars' },
  { sort: 'stars', order: 'asc', label: 'Fewest stars' },
  { sort: 'forks', order: 'desc', label: 'Most forks' },
  { sort: 'forks', order: 'asc', label: 'Fewest forks' },
  { sort: 'help-wanted-issues', order: 'desc', label: 'Most help wanted issues' },
  { sort: 'updated', order: 'desc', label: 'Recently updated' },
  { sort: 'updated', order: 'asc', label: 'Least recently updated' },
]

/** What is being searched, as stored in `?q=…&sort=…&order=…&page=…&per_page=…` */
export interface SearchUrlState extends SearchSort {
  q: string
  page: number
  perPage: number
}

/**
 * Reads search state from a query string, falling back to defaults for
 * anything missing or invalid, since URLs can be hand-edited or stale.
 */
export function parseSearchUrl(search: string): SearchUrlState {
  const params = new URLSearchParams(search)
  const q = (params.get('q') ?? '').trim()

  const perPage = Number(params.get('per_page'))
  const validPerPage = PAGE_SIZE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PAGE_SIZE

  // Pages past the 1000-result limit would make the API reject the request
  const page = Number(params.get('page'))
  const lastPage = getTotalPages(SEARCH_MAX_RESULTS, validPerPage)
  const validPage = q && Number.isInteger(page) && page >= 1 ? Math.min(page, lastPage) : 1

  return { q, ...parseSort(params), page: validPage, perPage: validPerPage }
}

function parseSort(params: URLSearchParams): SearchSort {
  const sort = params.get('sort')
  const order = params.get('order') === 'asc' ? 'asc' : 'desc'
  // An order that isn't offered for this sort falls back to its default one
  const match =
    SORT_OPTIONS.find((o) => o.sort === sort && o.order === order) ??
    SORT_OPTIONS.find((o) => o.sort === sort)
  return match ? { sort: match.sort, order: match.order } : DEFAULT_SORT
}

/**
 * Writes search state into a query string, leaving defaults out so a fresh
 * search keeps a short URL. Params that aren't ours are kept.
 */
export function toSearchUrl({ q, sort, order, page, perPage }: SearchUrlState, current = ''): string {
  const params = new URLSearchParams(current)
  setParam(params, 'q', q || null)
  setParam(params, 'sort', sort)
  setParam(params, 'order', sort && order !== 'desc' ? order : null)
  setParam(params, 'page', q && page > 1 ? String(page) : null)
  setParam(params, 'per_page', perPage !== DEFAULT_PAGE_SIZE ? String(perPage) : null)

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function isSameSearch(a: SearchUrlState, b: SearchUrlState): boolean {
  return (
    a.q === b.q &&
    isSameSort(a, b) &&
    a.page === b.page &&
    a.perPage === b.perPage
  )
}

export function isSameSort(a: SearchSort, b: SearchSort): boolean {
  return a.sort === b.sort && a.order === b.order
}

function setParam(params: URLSearchParams, name: string, value: string | null) {
  if (value === null) params.delete(name)
  else params.set(name, value)
}
