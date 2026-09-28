import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubApiError, searchGitHub, type SearchOptions } from '../api/github'
import { SEARCH_CACHE_TTL_MS } from '../api/searchCache'
import { SearchQueryError } from '../lib/searchQuery'
import type { RepositorySearchParams, RepositorySearchResponse } from '../types/github'
import { useGitHubSearch } from './useGitHubSearch'

vi.mock('../api/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/github')>()),
  searchGitHub: vi.fn(),
}))

interface PendingSearch {
  params: unknown
  options: SearchOptions
  signal: AbortSignal
  resolve: (data: unknown) => void
  reject: (error: unknown) => void
}

/** Every searchGitHub call, in order, settled manually by the test */
let searches: PendingSearch[]

beforeEach(() => {
  searches = []
  vi.mocked(searchGitHub).mockImplementation((_type, params, options = {}) => {
    return new Promise<unknown>((resolve, reject) => {
      searches.push({ params, options, signal: options.signal!, resolve, reject })
    }) as Promise<never>
  })
})

afterEach(() => {
  vi.mocked(searchGitHub).mockReset()
})

function response(name: string): RepositorySearchResponse {
  return {
    total_count: 1,
    incomplete_results: false,
    items: [{ name } as RepositorySearchResponse['items'][number]],
  }
}

async function settle(search: PendingSearch, outcome: { data: unknown } | { error: unknown }) {
  await act(async () => {
    if ('data' in outcome) search.resolve(outcome.data)
    else search.reject(outcome.error)
  })
}

interface Props {
  params: RepositorySearchParams | null
  options?: Omit<SearchOptions, 'signal'>
}

function renderSearch(initialProps: Props) {
  return renderHook(({ params, options }: Props) => useGitHubSearch('repositories', params, options), {
    initialProps,
  })
}

describe('idle', () => {
  it('stays idle and does not search when params are null', () => {
    const { result } = renderSearch({ params: null })

    expect(result.current.status).toBe('idle')
    expect(searches).toHaveLength(0)
  })

  it.each(['', '   '])('stays idle for a blank query %j', (q) => {
    const { result } = renderSearch({ params: { q } })

    expect(result.current.status).toBe('idle')
    expect(searches).toHaveLength(0)
  })

  it('returns to idle when the query is cleared', async () => {
    const { result, rerender } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { data: response('react') })
    expect(result.current.status).toBe('success')

    rerender({ params: { q: '' } })
    expect(result.current).toMatchObject({ status: 'idle', data: undefined })
  })
})

describe('request lifecycle', () => {
  it('goes from loading to success', async () => {
    const { result } = renderSearch({ params: { q: 'react', sort: 'stars' } })

    expect(result.current.status).toBe('loading')
    expect(vi.mocked(searchGitHub)).toHaveBeenCalledWith(
      'repositories',
      { q: 'react', sort: 'stars' },
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    )

    const data = response('react')
    await settle(searches[0], { data })
    expect(result.current).toMatchObject({ status: 'success', data, error: undefined })
  })

  it('goes from loading to error', async () => {
    const { result } = renderSearch({ params: { q: 'react' } })
    const error = new Error('boom')

    await settle(searches[0], { error })
    expect(result.current).toMatchObject({ status: 'error', data: undefined, error })
  })

  it('wraps non-Error rejections in an Error', async () => {
    const { result } = renderSearch({ params: { q: 'react' } })

    await settle(searches[0], { error: 'network down' })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('network down')
  })
})

describe('request identity', () => {
  it('does not refetch when rerendered with an equal params object', () => {
    const { rerender } = renderSearch({ params: { q: 'react', page: 1 } })

    rerender({ params: { q: 'react', page: 1 } })
    rerender({ params: { q: 'react', page: 1 } })
    expect(searches).toHaveLength(1)
  })

  it('aborts the previous request when params change', () => {
    const { rerender } = renderSearch({ params: { q: 'react' } })

    rerender({ params: { q: 'vue' } })
    expect(searches).toHaveLength(2)
    expect(searches[0].signal.aborted).toBe(true)
    expect(searches[1].signal.aborted).toBe(false)
  })

  it('ignores a stale response that arrives after a newer one', async () => {
    const { result, rerender } = renderSearch({ params: { q: 'react' } })
    rerender({ params: { q: 'vue' } })
    const [stale, current] = searches

    // A stale response arriving first must not be shown for the new query
    await settle(stale, { data: response('react') })
    expect(result.current.status).toBe('loading')

    await settle(current, { data: response('vue') })
    await settle(stale, { data: response('react') })
    expect(result.current.data).toEqual(response('vue'))
  })

  it('aborts the in-flight request on unmount', () => {
    const { unmount } = renderSearch({ params: { q: 'react' } })

    unmount()
    expect(searches[0].signal.aborted).toBe(true)
  })

  it('refetches when options change', () => {
    const { rerender } = renderSearch({ params: { q: 'react' }, options: { token: 'a' } })

    rerender({ params: { q: 'react' }, options: { token: 'b' } })
    expect(searches).toHaveLength(2)
    expect(searches[0].signal.aborted).toBe(true)
    expect(searches[1].options.token).toBe('b')
  })
})

