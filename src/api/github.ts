import type {
  BasicError,
  SearchEndpoints,
  SearchType,
  ServiceUnavailableError,
  ValidationError,
} from '../types/github'

const API_BASE = 'https://api.github.com'
const API_VERSION = '2026-03-10'

/**
 * Optional personal access token. Required for code search and semantic/hybrid
 * issue search, and raises the search rate limit from 10 to 30 req/min.
 * Anything prefixed VITE_ is bundled into the client, so never ship a real
 * token in a public build.
 */
const DEFAULT_TOKEN = import.meta.env.VITE_GITHUB_TOKEN

export type GitHubErrorBody = BasicError | ValidationError | ServiceUnavailableError

/**
 * - primary: the per-minute search quota is used up
 * - secondary: too many requests in a short burst, even with quota left
 */
export type RateLimitType = 'primary' | 'secondary'

export interface RateLimit {
  type: RateLimitType
  /** Earliest time a retry can succeed */
  resetAt: Date
}

export class GitHubApiError extends Error {
  readonly status: number
  readonly body: GitHubErrorBody | null
  /** Set when the request was rejected by the rate limiter */
  readonly rateLimit: RateLimit | null

  constructor(status: number, body: GitHubErrorBody | null, rateLimit: RateLimit | null) {
    super(describeError(status, body, rateLimit))
    this.name = 'GitHubApiError'
    this.status = status
    this.body = body
    this.rateLimit = rateLimit
  }
}

function describeError(
  status: number,
  body: GitHubErrorBody | null,
  rateLimit: RateLimit | null,
): string {
  if (rateLimit) {
    const time = rateLimit.resetAt.toLocaleTimeString()
    return rateLimit.type === 'primary'
      ? `Search quota used up, resets at ${time}`
      : `Too many requests in a short time, retry after ${time}`
  }
  // 422 bodies carry the useful detail in errors[0].message
  const detail = body && 'errors' in body ? body.errors?.[0]?.message : undefined
  return detail ?? body?.message ?? `GitHub API request failed (${status})`
}

/** GitHub asks clients to wait at least this long when it gives no reset time */
const DEFAULT_RETRY_DELAY_MS = 60_000

/**
 * Follows GitHub's guidance: retry-after wins, then x-ratelimit-reset for an
 * exhausted quota, otherwise wait a minute.
 * https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#exceeding-the-rate-limit
 */
function parseRateLimit(res: Response, body: GitHubErrorBody | null): RateLimit | null {
  if (res.status !== 403 && res.status !== 429) return null

  const retryAfter = Number(res.headers.get('retry-after') ?? NaN)
  const reset = Number(res.headers.get('x-ratelimit-reset') ?? NaN)
  const quotaExhausted = res.headers.get('x-ratelimit-remaining') === '0'
  const secondary =
    !quotaExhausted &&
    (!Number.isNaN(retryAfter) ||
      res.status === 429 ||
      /secondary rate limit/i.test(body?.message ?? ''))

  if (!quotaExhausted && !secondary) return null

  let resetAt: Date
  if (!Number.isNaN(retryAfter)) resetAt = new Date(Date.now() + retryAfter * 1000)
  else if (quotaExhausted && !Number.isNaN(reset)) resetAt = new Date(reset * 1000)
  else resetAt = new Date(Date.now() + DEFAULT_RETRY_DELAY_MS)

  return { type: quotaExhausted ? 'primary' : 'secondary', resetAt }
}

export interface SearchOptions {
  signal?: AbortSignal
  token?: string
  /** Request highlighted fragments in `text_matches` */
  textMatch?: boolean
}

export async function searchGitHub<T extends SearchType>(
  type: T,
  params: SearchEndpoints[T]['params'],
  { signal, token = DEFAULT_TOKEN, textMatch = false }: SearchOptions = {},
): Promise<SearchEndpoints[T]['response']> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }

  const headers: HeadersInit = {
    Accept: textMatch ? 'application/vnd.github.text-match+json' : 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/search/${type}?${query}`, { headers, signal })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as GitHubErrorBody | null
    throw new GitHubApiError(res.status, body, parseRateLimit(res, body))
  }

  return res.json() as Promise<SearchEndpoints[T]['response']>
}
