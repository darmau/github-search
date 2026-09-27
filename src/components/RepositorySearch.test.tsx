import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubApiError, rateLimitBucket, searchGitHub } from '../api/github'
import { recordQuota } from '../api/rateLimit'
import { setGitHubToken } from '../hooks/useGitHubToken'
import type { RepositorySearchResponse, RepositorySearchResultItem } from '../types/github'
import { RepositorySearch, SEARCH_DEBOUNCE_MS } from './RepositorySearch'

vi.mock('../api/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/github')>()),
  searchGitHub: vi.fn(),
}))

const search = vi.mocked(searchGitHub)

const repo = {
  id: 1,
  full_name: 'facebook/react',
  html_url: 'https://github.com/facebook/react',
  owner: { avatar_url: 'https://avatars.githubusercontent.com/u/69631' },
  description: 'The library for web and native user interfaces.',
  language: 'JavaScript',
  stargazers_count: 240_000,
  forks_count: 50_000,
  pushed_at: '2026-09-20T12:00:00Z',
  topics: ['react', 'ui'],
  archived: false,
} as RepositorySearchResultItem

function response(items: RepositorySearchResultItem[], total = items.length): RepositorySearchResponse {
  return { total_count: total, incomplete_results: false, items }
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
}

/** Lets the debounce fire and any settled search promise flush into state */
async function flush(ms = SEARCH_DEBOUNCE_MS) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  search.mockReset()
})

