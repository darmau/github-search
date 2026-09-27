import { useEffect, useRef, useState } from 'react'
import { GitHubApiError, SEARCH_MAX_RESULTS } from '../api/github'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { useGitHubSearch } from '../hooks/useGitHubSearch'
import { useGitHubToken } from '../hooks/useGitHubToken'
import { useSearchUrlState } from '../hooks/useSearchUrlState'
import { formatNumber } from '../lib/format'
import { getTotalPages } from '../lib/pagination'
import { SearchQueryError } from '../lib/searchQuery'
import {
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  type SearchSort,
  type SearchUrlState,
} from '../lib/searchUrl'
import { Pagination } from './Pagination'
import { RepositoryList } from './RepositoryList'
import { SearchInput } from './SearchInput'
import { SortSelect } from './SortSelect'

/** Unauthenticated search allows 10 req/min, so wait for typing to pause */
export const SEARCH_DEBOUNCE_MS = 400

export function RepositorySearch() {
  // The URL holds the committed search; the input holds what is being typed
  const [{ q, sort, order, page, perPage }, navigate] = useSearchUrlState(restoreFromHistory)
  const [input, setInput] = useState(q)
  const resultsRef = useRef<HTMLDivElement>(null)

  const commitQuery = useDebouncedCallback((text: string) => {
    const next = text.trim()
    // Typing is not worth a history entry per pause, so the query replaces it
    navigate((prev) => (prev.q === next ? prev : { ...prev, q: next, page: 1 }), 'replace')
  }, SEARCH_DEBOUNCE_MS)

  function restoreFromHistory(state: SearchUrlState) {
    // Back/forward wins over a half-typed query that hasn't been committed yet
    commitQuery.cancel()
    setInput(state.q)
  }

  // A saved token takes over from the build-time one; changing it searches again
  const token = useGitHubToken()

  // GitHub does the ordering, so the whole result set is sorted, not just this page
  const search = useGitHubSearch(
    'repositories',
    q ? { q, ...(sort && { sort, order }), per_page: perPage, page } : null,
    { token: token ?? undefined },
  )

  // The URL may ask for a page past the end of this search, e.g. a stale link or
  // a hand-edited one. GitHub answers that with no items, which would read as
  // "no matches", so move to the last page instead.
  const lastPage =
    search.status === 'success'
      ? getTotalPages(search.data.total_count, perPage, SEARCH_MAX_RESULTS)
      : null
  const pageOutOfRange = lastPage !== null && page > lastPage

  useEffect(() => {
    if (lastPage === null) return
    // Not a page the user chose, so it shouldn't leave a history entry behind
    navigate((prev) => (prev.page > lastPage ? { ...prev, page: lastPage } : prev), 'replace')
  }, [lastPage, navigate])

  function changeInput(text: string) {
    setInput(text)
    commitQuery.run(text)
  }

  function goToPage(next: number) {
    // Each page gets its own history entry, so Back returns to the previous one
    navigate((prev) => ({ ...prev, page: next }), 'push')
    // Bring the top of the list back into view when paging from the bottom
    const el = resultsRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
  }

  function changePageSize(size: number) {
    navigate((prev) => ({ ...prev, perPage: size, page: 1 }), 'replace')
  }

  function changeSort(next: SearchSort) {
    navigate((prev) => ({ ...prev, ...next, page: 1 }), 'replace')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchInput
            value={input}
            onChange={changeInput}
            placeholder="Search repositories, e.g. react language:typescript stars:>1000"
          />
        </div>
        <SortSelect value={{ sort, order }} options={SORT_OPTIONS} onChange={changeSort} />
      </div>

      <div
        ref={resultsRef}
        aria-live="polite"
        aria-busy={search.status === 'loading' || pageOutOfRange}
      >
        {search.status === 'idle' && (
          <p className="py-12 text-center text-gray-500">Type a keyword to search GitHub repositories.</p>
        )}

        {(search.status === 'loading' || pageOutOfRange) && <LoadingList />}

        {search.status === 'error' && <SearchError error={search.error} hasToken={token !== null} onRetry={search.refetch} />}

        {search.status === 'success' &&
          !pageOutOfRange &&
          (search.data.items.length === 0 ? (
            <p className="py-12 text-center text-gray-500">
              No repositories match <strong className="text-gray-700 dark:text-gray-300">{q}</strong>.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                {formatNumber(search.data.total_count)} repositories
                {search.data.total_count > SEARCH_MAX_RESULTS &&
                  ` · first ${formatNumber(SEARCH_MAX_RESULTS)} shown`}
                {search.data.incomplete_results && ' (results may be incomplete)'}
              </p>
              <RepositoryList items={search.data.items} />
              <Pagination
                page={page}
                pageSize={perPage}
                totalCount={search.data.total_count}
                onPageChange={goToPage}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSizeChange={changePageSize}
              />
              {search.data.total_count > SEARCH_MAX_RESULTS && page === lastPage && (
                <ResultLimitNotice />
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

function ResultLimitNotice() {
  return (
    <p className="rounded-lg border border-gray-200 bg-gray-100 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      GitHub search only returns the first {formatNumber(SEARCH_MAX_RESULTS)} results. Narrow your
      query to see others, e.g. add <code className="font-mono">language:rust</code>,{' '}
      <code className="font-mono">stars:&gt;500</code> or <code className="font-mono">pushed:&gt;2026-01-01</code>.
    </p>
  )
}

interface SearchErrorProps {
  error: Error
  hasToken: boolean
  onRetry: () => void
}

function SearchError({ error, hasToken, onRetry }: SearchErrorProps) {
  const apiError = error instanceof GitHubApiError ? error : null
  // Retrying can't fix an invalid query or a bad token, only editing them can.
  // Either edit starts a new search by itself.
  const retryable = !(error instanceof SearchQueryError) && apiError?.status !== 401

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      <div className="space-y-1">
        <p>{error.message}</p>
        {apiError?.rateLimit && !hasToken && (
          <p>Add a GitHub token (top right) to raise the limit to 30 searches a minute.</p>
        )}
        {apiError?.status === 401 && hasToken && <p>Replace or remove it under Token saved (top right).</p>}
      </div>
      {retryable && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
        >
          Retry
        </button>
      )}
    </div>
  )
}

function LoadingList() {
  return (
    <ul aria-label="Loading results" className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="flex animate-pulse gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="size-10 rounded-full bg-gray-200 dark:bg-gray-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        </li>
      ))}
    </ul>
  )
}
