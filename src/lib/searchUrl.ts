import { SEARCH_MAX_RESULTS } from '../api/github'
import type { SearchEndpoints, SearchOrder, SearchType } from '../types/github'
import { getTotalPages } from './pagination'

/** The API allows up to 100 per page */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50, 100]
export const DEFAULT_PAGE_SIZE = 20

/** Every kind of search, in the order the UI offers them */
export const SEARCH_TYPES: readonly SearchType[] = [
  'repositories',
  'code',
  'issues',
  'commits',
  'users',
  'topics',
  'labels',
]

export const DEFAULT_SEARCH_TYPE: SearchType = 'repositories'

/** The `sort` values a search type accepts; never for types without one */
export type SortFor<T extends SearchType> = T extends SearchType
  ? SortParam<SearchEndpoints[T]['params']>
  : never

type SortParam<TParams> = TParams extends { sort?: infer S } ? NonNullable<S> : never

/** A `sort` value accepted by any search type */
export type SearchSortKey = SortFor<SearchType>

/**
 * How GitHub should order the results. `sort: null` is GitHub's best match,
 * which has no order of its own, so `order` is always "desc" then.
 */
export interface SearchSort<TSort extends SearchSortKey = SearchSortKey> {
  sort: TSort | null
  order: SearchOrder
}

export interface SortOption<TSort extends SearchSortKey = SearchSortKey> extends SearchSort<TSort> {
  label: string
}

export const DEFAULT_SORT: SearchSort<never> = { sort: null, order: 'desc' }

const BEST_MATCH: SortOption<never> = { ...DEFAULT_SORT, label: 'Best match' }

/**
 * The orderings offered in the UI for each search type; the URL can only
 * select one of these. Code search's only sort (`indexed`) is deprecated and
 * topic search has none, so both offer best match alone.
 */
export const SORT_OPTIONS: { readonly [T in SearchType]: readonly SortOption<SortFor<T>>[] } = {
  repositories: [
    BEST_MATCH,
    { sort: 'stars', order: 'desc', label: 'Most stars' },
    { sort: 'stars', order: 'asc', label: 'Fewest stars' },
    { sort: 'forks', order: 'desc', label: 'Most forks' },
    { sort: 'forks', order: 'asc', label: 'Fewest forks' },
    { sort: 'help-wanted-issues', order: 'desc', label: 'Most help wanted issues' },
    { sort: 'updated', order: 'desc', label: 'Recently updated' },
    { sort: 'updated', order: 'asc', label: 'Least recently updated' },
  ],
  code: [BEST_MATCH],
  issues: [
    BEST_MATCH,
    { sort: 'created', order: 'desc', label: 'Newest' },
    { sort: 'created', order: 'asc', label: 'Oldest' },
    { sort: 'comments', order: 'desc', label: 'Most commented' },
    { sort: 'comments', order: 'asc', label: 'Least commented' },
    { sort: 'updated', order: 'desc', label: 'Recently updated' },
    { sort: 'updated', order: 'asc', label: 'Least recently updated' },
    { sort: 'interactions', order: 'desc', label: 'Most interactions' },
    { sort: 'reactions', order: 'desc', label: 'Most reactions' },
    { sort: 'reactions-+1', order: 'desc', label: 'Most 👍' },
    { sort: 'reactions--1', order: 'desc', label: 'Most 👎' },
    { sort: 'reactions-smile', order: 'desc', label: 'Most 😄' },
    { sort: 'reactions-tada', order: 'desc', label: 'Most 🎉' },
    { sort: 'reactions-heart', order: 'desc', label: 'Most ❤️' },
    { sort: 'reactions-thinking_face', order: 'desc', label: 'Most 😕' },
  ],
  commits: [
    BEST_MATCH,
    { sort: 'author-date', order: 'desc', label: 'Newest authored' },
    { sort: 'author-date', order: 'asc', label: 'Oldest authored' },
    { sort: 'committer-date', order: 'desc', label: 'Newest committed' },
    { sort: 'committer-date', order: 'asc', label: 'Oldest committed' },
  ],
  users: [
    BEST_MATCH,
    { sort: 'followers', order: 'desc', label: 'Most followers' },
    { sort: 'followers', order: 'asc', label: 'Fewest followers' },
    { sort: 'repositories', order: 'desc', label: 'Most repositories' },
    { sort: 'repositories', order: 'asc', label: 'Fewest repositories' },
    { sort: 'joined', order: 'desc', label: 'Newest joined' },
    { sort: 'joined', order: 'asc', label: 'Oldest joined' },
  ],
  topics: [BEST_MATCH],
  labels: [
    BEST_MATCH,
    { sort: 'created', order: 'desc', label: 'Newest' },
    { sort: 'created', order: 'asc', label: 'Oldest' },
    { sort: 'updated', order: 'desc', label: 'Recently updated' },
    { sort: 'updated', order: 'asc', label: 'Least recently updated' },
  ],
}

