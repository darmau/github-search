import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRepository, GitHubApiError, MissingTokenError, searchGitHub } from '../api/github'
import { useGitHubToken } from '../hooks/useGitHubToken'
import type {
  IssueSearchResultItem,
  LabelSearchResultItem,
  Repository,
  RepositorySearchResultItem,
  SearchResponse,
  UserSearchResultItem,
} from '../types/github'
import { Terminal } from './Terminal'

vi.mock('../api/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/github')>()),
  searchGitHub: vi.fn(),
  getRepository: vi.fn(),
}))

const search = vi.mocked(searchGitHub)
const lookUpRepository = vi.mocked(getRepository)

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

function response<T = RepositorySearchResultItem>(items: T[], total = items.length): SearchResponse<T> {
  return { total_count: total, incomplete_results: false, items }
}

const user = {
  id: 2,
  login: 'tomchristie',
  type: 'User',
  html_url: 'https://github.com/tomchristie',
} as UserSearchResultItem

const issue = {
  id: 3,
  number: 42,
  title: 'Memory leak in dev server',
  state: 'open',
  html_url: 'https://github.com/vercel/next.js/pull/42',
  repository_url: 'https://api.github.com/repos/vercel/next.js',
  pull_request: { merged_at: '2026-09-01T00:00:00Z' },
  user: { login: 'octocat' },
  labels: [{ id: 1, name: 'bug', color: 'd73a4a' }],
  comments: 7,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
  closed_at: null,
  milestone: null,
} as unknown as IssueSearchResultItem

const label = {
  id: 4,
  name: 'bug',
  color: 'd73a4a',
  default: true,
  description: "Something isn't working",
  url: 'https://api.github.com/repos/vercel/next.js/labels/bug',
  archived_at: null,
} as LabelSearchResultItem

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
  lookUpRepository.mockReset()
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

  it('searches users with their own flags', async () => {
    search.mockResolvedValue(response([user]))
    render(<Terminal />)

    await type('users tom --location berlin --followers >1k --sort followers')

    expect(search).toHaveBeenCalledWith(
      'users',
      { q: 'tom location:berlin followers:>1000', sort: 'followers', order: 'desc', per_page: 10, page: 1 },
      expect.anything(),
    )
    expect(text()).toContain('1 user')
    expect(text()).toContain('tomchristie')
  })

  it('shows issue and pull request status', async () => {
    search.mockResolvedValue({ ...response([issue]), search_type: 'lexical' })
    render(<Terminal />)

    await type('issues leak --repo vercel/next.js --pr')

    expect(search).toHaveBeenCalledWith('issues', expect.objectContaining({ q: 'leak repo:vercel/next.js is:pr' }), expect.anything())
    expect(text()).toContain('vercel/next.js#42')
    expect(text()).toContain('pr merged')
    // Yank copies the URL
    await type('yank 1')
    expect(text()).toContain('copied URL https://github.com/vercel/next.js/pull/42')
  })

  it("looks up the repository's id for label search", async () => {
    lookUpRepository.mockResolvedValue({ id: 70107786 } as Repository)
    search.mockResolvedValue(response([label]))
    render(<Terminal />)

    await type('labels vercel/next.js bug')

    expect(lookUpRepository).toHaveBeenCalledWith('vercel', 'next.js', expect.anything())
    expect(search).toHaveBeenCalledWith('labels', expect.objectContaining({ q: 'bug', repository_id: 70107786 }), expect.anything())
    expect(text()).toContain("Something isn't working")
  })

  it('asks for a token for code search', async () => {
    search.mockRejectedValue(new MissingTokenError('code'))
    render(<Terminal />)

    await type('code useState --lang typescript')

    expect(search).toHaveBeenCalledWith('code', expect.anything(), expect.objectContaining({ textMatch: true }))
    expect(text()).toContain('Code search needs a GitHub token')
    expect(text()).toContain('token set <pat> to use this search')
  })

  it('only offers the sorts a search type supports', async () => {
    search.mockResolvedValue(response([user]))
    render(<Terminal />)

    await type('users tom')
    await type('sort stars')
    expect(text()).toContain('sort: expected best | followers | repositories | joined')
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
