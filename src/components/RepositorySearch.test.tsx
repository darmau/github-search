import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchGitHub } from '../api/github'
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
})
