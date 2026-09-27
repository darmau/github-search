import { useRef, useState } from 'react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useGitHubSearch } from '../hooks/useGitHubSearch'
import { formatNumber } from '../lib/format'
import { Pagination } from './Pagination'
import { RepositoryList } from './RepositoryList'
import { SearchInput } from './SearchInput'

/** Unauthenticated search allows 10 req/min, so wait for typing to pause */
export const SEARCH_DEBOUNCE_MS = 400
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

export function RepositorySearch() {
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  // The page belongs to the query it was picked for, so a new query starts at 1
  const [paging, setPaging] = useState({ q, page: 1 })
  const page = paging.q === q ? paging.page : 1
  const resultsRef = useRef<HTMLDivElement>(null)

  const search = useGitHubSearch(
    'repositories',
    q ? { q, per_page: pageSize, page } : null,
  )

  function goToPage(next: number) {
    setPaging({ q, page: next })
    // Bring the top of the list back into view when paging from the bottom
    const el = resultsRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
  }

  function changePageSize(size: number) {
    setPageSize(size)
    setPaging({ q, page: 1 })
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search repositories, e.g. react language:typescript stars:>1000"
      />

      <div ref={resultsRef} aria-live="polite" aria-busy={search.status === 'loading'}>
        {search.status === 'idle' && (
          <p className="py-12 text-center text-gray-500">Type a keyword to search GitHub repositories.</p>
        )}

        {search.status === 'loading' && <LoadingList />}

        {search.status === 'error' && <SearchError error={search.error} onRetry={search.refetch} />}

        {search.status === 'success' &&
          (search.data.items.length === 0 ? (
            <p className="py-12 text-center text-gray-500">
              No repositories match <strong className="text-gray-700 dark:text-gray-300">{q}</strong>.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                {formatNumber(search.data.total_count)} repositories
                {search.data.incomplete_results && ' (results may be incomplete)'}
              </p>
              <RepositoryList items={search.data.items} />
              <Pagination
                page={page}
                pageSize={pageSize}
                totalCount={search.data.total_count}
                onPageChange={goToPage}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSizeChange={changePageSize}
              />
            </div>
          ))}
      </div>
    </div>
  )
}

function SearchError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      <p>{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
      >
        Retry
      </button>
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
