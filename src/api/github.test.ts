import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubApiError, rateLimitBucket, searchGitHub } from './github'
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
  return { url: new URL(String(input)), headers: new Headers(init?.headers), init }
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
    await searchGitHub('code', { q: 'useState' }, { token: 'secret' })
    await searchGitHub('code', { q: 'useState' }, { token: '' })

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
      expect(error.rateLimit).toEqual({ type: 'primary', resetAt: new Date(reset * 1000) })
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

    const error = await catchError(searchGitHub('code', { q: 'x'.repeat(300) }))
    expect(error.status).toBe(422)
    expect(error.body).toEqual(body)
    expect(error.message).toBe('The search query is too long')
  })

  it('falls back to body.message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Requires authentication' }, { status: 401 }))

    const error = await catchError(searchGitHub('code', { q: 'foo' }))
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

  it('keeps separate limits per token and for code search', async () => {
    fetchMock.mockResolvedValueOnce(rateLimitResponse())
    await catchError(searchGitHub('repositories', { q: 'react' }))

    fetchMock.mockImplementation(async () => jsonResponse(emptyResult))
    await searchGitHub('repositories', { q: 'react' }, { token: 'ghp_mine' })
    await searchGitHub('code', { q: 'react' })
    await catchError(searchGitHub('issues', { q: 'react' }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
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
    expect(getQuota(rateLimitBucket('repositories'))).toEqual({
      limit: 10,
      remaining: 7,
      resetAt: new Date(reset * 1000),
    })
    expect(getQuota(rateLimitBucket('repositories', 'ghp_other'))).toBeUndefined()
  })
})
