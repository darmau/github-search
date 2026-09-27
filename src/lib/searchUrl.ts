import { SEARCH_MAX_RESULTS } from '../api/github'
import { getTotalPages } from './pagination'

/** The API allows up to 100 per page */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50, 100]
export const DEFAULT_PAGE_SIZE = 20

/** What is being searched, as stored in `?q=…&page=…&per_page=…` */
export interface SearchUrlState {
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

  return { q, page: validPage, perPage: validPerPage }
}

/**
 * Writes search state into a query string, leaving defaults out so a fresh
 * search keeps a short URL. Params that aren't ours are kept.
 */
export function toSearchUrl({ q, page, perPage }: SearchUrlState, current = ''): string {
  const params = new URLSearchParams(current)
  setParam(params, 'q', q || null)
  setParam(params, 'page', q && page > 1 ? String(page) : null)
  setParam(params, 'per_page', perPage !== DEFAULT_PAGE_SIZE ? String(perPage) : null)

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function isSameSearch(a: SearchUrlState, b: SearchUrlState): boolean {
  return a.q === b.q && a.page === b.page && a.perPage === b.perPage
}

function setParam(params: URLSearchParams, name: string, value: string | null) {
  if (value === null) params.delete(name)
  else params.set(name, value)
}
