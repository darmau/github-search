import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubApiError, searchGitHub } from '../api/github'
import { useGitHubToken } from '../hooks/useGitHubToken'
import type { RepositorySearchResponse, RepositorySearchResultItem } from '../types/github'
import { Terminal } from './Terminal'

vi.mock('../api/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/github')>()),
  searchGitHub: vi.fn(),
}))

const search = vi.mocked(searchGitHub)

const repo = {
  id: 1,
  name: 'qdrant',
  full_name: 'qdrant/qdrant',
  html_url: 'https://github.com/qdrant/qdrant',
  clone_url: 'https://github.com/qdrant/qdrant.git',
  owner: { login: 'qdrant' },
  description: 'High-performance vector database',
  language: 'Rust',
  stargazers_count: 23_400,
  forks_count: 1_610,
  open_issues_count: 402,
  default_branch: 'master',
  license: { spdx_id: 'Apache-2.0' },
  size: 98_000,
  created_at: '2020-05-30T12:00:00Z',
  pushed_at: '2026-09-27T12:00:00Z',
  homepage: null,
  topics: ['vector-database'],
  archived: false,
} as unknown as RepositorySearchResultItem

function response(items: RepositorySearchResultItem[], total = items.length): RepositorySearchResponse {
  return { total_count: total, incomplete_results: false, items }
}

function setWidth(desktop: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function input() {
  return screen.getByRole('textbox', { name: 'Command' })
}

async function type(command: string) {
  fireEvent.change(input(), { target: { value: command, selectionStart: command.length } })
  fireEvent.keyDown(input(), { key: 'Enter' })
  // Let the search settle and the output type out
  await act(() => vi.advanceTimersByTimeAsync(5_000))
}

function text() {
  return document.body.textContent ?? ''
}

beforeEach(() => {
  vi.useFakeTimers()
  setWidth(true)
})

afterEach(() => {
  vi.useRealTimers()
  search.mockReset()
})

describe('Terminal', () => {
  it('compiles find flags into a repository search', async () => {
    search.mockResolvedValue(response([repo], 1234))
    render(<Terminal />)

    await type('find vector database --lang rust --stars >5k --sort stars')

    expect(search).toHaveBeenCalledWith(
      'repositories',
      { q: 'vector database language:rust stars:>5000', sort: 'stars', order: 'desc', per_page: 10, page: 1 },
      expect.objectContaining({ token: undefined }),
    )
    expect(text()).toContain('1,234 repositories')
    // GitHub serves only the first 1,000
    expect(text()).toContain('page 1/100')
    // The preview pane shows the selected result
    expect(text()).toContain('git clone https://github.com/qdrant/qdrant.git')
    expect(text()).toContain('PICK')
  })

  it('reuses cached results instead of searching again', async () => {
    search.mockResolvedValue(response([repo]))
    render(<Terminal />)

    await type('find qdrant')
    await type('find qdrant')

    expect(search).toHaveBeenCalledTimes(1)
    expect(text()).toContain('cached')
  })

  it('pages through results', async () => {
    search.mockResolvedValue(response([repo], 25))
    render(<Terminal />)

    await type('find qdrant')
    await type('next')
    expect(search).toHaveBeenLastCalledWith('repositories', expect.objectContaining({ page: 2 }), expect.anything())

    await type('page 9')
    expect(text()).toContain('page: expected 1–3')
  })

  it('explains unknown commands and suggests a fix', async () => {
    render(<Terminal />)

    await type('fnid react')

    expect(text()).toContain('command not found: fnid')
    expect(text()).toContain('did you mean find?')
    expect(search).not.toHaveBeenCalled()
  })

  it('reports a rate limit and retries once it resets', async () => {
    const resetAt = new Date(Date.now() + 30_000)
    search
      .mockRejectedValueOnce(new GitHubApiError(403, null, { type: 'primary', resource: 'search', resetAt }))
      .mockResolvedValueOnce(response([repo]))
    render(<Terminal />)

    await type('find qdrant')
    expect(text()).toContain('search quota used up')
    expect(text()).toContain('retrying automatically in')

    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(search).toHaveBeenCalledTimes(2)
    expect(text()).toContain('1 repository')
  })

  it('saves and removes a token without echoing it', async () => {
    let token: string | null = null
    function Probe() {
      token = useGitHubToken()
      return null
    }
    render(<><Terminal /><Probe /></>)

    await type('token set github_pat_secret1234')
    expect(token).toBe('github_pat_secret1234')
    expect(text()).not.toContain('secret')
    expect(text()).toContain('••••1234')

    await type('token rm')
    expect(token).toBeNull()
  })

  it('completes commands with tab', () => {
    render(<Terminal />)

    fireEvent.change(input(), { target: { value: 'fi', selectionStart: 2 } })
    fireEvent.keyDown(input(), { key: 'Tab' })

    expect(input()).toHaveProperty('value', 'find ')
  })

  it('shows extra keys on narrow screens', async () => {
    setWidth(false)
    search.mockResolvedValue(response([repo]))
    render(<Terminal />)

    expect(screen.getByRole('button', { name: 'TAB' })).toBeTruthy()
    await type('find qdrant')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'QUIT' }))
    expect(screen.getByRole('button', { name: 'TAB' })).toBeTruthy()
  })
})
