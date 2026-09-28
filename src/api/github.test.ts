import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRepositoryCache,
  getRepository,
  GitHubApiError,
  MissingTokenError,
  rateLimitBucket,
  searchGitHub,
  searchResource,
} from './github'
import { getQuota } from './rateLimit'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const emptyResult = { total_count: 0, incomplete_results: false, items: [] }

/** URL and headers of the n-th fetch call */
function request(n = 0) {
  const [input, init] = fetchMock.mock.calls[n]
  const url = new URL(input instanceof Request ? input.url : input)
  return { url, headers: new Headers(init?.headers), init }
}

async function catchError(promise: Promise<unknown>): Promise<GitHubApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(GitHubApiError)
    return error as GitHubApiError
  }
  throw new Error('Expected searchGitHub to reject')
}

describe('searchGitHub request', () => {
  beforeEach(() => {
    // A Response body can only be read once, so hand out a fresh one per call
    fetchMock.mockImplementation(async () => jsonResponse(emptyResult))
  })

  it('builds the URL from the type and drops empty params', async () => {
    await searchGitHub('repositories', { q: 'react', sort: undefined, order: '' as never })

    const { url } = request()
    expect(url.origin + url.pathname).toBe('https://api.github.com/search/repositories')
    expect([...url.searchParams]).toEqual([['q', 'react']])
  })

  it('stringifies numeric params', async () => {
    await searchGitHub('users', { q: 'tom', per_page: 50, page: 2 })

    const { url } = request()
    expect(url.searchParams.get('per_page')).toBe('50')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('sends a bearer token only when one is given', async () => {
    await searchGitHub('repositories', { q: 'react' }, { token: 'secret' })
    await searchGitHub('repositories', { q: 'react' }, { token: '' })

    expect(request(0).headers.get('Authorization')).toBe('Bearer secret')
    expect(request(1).headers.has('Authorization')).toBe(false)
  })

  it('asks for text-match media type when textMatch is set', async () => {
    await searchGitHub('issues', { q: 'bug' })
    await searchGitHub('issues', { q: 'bug' }, { textMatch: true })

    expect(request(0).headers.get('Accept')).toBe('application/vnd.github+json')
    expect(request(1).headers.get('Accept')).toBe('application/vnd.github.text-match+json')
    expect(request(0).headers.get('X-GitHub-Api-Version')).toBeTruthy()
  })

  it('forwards the abort signal to fetch', async () => {
    const controller = new AbortController()
    await searchGitHub('topics', { q: 'rust' }, { signal: controller.signal })

    expect(request().init?.signal).toBe(controller.signal)
  })
})

describe('searchGitHub response', () => {
  it('returns the parsed JSON body', async () => {
    const body = { ...emptyResult, total_count: 1, items: [{ name: 'react' }] }
    fetchMock.mockResolvedValue(jsonResponse(body))

    await expect(searchGitHub('topics', { q: 'react' })).resolves.toEqual(body)
  })
})

describe('searchGitHub errors', () => {
  const now = new Date('2026-09-27T10:00:00Z')
  const reset = 1_900_000_000

  function rejectWith(status: number, body: unknown, headers: Record<string, string> = {}) {
    fetchMock.mockResolvedValue(jsonResponse(body, { status, headers }))
    return catchError(searchGitHub('repositories', { q: 'react' }))
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('primary rate limit (quota used up)', () => {
    it.each([403, 429])('is reported on %i with no remaining quota', async (status) => {
      const error = await rejectWith(
        status,
        { message: 'API rate limit exceeded' },
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
      )

      expect(error.status).toBe(status)
      expect(error.rateLimit).toEqual({ type: 'primary', resource: 'search', resetAt: new Date(reset * 1000) })
      expect(error.message).toMatch(/^Search quota used up, resets at /)
    })
  })

  describe('secondary rate limit (request burst)', () => {
    it('waits for retry-after even with quota left', async () => {
      const error = await rejectWith(
        403,
        { message: 'You have exceeded a secondary rate limit' },
        { 'retry-after': '30', 'x-ratelimit-remaining': '12', 'x-ratelimit-reset': String(reset) },
      )

      expect(error.rateLimit).toEqual({
        type: 'secondary',
        resource: 'search',
        resetAt: new Date(now.getTime() + 30_000),
      })
      expect(error.message).toMatch(/^Too many requests in a short time, retry after /)
    })

    it('is recognised from the message when retry-after is missing', async () => {
      const error = await rejectWith(403, {
        message: 'You have exceeded a secondary rate limit. Please wait a few minutes.',
      })

      expect(error.rateLimit).toEqual({
        type: 'secondary',
        resource: 'search',
        resetAt: new Date(now.getTime() + 60_000),
      })
    })

    it('treats a bare 429 as a secondary limit', async () => {
      const error = await rejectWith(429, { message: 'Too Many Requests' })

      expect(error.rateLimit?.type).toBe('secondary')
      expect(error.rateLimit?.resetAt).toEqual(new Date(now.getTime() + 60_000))
    })
  })

  it('does not treat an ordinary 403 as rate limiting', async () => {
    const error = await rejectWith(
      403,
      { message: 'Must have push access' },
      { 'x-ratelimit-remaining': '12', 'x-ratelimit-reset': String(reset) },
    )

    expect(error.rateLimit).toBeNull()
    expect(error.message).toBe('Must have push access')
  })

  it('uses the first validation error message on 422', async () => {
    const body = {
      message: 'Validation Failed',
      documentation_url: 'https://docs.github.com',
      errors: [{ code: 'invalid', message: 'The search query is too long' }],
    }
    fetchMock.mockResolvedValue(jsonResponse(body, { status: 422 }))

    const error = await catchError(searchGitHub('code', { q: 'x'.repeat(300) }, { token: 'secret' }))
    expect(error.status).toBe(422)
    expect(error.body).toEqual(body)
    expect(error.message).toBe('The search query is too long')
  })

  it('falls back to body.message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Requires authentication' }, { status: 401 }))

    const error = await catchError(searchGitHub('issues', { q: 'foo' }))
    expect(error.message).toBe('Requires authentication')
  })

  it('handles a non-JSON error body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))

    const error = await catchError(searchGitHub('users', { q: 'tom' }))
    expect(error.status).toBe(502)
    expect(error.body).toBeNull()
    expect(error.message).toBe('GitHub API request failed (502)')
  })
})

