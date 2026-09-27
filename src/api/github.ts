import type {
  BasicError,
  SearchEndpoints,
  SearchType,
  ServiceUnavailableError,
  ValidationError,
} from '../types/github'
import {
  getCooldown,
  recordQuota,
  startCooldown,
  type RateLimitedError,
  type SearchQuota,
} from './rateLimit'

const API_BASE = 'https://api.github.com'
const API_VERSION = '2026-03-10'

/**
 * Optional personal access token. Required for code search and semantic/hybrid
 * issue search, and raises the search rate limit from 10 to 30 req/min.
 * Anything prefixed VITE_ is bundled into the client, so never ship a real
 * token in a public build.
 */
const DEFAULT_TOKEN = import.meta.env.VITE_GITHUB_TOKEN

/** The Search API only serves the first 1000 results of any query */
export const SEARCH_MAX_RESULTS = 1000

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

  constructor(
    status: number,
    body: GitHubErrorBody | null,
    rateLimit: RateLimit | null,
    message = describeError(status, body, rateLimit),
  ) {
    super(message)
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
 * A reset time already in the past (e.g. a fast local clock) would make a
 * retry fire straight away and fail again, so always wait at least this long.
 */
const MIN_RETRY_DELAY_MS = 5_000

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

  const earliest = Date.now() + MIN_RETRY_DELAY_MS
  if (resetAt.getTime() < earliest) resetAt = new Date(earliest)

  return { type: quotaExhausted ? 'primary' : 'secondary', resetAt }
}

function parseQuota(res: Response): SearchQuota | null {
  const limit = Number(res.headers.get('x-ratelimit-limit') ?? NaN)
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN)
  const reset = Number(res.headers.get('x-ratelimit-reset') ?? NaN)
  if ([limit, remaining, reset].some(Number.isNaN)) return null
  return { limit, remaining, resetAt: new Date(reset * 1000) }
}

/**
 * Identifies a rate limit: GitHub counts each token (or, without one, each IP)
 * separately, and code search separately from the other search endpoints.
 * Defaults to the build-time token, just like `searchGitHub`.
 */
export function rateLimitBucket(type: SearchType, token: string | undefined = DEFAULT_TOKEN): string {
  return JSON.stringify([token || null, type === 'code' ? 'code_search' : 'search'])
}

const BAD_TOKEN_MESSAGE = 'GitHub rejected the token: it is invalid, expired or revoked'

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
  // Fail fast while rate limited, without spending a request
  const bucket = rateLimitBucket(type, token)
  const cooldown = getCooldown(bucket)
  if (cooldown) throw cooldown

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
    // GitHub just says "Bad credentials", which doesn't point at the token
    const message = res.status === 401 && token ? BAD_TOKEN_MESSAGE : undefined
    const error = new GitHubApiError(res.status, body, parseRateLimit(res, body), message)
    if (error.rateLimit) startCooldown(bucket, error as RateLimitedError)
    throw error
  }

  recordQuota(bucket, parseQuota(res))
  return res.json() as Promise<SearchEndpoints[T]['response']>
}