describe('RepositorySearch', () => {
  it('shows a hint and does not search before anything is typed', () => {
    render(<RepositorySearch />)

    expect(screen.getByText(/type a keyword/i)).toBeTruthy()
    expect(search).not.toHaveBeenCalled()
  })

  it('searches once typing pauses, with the trimmed query', async () => {
    search.mockResolvedValue(response([]))
    render(<RepositorySearch />)

    typeQuery('re')
    await flush(SEARCH_DEBOUNCE_MS - 100)
    typeQuery('  react  ')
    await flush(SEARCH_DEBOUNCE_MS - 1)
    expect(search).not.toHaveBeenCalled()

    await flush(1)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith(
      'repositories',
      { q: 'react', per_page: 20, page: 1 },
      expect.anything(),
    )
  })

  it('shows a loading state, then the results', async () => {
    let resolve!: (data: RepositorySearchResponse) => void
    search.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<RepositorySearch />)

    typeQuery('react')
    await flush()
    expect(screen.getByLabelText('Loading results')).toBeTruthy()

    await act(async () => resolve(response([repo], 1234)))
    expect(screen.queryByLabelText('Loading results')).toBeNull()
    expect(screen.getByText(/^1,234 repositories/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'facebook/react' }).getAttribute('href')).toBe(
      'https://github.com/facebook/react',
    )
    expect(screen.getByText(repo.description!)).toBeTruthy()
    expect(screen.getByText('240K')).toBeTruthy()
    expect(screen.getByText('ui')).toBeTruthy()
  })

  it('shows an empty state when nothing matches', async () => {
    search.mockResolvedValue(response([]))
    render(<RepositorySearch />)

    typeQuery('zzzz-no-such-repo')
    await flush()
    expect(screen.getByText(/no repositories match/i).textContent).toContain('zzzz-no-such-repo')
  })

  it('returns to the hint when the query is cleared', async () => {
    search.mockResolvedValue(response([repo]))
    render(<RepositorySearch />)

    typeQuery('react')
    await flush()
    typeQuery('   ')
    await flush()
    expect(screen.getByText(/type a keyword/i)).toBeTruthy()
    expect(search).toHaveBeenCalledTimes(1)
  })

  describe('pagination', () => {
    /** Params of the most recent search */
    const lastParams = () => search.mock.calls.at(-1)?.[1]

    it('requests the page that is clicked', async () => {
      search.mockResolvedValue(response([repo], 100))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))
      await flush(0)

      expect(lastParams()).toEqual({ q: 'react', per_page: 20, page: 3 })
      expect(screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe('page')
    })

    it('goes back to a visited page from the cache', async () => {
      search.mockResolvedValue(response([repo], 100))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
      await flush(0)
      expect(search).toHaveBeenCalledTimes(2)

      fireEvent.click(screen.getByRole('button', { name: 'Page 1' }))
      // No loading state in between: the page renders straight from the cache
      expect(screen.queryByLabelText('Loading results')).toBeNull()
      expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page')
      await flush(0)
      expect(search).toHaveBeenCalledTimes(2)
    })

    it('starts a new query on page 1', async () => {
      search.mockResolvedValue(response([repo], 100))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await flush(0)
      expect(lastParams()).toMatchObject({ q: 'react', page: 2 })

      typeQuery('vue')
      await flush()
      expect(lastParams()).toEqual({ q: 'vue', per_page: 20, page: 1 })
    })

    it('changes the page size and goes back to page 1', async () => {
      search.mockResolvedValue(response([repo], 500))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
      await flush(0)
      fireEvent.change(screen.getByLabelText('Per page'), { target: { value: '50' } })
      await flush(0)

      expect(lastParams()).toEqual({ q: 'react', per_page: 50, page: 1 })
      // 500 results / 50 per page
      expect(screen.getByRole('button', { name: 'Page 10' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Page 11' })).toBeNull()
    })
  })

  describe('sorting', () => {
    const lastParams = () => search.mock.calls.at(-1)?.[1]
    const sortSelect = () => screen.getByLabelText<HTMLSelectElement>('Sort by')

    function chooseSort(label: string) {
      const option = screen.getByRole<HTMLOptionElement>('option', { name: label })
      fireEvent.change(sortSelect(), { target: { value: option.value } })
    }

    it('uses best match by default', async () => {
      search.mockResolvedValue(response([repo]))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      expect(lastParams()).not.toHaveProperty('sort')
      expect(sortSelect().selectedOptions[0].textContent).toBe('Best match')
    })

    it('asks GitHub for the chosen order and goes back to page 1', async () => {
      search.mockResolvedValue(response([repo], 500))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
      await flush(0)
      chooseSort('Fewest stars')
      await flush(0)

      expect(lastParams()).toEqual({ q: 'react', sort: 'stars', order: 'asc', per_page: 20, page: 1 })
      expect(window.location.search).toBe('?q=react&sort=stars&order=asc')
      // Results are shown in the order GitHub returns them
      expect(screen.getByRole('link', { name: 'facebook/react' })).toBeTruthy()

      const calls = search.mock.calls.length
      chooseSort('Best match')
      await flush(0)
      expect(window.location.search).toBe('?q=react')
      // Best match page 1 was already fetched, so it comes from the cache
      expect(search).toHaveBeenCalledTimes(calls)
    })

    it('keeps the order when paging and when the query changes', async () => {
      search.mockResolvedValue(response([repo], 500))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      chooseSort('Recently updated')
      await flush(0)
      fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
      await flush(0)
      expect(lastParams()).toEqual({ q: 'react', sort: 'updated', order: 'desc', per_page: 20, page: 2 })

      typeQuery('vue')
      await flush()
      expect(lastParams()).toEqual({ q: 'vue', sort: 'updated', order: 'desc', per_page: 20, page: 1 })
    })

    it('restores the order from the URL', () => {
      window.history.replaceState(null, '', '/?q=react&sort=forks')
      search.mockResolvedValue(response([repo]))
      render(<RepositorySearch />)

      expect(lastParams()).toEqual({ q: 'react', sort: 'forks', order: 'desc', per_page: 20, page: 1 })
      expect(sortSelect().selectedOptions[0].textContent).toBe('Most forks')
    })
  })

  describe('1000-result limit', () => {
    const notice = () => screen.queryByText(/only returns the first 1,000 results/)

    it('mentions the limit next to the count when there are more results', async () => {
      search.mockResolvedValue(response([repo], 250_000))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      expect(screen.getByText(/^250,000 repositories/).textContent).toContain('first 1,000 shown')
      // Not on page 1, only once the user can't page any further
      expect(notice()).toBeNull()
    })

    it('explains the limit on the last reachable page', async () => {
      search.mockResolvedValue(response([repo], 250_000))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      // 1000 / 20 per page
      fireEvent.click(screen.getByRole('button', { name: 'Page 50' }))
      await flush(0)

      expect(search.mock.calls.at(-1)?.[1]).toMatchObject({ page: 50 })
      expect(notice()).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true)
    })

    it('moves with the page size', async () => {
      search.mockResolvedValue(response([repo], 250_000))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      fireEvent.change(screen.getByLabelText('Per page'), { target: { value: '100' } })
      await flush(0)
      // 1000 / 100 per page
      fireEvent.click(screen.getByRole('button', { name: 'Page 10' }))
      await flush(0)

      expect(notice()).toBeTruthy()
    })

    it('stays quiet when every result is reachable', async () => {
      search.mockResolvedValue(response([repo], 100))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      fireEvent.click(screen.getByRole('button', { name: 'Page 5' }))
      await flush(0)

      expect(screen.getByText(/^100 repositories/).textContent).not.toContain('shown')
      expect(notice()).toBeNull()
    })
  })

  describe('URL state', () => {
    const lastParams = () => search.mock.calls.at(-1)?.[1]

    /** Simulates the browser's back/forward button landing on `url` */
    async function popTo(url: string) {
      window.history.replaceState(null, '', url)
      await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
    }

    it('restores a search from the URL straight away', async () => {
      window.history.replaceState(null, '', '/?q=react&page=2&per_page=50')
      search.mockResolvedValue(response([repo], 500))
      render(<RepositorySearch />)

      // No debounce: the URL is a finished search, not typing
      expect(lastParams()).toEqual({ q: 'react', per_page: 50, page: 2 })
      expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('react')

      await flush(0)
      expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page')
      expect(screen.getByLabelText<HTMLSelectElement>('Per page').value).toBe('50')
    })

    it('cleans up an invalid URL', () => {
      window.history.replaceState(null, '', '/?q=react&page=abc&per_page=7&ref=home')
      search.mockResolvedValue(response([repo]))
      render(<RepositorySearch />)

      expect(window.location.search).toBe('?q=react&ref=home')
    })

    describe('page past the end of the results', () => {
      it('moves to the last page without adding history', async () => {
        window.history.replaceState(null, '', '/?q=react&page=40')
        // 30 results make 2 pages of 20; anything later comes back empty
        search.mockImplementation(async (_type, params) =>
          response(params.page! <= 2 ? [repo] : [], 30),
        )
        render(<RepositorySearch />)
        const historyLength = window.history.length

        await flush(0)
        expect(lastParams()).toEqual({ q: 'react', per_page: 20, page: 2 })
        expect(window.location.search).toBe('?q=react&page=2')
        expect(window.history.length).toBe(historyLength)
        expect(screen.getByRole('link', { name: 'facebook/react' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page')
      })

      it('keeps loading rather than claiming nothing matches', async () => {
        window.history.replaceState(null, '', '/?q=react&page=40')
        search
          .mockResolvedValueOnce(response([], 30))
          .mockReturnValueOnce(new Promise(() => {}))
        render(<RepositorySearch />)

        await flush(0)
        expect(search).toHaveBeenCalledTimes(2)
        expect(screen.getByLabelText('Loading results')).toBeTruthy()
        expect(screen.queryByText(/no repositories match/i)).toBeNull()
      })

      it('goes back to page 1 when nothing matches at all', async () => {
        window.history.replaceState(null, '', '/?q=zzzz-no-such-repo&page=5')
        search.mockResolvedValue(response([], 0))
        render(<RepositorySearch />)

        await flush(0)
        expect(window.location.search).toBe('?q=zzzz-no-such-repo')
        expect(screen.getByText(/no repositories match/i)).toBeTruthy()
      })
    })

    it('writes the query once typing pauses, without adding history', async () => {
      search.mockResolvedValue(response([repo], 100))
      render(<RepositorySearch />)
      const historyLength = window.history.length

      typeQuery('react')
      expect(window.location.search).toBe('')
      await flush()
      typeQuery('react hooks')
      await flush()

      expect(window.location.search).toBe('?q=react+hooks')
      expect(window.history.length).toBe(historyLength)
    })

    it('adds a history entry per page, but not for the page size', async () => {
      search.mockResolvedValue(response([repo], 500))
      render(<RepositorySearch />)
      typeQuery('react')
      await flush()
      const historyLength = window.history.length

      fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
      await flush(0)
      expect(window.location.search).toBe('?q=react&page=2')
      expect(window.history.length).toBe(historyLength + 1)

      fireEvent.change(screen.getByLabelText('Per page'), { target: { value: '50' } })
      await flush(0)
      expect(window.location.search).toBe('?q=react&per_page=50')
      expect(window.history.length).toBe(historyLength + 1)
    })

    it('follows back/forward navigation', async () => {
      search.mockResolvedValue(response([repo], 500))
      render(<RepositorySearch />)
      typeQuery('react')
      await flush()

      await popTo('/?q=vue&page=3')
      expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('vue')
      expect(lastParams()).toEqual({ q: 'vue', per_page: 20, page: 3 })

      await popTo('/')
      expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('')
      expect(screen.getByText(/type a keyword/i)).toBeTruthy()
    })

    it('lets back/forward win over a query that is still being typed', async () => {
      search.mockResolvedValue(response([repo], 500))
      render(<RepositorySearch />)

      typeQuery('reac')
      await popTo('/?q=vue')
      await flush()

      expect(window.location.search).toBe('?q=vue')
      expect(lastParams()).toMatchObject({ q: 'vue' })
      expect(search).toHaveBeenCalledTimes(1)
    })
  })

  it('explains an invalid query without searching or offering a retry', async () => {
    render(<RepositorySearch />)

    typeQuery('a OR b OR c OR d OR e OR f OR g')
    await flush()

    expect(screen.getByRole('alert').textContent).toContain('Too many AND / OR / NOT operators: 6')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })

  it('shows the error message and retries on demand', async () => {
    search
      .mockRejectedValueOnce(new Error('Too many requests in a short time, retry after 10:01:00'))
      .mockResolvedValueOnce(response([repo]))
    render(<RepositorySearch />)

    typeQuery('react')
    await flush()
    expect(screen.getByRole('alert').textContent).toContain('Too many requests in a short time')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await flush(0)
    expect(search).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('link', { name: 'facebook/react' })).toBeTruthy()
  })

  describe('rate limit', () => {
    it('offers no retry, since it retries by itself once the limit resets', async () => {
      search.mockRejectedValueOnce(
        new GitHubApiError(403, null, { type: 'primary', resetAt: new Date(Date.now() + 30_000) }),
      )
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      expect(screen.getByRole('alert').textContent).toContain('run again automatically')
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()

      search.mockResolvedValue(response([repo]))
      await flush(31_000)
      expect(search).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('link', { name: 'facebook/react' })).toBeTruthy()
    })

    function reportQuota(remaining: number) {
      act(() =>
        recordQuota(rateLimitBucket('repositories'), {
          limit: 10,
          remaining,
          resetAt: new Date(Date.now() + 60_000),
        }),
      )
    }

    it('warns when the quota is running low', async () => {
      search.mockResolvedValue(response([repo]))
      render(<RepositorySearch />)

      reportQuota(3)
      expect(screen.queryByText(/searches left/)).toBeNull()

      reportQuota(2)
      expect(screen.getByText(/2 of 10 searches left/).textContent).toContain('Add a GitHub token')
    })

    it('drops the warning once the quota resets', async () => {
      render(<RepositorySearch />)

      reportQuota(1)
      expect(screen.getByText(/searches left/)).toBeTruthy()

      await flush(60_000)
      expect(screen.queryByText(/searches left/)).toBeNull()
    })
  })

  describe('token', () => {
    const lastOptions = () => search.mock.calls.at(-1)?.[2]
    const rateLimited = () =>
      new GitHubApiError(403, { message: 'API rate limit exceeded' }, {
        type: 'primary',
        resetAt: new Date(),
      })

    it('searches with the saved token, and again when it changes', async () => {
      setGitHubToken('ghp_first')
      search.mockResolvedValue(response([repo]))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      expect(lastOptions()).toMatchObject({ token: 'ghp_first' })

      await act(async () => setGitHubToken(null))
      expect(search).toHaveBeenCalledTimes(2)
      expect(lastOptions()?.token).toBeUndefined()
    })

    it('suggests a token when rate limited without one', async () => {
      search.mockRejectedValue(rateLimited())
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      expect(screen.getByRole('alert').textContent).toContain('Add a GitHub token')
    })

    it('does not suggest a token when one is already in use', async () => {
      setGitHubToken('ghp_saved')
      search.mockRejectedValue(rateLimited())
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      expect(screen.getByRole('alert').textContent).not.toContain('Add a GitHub token')
    })

    it('points at the token instead of offering a retry when it is rejected', async () => {
      setGitHubToken('ghp_expired')
      search.mockRejectedValueOnce(new GitHubApiError(401, null, null, 'GitHub rejected the token'))
      render(<RepositorySearch />)

      typeQuery('react')
      await flush()
      expect(screen.getByRole('alert').textContent).toContain('Replace or remove it')
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()

      // Removing the bad token is enough to search again
      search.mockResolvedValue(response([repo]))
      await act(async () => setGitHubToken(null))
      expect(screen.getByRole('link', { name: 'facebook/react' })).toBeTruthy()
    })
  })
})
