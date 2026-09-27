import { useState } from 'react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useGitHubSearch } from '../hooks/useGitHubSearch'
import { formatNumber } from '../lib/format'
import { RepositoryList } from './RepositoryList'
import { SearchInput } from './SearchInput'

/** Unauthenticated search allows 10 req/min, so wait for typing to pause */
export const SEARCH_DEBOUNCE_MS = 400
const PAGE_SIZE = 20

export function RepositorySearch() {
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS)
  const search = useGitHubSearch('repositories', q ? { q, per_page: PAGE_SIZE } : null)

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search repositories, e.g. react language:typescript stars:>1000"
      />

      <div aria-live="polite" aria-busy={search.status === 'loading'}>
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
