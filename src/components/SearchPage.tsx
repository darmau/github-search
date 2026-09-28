import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GitHubApiError, MissingTokenError, SEARCH_MAX_RESULTS, searchResource } from '../api/github'
import type { SearchQuota } from '../api/rateLimit'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { useGitHubSearch } from '../hooks/useGitHubSearch'
import { useGitHubToken } from '../hooks/useGitHubToken'
import { useRepository } from '../hooks/useRepository'
import { useSearchQuota } from '../hooks/useSearchQuota'
import { useSearchUrlState } from '../hooks/useSearchUrlState'
import { formatNumber } from '../lib/format'
import { getTotalPages } from '../lib/pagination'
import { parseRepositoryName } from '../lib/repositoryName'
import { SearchQueryError } from '../lib/searchQuery'
import { SEARCH_TYPE_INFO } from '../lib/searchTypes'
import {
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  toSearchParams,
  withSearchType,
  type SearchSort,
  type SearchUrlState,
} from '../lib/searchUrl'
import type { SearchType } from '../types/github'
import { Pagination } from './Pagination'
import { RepositoryInput } from './RepositoryInput'
import { ResultList, type ResultListProps } from './ResultList'
import { SearchInput } from './SearchInput'
import { SearchTypeSelect } from './SearchTypeSelect'
import { SortSelect } from './SortSelect'

/** Unauthenticated search allows 10 req/min, so wait for typing to pause */
export const SEARCH_DEBOUNCE_MS = 400

/** Warn once no more than this share of the per-minute quota is left */
const LOW_QUOTA_RATIO = 0.2