/** What is being searched, as stored in `?type=…&q=…&sort=…&order=…&page=…&per_page=…` */
export interface SearchUrlState extends SearchSort {
  /** Always one whose `SORT_OPTIONS` include `sort` */
  type: SearchType
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
  const type = parseType(params.get('type'))
  const q = (params.get('q') ?? '').trim()

  const perPage = Number(params.get('per_page'))
  const validPerPage = PAGE_SIZE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PAGE_SIZE

  // Pages past the 1000-result limit would make the API reject the request
  const page = Number(params.get('page'))
  const lastPage = getTotalPages(SEARCH_MAX_RESULTS, validPerPage)
  const validPage = q && Number.isInteger(page) && page >= 1 ? Math.min(page, lastPage) : 1

  return { type, q, ...parseSort(type, params), page: validPage, perPage: validPerPage }
}

function parseType(value: string | null): SearchType {
  return SEARCH_TYPES.find((type) => type === value) ?? DEFAULT_SEARCH_TYPE
}

function parseSort(type: SearchType, params: URLSearchParams): SearchSort {
  const options: readonly SortOption[] = SORT_OPTIONS[type]
  const sort = params.get('sort')
  const order = params.get('order') === 'asc' ? 'asc' : 'desc'
  // An order that isn't offered for this sort falls back to its default one,
  // and a sort this type doesn't offer falls back to best match
  const match =
    options.find((o) => o.sort === sort && o.order === order) ??
    options.find((o) => o.sort === sort)
  return match ? { sort: match.sort, order: match.order } : DEFAULT_SORT
}

/**
 * Writes search state into a query string, leaving defaults out so a fresh
 * search keeps a short URL. Params that aren't ours are kept.
 */
export function toSearchUrl(
  { type, q, sort, order, page, perPage }: SearchUrlState,
  current = '',
): string {
  const params = new URLSearchParams(current)
  setParam(params, 'type', type !== DEFAULT_SEARCH_TYPE ? type : null)
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
    a.type === b.type &&
    a.q === b.q &&
    isSameSort(a, b) &&
    a.page === b.page &&
    a.perPage === b.perPage
  )
}

export function isSameSort(a: SearchSort, b: SearchSort): boolean {
  return a.sort === b.sort && a.order === b.order
}

/**
 * The sort to request from the `type` endpoint, typed for its params. Falls
 * back to best match for a sort that endpoint doesn't offer.
 */
export function sortFor<T extends SearchType>(type: T, { sort, order }: SearchSort): SearchSort<SortFor<T>> {
  const options: readonly SortOption[] = SORT_OPTIONS[type]
  const offered = options.some((o) => o.sort === sort)
  return offered ? { sort: sort as SortFor<T> | null, order } : DEFAULT_SORT
}

/**
 * Switches to another kind of search. The query is kept, but the sort may not
 * exist for the new type, and the page belongs to the old result set.
 */
export function withSearchType(state: SearchUrlState, type: SearchType): SearchUrlState {
  if (state.type === type) return state
  return { ...state, type, ...DEFAULT_SORT, page: 1 }
}

function setParam(params: URLSearchParams, name: string, value: string | null) {
  if (value === null) params.delete(name)
  else params.set(name, value)
}