describe('refetch', () => {
  it('retries the same search after an error', async () => {
    const { result } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { error: new Error('boom') })
    expect(result.current.status).toBe('error')

    act(() => result.current.refetch())
    expect(result.current.status).toBe('loading')
    expect(searches).toHaveLength(2)
    expect(searches[1].params).toEqual({ q: 'react' })

    const data = response('react')
    await settle(searches[1], { data })
    expect(result.current).toMatchObject({ status: 'success', data })
  })

  it('keeps the same refetch function across renders', () => {
    const { result, rerender } = renderSearch({ params: { q: 'react' } })
    const { refetch } = result.current

    rerender({ params: { q: 'vue' } })
    expect(result.current.refetch).toBe(refetch)
  })
})

describe('rate limit', () => {
  const now = new Date('2026-09-27T10:00:00Z')
  const rateLimited = () =>
    new GitHubApiError(403, null, { type: 'primary', resetAt: new Date(now.getTime() + 30_000) })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries automatically once the limit resets', async () => {
    const { result } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { error: rateLimited() })
    expect(result.current.status).toBe('error')

    act(() => {

      vi.advanceTimersByTime(29_000)

    })
    expect(searches).toHaveLength(1)

    act(() => {

      vi.advanceTimersByTime(2_000)

    })
    expect(result.current.status).toBe('loading')
    expect(searches).toHaveLength(2)
    expect(searches[1].params).toEqual({ q: 'react' })
  })

  it('retries whatever query is on screen when the limit resets', async () => {
    const error = rateLimited()
    const { rerender } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { error })

    act(() => {

      vi.advanceTimersByTime(10_000)

    })
    rerender({ params: { q: 'vue' } })
    // searchGitHub fails fast with the same error while the limit lasts
    await settle(searches[1], { error })

    act(() => {

      vi.advanceTimersByTime(21_000)

    })
    expect(searches).toHaveLength(3)
    expect(searches[2].params).toEqual({ q: 'vue' })
  })

  it('does not retry once the query is cleared', async () => {
    const { rerender } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { error: rateLimited() })

    rerender({ params: null })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(searches).toHaveLength(1)
  })
})

describe('cache', () => {
  it('shows a revisited query instantly without searching again', async () => {
    const { result, rerender } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { data: response('react') })
    rerender({ params: { q: 'vue' } })
    await settle(searches[1], { data: response('vue') })

    rerender({ params: { q: 'react' } })
    expect(result.current).toMatchObject({ status: 'success', data: response('react') })
    expect(searches).toHaveLength(2)
  })

  it('serves a fresh mount from the cache', async () => {
    const first = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { data: response('react') })
    first.unmount()

    const { result } = renderSearch({ params: { q: 'react' } })
    expect(result.current).toMatchObject({ status: 'success', data: response('react') })
    expect(searches).toHaveLength(1)
  })

  it('shares entries between equivalent params', async () => {
    const { result, rerender } = renderSearch({ params: { q: 'react', page: 1 } })
    await settle(searches[0], { data: response('react') })

    rerender({ params: { page: 1, q: 'react', sort: undefined } })
    expect(result.current.status).toBe('success')
    expect(searches).toHaveLength(1)
  })

  it('does not cache errors', async () => {
    const { result, rerender } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { error: new Error('boom') })
    rerender({ params: { q: 'vue' } })

    rerender({ params: { q: 'react' } })
    expect(result.current.status).toBe('loading')
    expect(searches).toHaveLength(3)
  })

  it('bypasses and refreshes the cache on refetch', async () => {
    const { result } = renderSearch({ params: { q: 'react' } })
    await settle(searches[0], { data: response('old') })

    act(() => result.current.refetch())
    expect(result.current.status).toBe('loading')
    expect(searches).toHaveLength(2)

    await settle(searches[1], { data: response('new') })
    expect(result.current.data).toEqual(response('new'))

    // The refreshed result replaces the old cache entry
    const remounted = renderSearch({ params: { q: 'react' } })
    expect(remounted.result.current.data).toEqual(response('new'))
  })

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('searches again once the entry has expired', async () => {
      const { result, rerender } = renderSearch({ params: { q: 'react' } })
      await settle(searches[0], { data: response('react') })
      rerender({ params: { q: 'vue' } })

      vi.advanceTimersByTime(SEARCH_CACHE_TTL_MS)
      rerender({ params: { q: 'react' } })
      expect(result.current.status).toBe('loading')
      expect(searches).toHaveLength(3)
    })

    it('keeps showing a cached result that expires while on screen', async () => {
      const first = renderSearch({ params: { q: 'react' } })
      await settle(searches[0], { data: response('react') })
      first.unmount()

      const { result, rerender } = renderSearch({ params: { q: 'react' } })
      // Let the cache hit settle into state
      await act(async () => {})

      vi.advanceTimersByTime(SEARCH_CACHE_TTL_MS)
      rerender({ params: { q: 'react' } })
      expect(result.current).toMatchObject({ status: 'success', data: response('react') })
      expect(searches).toHaveLength(1)
    })
  })
})

describe('query validation', () => {
  const tooLong = 'a'.repeat(257)

  it('fails an invalid query straight away, without a request', () => {
    const { result } = renderSearch({ params: { q: tooLong } })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBeInstanceOf(SearchQueryError)
    expect(searches).toHaveLength(0)
  })

  it('searches once the query is fixed', () => {
    const { result, rerender } = renderSearch({ params: { q: tooLong } })

    rerender({ params: { q: 'react' } })
    expect(result.current.status).toBe('loading')
    expect(searches).toHaveLength(1)
  })

  it('does not send a request when refetching an invalid query', () => {
    const { result } = renderSearch({ params: { q: tooLong } })

    act(() => result.current.refetch())
    expect(result.current.status).toBe('error')
    expect(searches).toHaveLength(0)
  })
})
