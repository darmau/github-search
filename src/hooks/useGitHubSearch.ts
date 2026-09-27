import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchGitHub, type SearchOptions } from '../api/github'
import {
  deleteCachedSearch,
  getCachedSearch,
  peekCachedSearch,
  searchCacheKey,
  setCachedSearch,
} from '../api/searchCache'
import { validateSearchQuery } from '../lib/searchQuery'
import type { SearchEndpoints, SearchType } from '../types/github'

export type SearchState<TData> =
  | { status: 'idle'; data: undefined; error: undefined }
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'success'; data: TData; error: undefined }
  | { status: 'error'; data: undefined; error: Error }

export type UseGitHubSearchResult<TData> = SearchState<TData> & {
  /** Re-run the current search, bypassing the cache, e.g. from a "Retry" button */
  refetch: () => void
}

interface Settled<TData> {
  key: string
  attempt: number
  data?: TData
  error?: Error
}

/**
 * Runs a GitHub search whenever `type` or `params` change.
 *
 * Pass `null` params (or an empty `q`) to stay idle. Params are compared by
 * value, so an inline object literal won't cause refetch loops. Debounce the
 * query before passing it in — unauthenticated search allows 10 req/min.
 *
 * Successful results are cached for a few minutes (see `searchCache`), so
 * revisiting a page or query shows it instantly without spending rate limit.
 * A query GitHub is known to reject fails straight away with a
 * `SearchQueryError`, without a request.
 *
 * @example
 * const result = useGitHubSearch('repositories', { q: debouncedQuery, sort: 'stars' })
 * if (result.status === 'success') result.data.items
 */
export function useGitHubSearch<T extends SearchType>(
  type: T,
  params: SearchEndpoints[T]['params'] | null,
  options: Omit<SearchOptions, 'signal'> = {},
): UseGitHubSearchResult<SearchEndpoints[T]['response']> {
  type TData = SearchEndpoints[T]['response']

  const q = params?.q.trim() ?? ''
  const queryError = useMemo(() => (q ? validateSearchQuery(q) : null), [q])
  const key = params && q && !queryError ? searchCacheKey(type, params, options) : null
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<TData> | null>(null)

  // Lets the stable `refetch` callback know which cache entry to drop
  const keyRef = useRef(key)
  useEffect(() => {
    keyRef.current = key
  }, [key])

  useEffect(() => {
    if (key === null) return

    const [reqType, reqParams, reqOptions] = JSON.parse(key) as [
      T,
      SearchEndpoints[T]['params'],
      Omit<SearchOptions, 'signal'>,
    ]
    const controller = new AbortController()

    // A cache hit still settles through state, so the result stays on screen
    // even if the entry expires while it is being shown. Reading it here, once
    // per request, is also what counts as a use for LRU eviction.
    const cached = getCachedSearch<TData>(key)
    const request =
      cached !== undefined
        ? Promise.resolve(cached)
        : searchGitHub(reqType, reqParams, { ...reqOptions, signal: controller.signal }).then(
            (data) => {
              setCachedSearch(key, data)
              return data
            },
          )

    request
      .then((data) => {
        if (!controller.signal.aborted) setSettled({ key, attempt, data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setSettled({
          key,
          attempt,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    // Cancels the in-flight request when params change or the component unmounts,
    // so a slow earlier response can never overwrite a newer one.
    return () => controller.abort()
  }, [key, attempt])

  // A result only belongs to the key it was fetched for. Drop it once the key
  // moves on, so switching back later can't resurrect an old error or a
  // result whose cache entry has since expired.
  if (settled !== null && settled.key !== key) setSettled(null)

  const refetch = useCallback(() => {
    if (keyRef.current !== null) deleteCachedSearch(keyRef.current)
    setAttempt((n) => n + 1)
  }, [])

  // Loading is derived rather than stored: the latest settled result is only
  // valid if it belongs to the current request. Until it does, a cache hit
  // is shown straight away instead of flashing a loading state.
  const current = settled?.key === key && settled.attempt === attempt ? settled : null
  // Only peeks: rendering must not mutate the cache, and may run many times
  // (or be thrown away) for the one request the effect above makes.
  const cached = key !== null && !current ? peekCachedSearch<TData>(key) : undefined

  let state: SearchState<TData>
  if (queryError) {
    state = { status: 'error', data: undefined, error: queryError }
  } else if (key === null) {
    state = { status: 'idle', data: undefined, error: undefined }
  } else if (cached !== undefined) {
    state = { status: 'success', data: cached, error: undefined }
  } else if (!current) {
    state = { status: 'loading', data: undefined, error: undefined }
  } else if (current.error) {
    state = { status: 'error', data: undefined, error: current.error }
  } else {
    state = { status: 'success', data: current.data as TData, error: undefined }
  }

  return { ...state, refetch }
}