describe('searchGitHub with a rejected token', () => {
  it('blames the token when one was sent', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, { status: 401 }))

    const error = await catchError(searchGitHub('repositories', { q: 'react' }, { token: 'expired' }))
    expect(error.status).toBe(401)
    expect(error.message).toBe('GitHub rejected the token: it is invalid, expired or revoked')
  })
})

describe('searchGitHub rate limit tracking', () => {
  const now = new Date('2026-09-27T10:00:00Z')
  const reset = now.getTime() / 1000 + 30

  function rateLimitResponse() {
    return jsonResponse(
      { message: 'API rate limit exceeded' },
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } },
    )
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fails fast without a request until the limit resets', async () => {
    fetchMock.mockResolvedValueOnce(rateLimitResponse())
    const first = await catchError(searchGitHub('repositories', { q: 'react' }))

    // A different query is limited just the same
    const second = await catchError(searchGitHub('repositories', { q: 'vue' }))
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(jsonResponse(emptyResult))
    vi.setSystemTime(reset * 1000)
    await expect(searchGitHub('repositories', { q: 'vue' })).resolves.toEqual(emptyResult)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps separate limits per token and per resource', async () => {
    fetchMock.mockResolvedValueOnce(rateLimitResponse())
    await catchError(searchGitHub('repositories', { q: 'react' }, { token: 'ghp_mine' }))

    fetchMock.mockImplementation(async () => jsonResponse(emptyResult))
    await searchGitHub('repositories', { q: 'react' }, { token: 'ghp_other' })
    await searchGitHub('code', { q: 'react' }, { token: 'ghp_mine' })
    await searchGitHub('issues', { q: 'react', search_type: 'semantic' }, { token: 'ghp_mine' })
    await getRepository('facebook', 'react', { token: 'ghp_mine' })
    await catchError(searchGitHub('issues', { q: 'react' }, { token: 'ghp_mine' }))
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('waits a few seconds even when the reset time has already passed', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { message: 'API rate limit exceeded' },
        { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset - 60) } },
      ),
    )

    const error = await catchError(searchGitHub('repositories', { q: 'react' }))
    expect(error.rateLimit?.resetAt).toEqual(new Date(now.getTime() + 5_000))
  })

  it('records the quota a successful response reports', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(emptyResult, {
        headers: {
          'x-ratelimit-limit': '10',
          'x-ratelimit-remaining': '7',
          'x-ratelimit-reset': String(reset),
        },
      }),
    )

    await searchGitHub('repositories', { q: 'react' })
    expect(getQuota(rateLimitBucket('search'))).toEqual({
      limit: 10,
      remaining: 7,
      resetAt: new Date(reset * 1000),
    })
    expect(getQuota(rateLimitBucket('search', 'ghp_other'))).toBeUndefined()
    expect(getQuota(rateLimitBucket('code_search'))).toBeUndefined()
  })
})

