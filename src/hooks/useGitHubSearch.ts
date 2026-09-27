import { useCallback, useEffect, useState } from 'react'
import { searchGitHub, type SearchOptions } from '../api/github'
import type { SearchEndpoints, SearchType } from '../types/github'

export type SearchState<TData> =
  | { status: 'idle'; data: undefined; error: undefined }
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'success'; data: TData; error: undefined }
  | { status: 'error'; data: undefined; error: Error }

export type UseGitHubSearchResult<TData> = SearchState<TData> & {
  /** Re-run the current search, e.g. from a "Retry" button */
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

  const key = params && params.q.trim() ? JSON.stringify([type, params, options]) : null
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<TData> | null>(null)

  useEffect(() => {
    if (key === null) return

    const [reqType, reqParams, reqOptions] = JSON.parse(key) as [
      T,
      SearchEndpoints[T]['params'],
      Omit<SearchOptions, 'signal'>,
    ]
    const controller = new AbortController()

    searchGitHub(reqType, reqParams, { ...reqOptions, signal: controller.signal })
      .then((data) => setSettled({ key, attempt, data }))
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

  const refetch = useCallback(() => setAttempt((n) => n + 1), [])

  // Loading is derived rather than stored: the latest settled result is only
  // valid if it belongs to the current request.
  let state: SearchState<TData>
  if (key === null) {
    state = { status: 'idle', data: undefined, error: undefined }
  } else if (!settled || settled.key !== key || settled.attempt !== attempt) {
    state = { status: 'loading', data: undefined, error: undefined }
  } else if (settled.error) {
    state = { status: 'error', data: undefined, error: settled.error }
  } else {
    state = { status: 'success', data: settled.data as TData, error: undefined }
  }

  return { ...state, refetch }
}