export function SearchPage() {
  // The URL holds the committed search; the inputs hold what is being typed
  const [state, navigate] = useSearchUrlState(restoreFromHistory)
  const { type, repo, q, sort, order, page, perPage } = state
  const info = SEARCH_TYPE_INFO[type]
  const [input, setInput] = useState(q)
  const [repoInput, setRepoInput] = useState(repo)
  const resultsRef = useRef<HTMLDivElement>(null)

  const commitQuery = useDebouncedCallback((text: string) => {
    const next = text.trim()
    // Typing is not worth a history entry per pause, so the query replaces it
    navigate((prev) => (prev.q === next ? prev : { ...prev, q: next, page: 1 }), 'replace')
  }, SEARCH_DEBOUNCE_MS)

  const commitRepo = useDebouncedCallback((text: string) => {
    const next = text.trim()
    navigate((prev) => (prev.repo === next ? prev : { ...prev, repo: next, page: 1 }), 'replace')
  }, SEARCH_DEBOUNCE_MS)

  function restoreFromHistory(next: SearchUrlState) {
    // Back/forward wins over half-typed input that hasn't been committed yet
    commitQuery.cancel()
    commitRepo.cancel()
    setInput(next.q)
    setRepoInput(next.repo)
  }

  // A saved token takes over from the build-time one; changing it searches again
  const token = useGitHubToken() ?? undefined

  // Label search needs the repository's id, so look it up first, but only
  // once there is something to search for in it
  const repoName = type === 'labels' ? parseRepositoryName(repo) : null
  const repository = useRepository(q ? repoName : null, token)

  // GitHub does the ordering, so the whole result set is sorted, not just this page
  const params = toSearchParams(state, repository.data?.id)
  const search = useGitHubSearch(type, params, { token, textMatch: info.textMatch })

  const resource = searchResource(type, params ?? undefined)
  const quota = useSearchQuota(resource, token)
  const rateLimited = search.error instanceof GitHubApiError && search.error.rateLimit !== null
  // The rate limit error already says when searching resumes
  const quotaLow = quota !== undefined && !rateLimited && quota.remaining <= quota.limit * LOW_QUOTA_RATIO

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

  function changeRepoInput(text: string) {
    setRepoInput(text)
    commitRepo.run(text)
  }

  function changeType(next: SearchType) {
    // Carry over what was typed but not yet committed
    commitQuery.flush()
    commitRepo.flush()
    // A different kind of search is worth returning to with Back
    navigate((prev) => withSearchType(prev, next), 'push')
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

  const sortOptions = SORT_OPTIONS[type]
  const lookingUpRepo = type === 'labels' && repository.status === 'loading'
  const loading = search.status === 'loading' || lookingUpRepo || pageOutOfRange

  let content
  if (type === 'labels' && !repoName) {
    content = (
      <Hint>
        {repo ? (
          <>
            <strong className="text-gray-700 dark:text-gray-300">{repo}</strong> is not a repository. Enter
            one as owner/name, e.g. vercel/next.js.
          </>
        ) : (
          'Enter a repository as owner/name to search its labels.'
        )}
      </Hint>
    )
  } else if (!q) {
    content = <Hint>Type a keyword to search GitHub {info.plural}.</Hint>
  } else if (type === 'labels' && repository.status === 'error') {
    content = <SearchError error={repository.error} hasToken={token !== undefined} onRetry={repository.refetch} />
  } else if (loading) {
    content = <LoadingList />
  } else if (search.status === 'error') {
    content = <SearchError error={search.error} hasToken={token !== undefined} onRetry={search.refetch} />
  } else if (search.status === 'success') {
    const { total_count: total, items, incomplete_results: incomplete } = search.data
    content =
      items.length === 0 ? (
        <Hint>
          No {info.plural} match <strong className="text-gray-700 dark:text-gray-300">{q}</strong>
          {repository.data && <> in {repository.data.full_name}</>}.
        </Hint>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {formatNumber(total)} {total === 1 ? info.singular : info.plural}
            {total > SEARCH_MAX_RESULTS && ` · first ${formatNumber(SEARCH_MAX_RESULTS)} shown`}
            {incomplete && ' (results may be incomplete)'}
          </p>
          {/* The items were fetched for this type, which TypeScript can't follow */}
          <ResultList {...({ type, items } as ResultListProps)} />
          <Pagination
            page={page}
            pageSize={perPage}
            totalCount={total}
            onPageChange={goToPage}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={changePageSize}
          />
          {total > SEARCH_MAX_RESULTS && page === lastPage && <ResultLimitNotice type={type} />}
        </div>
      )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchTypeSelect value={type} onChange={changeType} />
        {type === 'labels' && (
          <RepositoryInput value={repoInput} onChange={changeRepoInput} onSubmit={commitRepo.flush} />
        )}
        <div className="min-w-64 flex-1">
          <SearchInput
            value={input}
            onChange={changeInput}
            // Enter searches now rather than after the typing pause
            onSubmit={commitQuery.flush}
            placeholder={info.placeholder}
          />
        </div>
        {/* Code and topic search can only be ordered by best match */}
        {sortOptions.length > 1 && <SortSelect value={{ sort, order }} options={sortOptions} onChange={changeSort} />}
      </div>

      {quotaLow && <LowQuotaNotice quota={quota} suggestToken={token === undefined && resource === 'search'} />}

      <div ref={resultsRef} aria-live="polite" aria-busy={loading}>
        {content}
      </div>
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-gray-500">{children}</p>
}

function ResultLimitNotice({ type }: { type: SearchType }) {
  const examples = SEARCH_TYPE_INFO[type].narrowWith
  return (
    <p className="rounded-lg border border-gray-200 bg-gray-100 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      GitHub search only returns the first {formatNumber(SEARCH_MAX_RESULTS)} results. Narrow your
      query to see others
      {examples.length > 0 ? (
        <>
          , e.g. add{' '}
          {examples.map((example, i) => (
            <span key={example}>
              {i > 0 && (i === examples.length - 1 ? ' or ' : ', ')}
              <code className="font-mono">{example}</code>
            </span>
          ))}
        </>
      ) : (
        ' with more specific keywords'
      )}
      .
    </p>
  )
}

function LowQuotaNotice({ quota, suggestToken }: { quota: SearchQuota; suggestToken: boolean }) {
  return (
    <p className="text-sm text-amber-700 dark:text-amber-400">
      {quota.remaining} of {quota.limit} searches left until {quota.resetAt.toLocaleTimeString()}.
      {suggestToken && ' Add a GitHub token (top right) to get 30 a minute.'}
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
  const rateLimit = apiError?.rateLimit
  // Retrying can't fix an invalid query or a bad or missing token, only
  // editing them can. Any edit starts a new search by itself. A rate limit is
  // retried automatically once it resets, and retrying sooner would fail anyway.
  const retryable =
    !(error instanceof SearchQueryError) &&
    !(error instanceof MissingTokenError) &&
    apiError?.status !== 401 &&
    !rateLimit

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      <div className="space-y-1">
        <p>{error.message}</p>
        {error instanceof MissingTokenError && <p>Add one (top right) to use this search.</p>}
        {rateLimit && <p>The search will run again automatically then.</p>}
        {rateLimit && !hasToken && (
          <p>
            Add a GitHub token (top right) to raise the limit
            {rateLimit.resource === 'search' && ' to 30 searches a minute'}.
          </p>
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