describe('searchResource', () => {
  it.each([
    ['repositories', { q: 'react' }, 'search'],
    ['issues', { q: 'crash' }, 'search'],
    ['issues', { q: 'crash', search_type: 'semantic' }, 'semantic_search'],
    ['issues', { q: 'crash', search_type: 'hybrid' }, 'semantic_search'],
    ['code', { q: 'useState' }, 'code_search'],
  ] as const)('%s %j draws from %s', (type, params, resource) => {
    expect(searchResource(type, params)).toBe(resource)
  })
})

describe('searchGitHub without a token', () => {
  it.each([
    ['code', { q: 'useState' }],
    ['issues', { q: 'crash', search_type: 'semantic' }],
    ['issues', { q: 'crash', search_type: 'hybrid' }],
  ] as const)('rejects %s %j without a request', async (type, params) => {
    await expect(searchGitHub(type, params, { token: '' })).rejects.toBeInstanceOf(MissingTokenError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the same searches with a token', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(emptyResult))
    await searchGitHub('code', { q: 'useState' }, { token: 'secret' })
    await searchGitHub('issues', { q: 'crash', search_type: 'semantic' }, { token: 'secret' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('getRepository', () => {
  const repo = { id: 10270250, full_name: 'react/react' }

  beforeEach(() => {
    clearRepositoryCache()
    fetchMock.mockImplementation(async () => jsonResponse(repo))
  })

  it('fetches the repository with the token', async () => {
    await expect(getRepository('facebook', 'react', { token: 'secret' })).resolves.toEqual(repo)

    const { url, headers } = request()
    expect(url.href).toBe('https://api.github.com/repos/facebook/react')
    expect(headers.get('Authorization')).toBe('Bearer secret')
  })

  it('escapes the path segments', async () => {
    await getRepository('a b', 'c?d')
    expect(request().url.pathname).toBe('/repos/a%20b/c%3Fd')
  })

  it('remembers a lookup per token, ignoring case', async () => {
    await getRepository('facebook', 'react')
    await getRepository('Facebook', 'React')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await getRepository('facebook', 'react', { token: 'secret' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('names the repository when it does not exist or is not visible', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ message: 'Not Found' }, { status: 404 }))

    const error = await catchError(getRepository('nobody', 'nothing'))
    expect(error.status).toBe(404)
    expect(error.message).toBe('Repository nobody/nothing not found')

    // A failed lookup is not remembered
    await catchError(getRepository('nobody', 'nothing'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports the core rate limit as an API quota', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        { message: 'API rate limit exceeded' },
        { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Date.now() / 1000 + 600) } },
      ),
    )

    const error = await catchError(getRepository('facebook', 'react', { token: 'core-limited' }))
    expect(error.rateLimit?.resource).toBe('core')
    expect(error.message).toMatch(/^API quota used up/)
    vi.useRealTimers()
  })
})
