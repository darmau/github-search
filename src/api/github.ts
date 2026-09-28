import type {
  BasicError,
  Repository,
  SearchEndpoints,
  SearchType,
  ServiceUnavailableError,
  ValidationError,
} from '../types/github'
import { getCooldown, recordQuota, startCooldown, type RateLimitedError, type SearchQuota } from './rateLimit'

/**
 * The GitHub REST API, through this site's own Worker (worker/index.ts), which
 * adds the token. The dev server proxies it the same way (vite.config.ts).
 */
const API_BASE = '/api'
const API_VERSION = '2026-03-10'

/** The Search API only serves the first 1000 results of any query */
export const SEARCH_MAX_RESULTS = 1000

export type GitHubErrorBody = BasicError | ValidationError | ServiceUnavailableError

/**
 * - primary: the per-minute search quota is used up
 * - secondary: too many requests in a short burst, even with quota left
 */
export type RateLimitType = 'primary' | 'secondary'

/**
 * The separately counted limits a request can draw from, as GitHub names them
 * in `x-ratelimit-resource`. With the server's token, search allows 30 req/min,
 * code and semantic issue search 10, and `core`, the rest of the REST API,
 * 5000 an hour. Everyone using the site shares them.
 */
export type RateLimitResource = 'search' | 'code_search' | 'semantic_search' | 'core'

export interface RateLimit {
  type: RateLimitType
  resource: RateLimitResource
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

function describeError(status: number, body: GitHubErrorBody | null, rateLimit: RateLimit | null): string {
  if (rateLimit) {
    const time = rateLimit.resetAt.toLocaleTimeString()
    return rateLimit.type === 'primary'
      ? `${rateLimit.resource === 'core' ? 'API' : 'Search'} quota used up, resets at ${time}`
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

function parseRateLimit(res: Response, body: GitHubErrorBody | null, resource: RateLimitResource): RateLimit | null {
  if (res.status !== 403 && res.status !== 429) return null

  const retryAfter = Number(res.headers.get('retry-after') ?? NaN)
  const reset = Number(res.headers.get('x-ratelimit-reset') ?? NaN)
  const quotaExhausted = res.headers.get('x-ratelimit-remaining') === '0'
  const secondary =
    !quotaExhausted &&
    (!Number.isNaN(retryAfter) || res.status === 429 || /secondary rate limit/i.test(body?.message ?? ''))

  if (!quotaExhausted && !secondary) return null

  let resetAt: Date
  if (!Number.isNaN(retryAfter)) resetAt = new Date(Date.now() + retryAfter * 1000)
  else if (quotaExhausted && !Number.isNaN(reset)) resetAt = new Date(reset * 1000)
  else resetAt = new Date(Date.now() + DEFAULT_RETRY_DELAY_MS)

  const earliest = Date.now() + MIN_RETRY_DELAY_MS
  if (resetAt.getTime() < earliest) resetAt = new Date(earliest)

  return { type: quotaExhausted ? 'primary' : 'secondary', resource, resetAt }
}

function parseQuota(res: Response): SearchQuota | null {
  const limit = Number(res.headers.get('x-ratelimit-limit') ?? NaN)
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN)
  const reset = Number(res.headers.get('x-ratelimit-reset') ?? NaN)
  if ([limit, remaining, reset].some(Number.isNaN)) return null
  return { limit, remaining, resetAt: new Date(reset * 1000) }
}

/** The rate limit a search draws from */
export function searchResource<T extends SearchType>(
  type: T,
  params?: SearchEndpoints[T]['params'],
): RateLimitResource {
  if (type === 'code') return 'code_search'
  if (params && 'search_type' in params && params.search_type) return 'semantic_search'
  return 'search'
}

const BAD_TOKEN_MESSAGE = "GitHub rejected the server's token: it is invalid, expired or revoked"

export interface SearchOptions {
  signal?: AbortSignal
  /** Request highlighted fragments in `text_matches` */
  textMatch?: boolean
}

interface RequestOptions {
  signal?: AbortSignal
  accept?: string
  resource: RateLimitResource
}

/** GETs an API path, tracking the rate limit of the resource it draws from */
async function request<TData>(path: string, { signal, accept, resource }: RequestOptions): Promise<TData> {
  // Fail fast while rate limited, without spending a request
  const cooldown = getCooldown(resource)
  if (cooldown) throw cooldown

  const headers: HeadersInit = {
    Accept: accept ?? 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  }

  const res = await fetch(`${API_BASE}${path}`, { headers, signal })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as GitHubErrorBody | null
    // GitHub just says "Bad credentials", which doesn't point at the token
    const message = res.status === 401 ? BAD_TOKEN_MESSAGE : undefined
    const error = new GitHubApiError(res.status, body, parseRateLimit(res, body, resource), message)
    if (error.rateLimit) startCooldown(resource, error as RateLimitedError)
    throw error
  }

  recordQuota(resource, parseQuota(res))
  return res.json() as Promise<TData>
}

export async function searchGitHub<T extends SearchType>(
  type: T,
  params: SearchEndpoints[T]['params'],
  { signal, textMatch = false }: SearchOptions = {},
): Promise<SearchEndpoints[T]['response']> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }

  return request(`/search/${type}?${query}`, {
    signal,
    accept: textMatch ? 'application/vnd.github.text-match+json' : undefined,
    resource: searchResource(type, params),
  })
}

// Repository ids never change, so a lookup is kept for the page's lifetime.
const repositories = new Map<string, Repository>()

/**
 * Looks up a repository, e.g. for the id that label search needs. Follows
 * renames and transfers (GitHub redirects the old name). Draws from the core
 * rate limit, not the search one.
 */
export async function getRepository(
  owner: string,
  name: string,
  { signal }: Omit<SearchOptions, 'textMatch'> = {},
): Promise<Repository> {
  const key = `${owner}/${name}`.toLowerCase()
  const cached = repositories.get(key)
  if (cached) return cached

  try {
    const repo = await request<Repository>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
      signal,
      resource: 'core',
    })
    repositories.set(key, repo)
    return repo
  } catch (error) {
    // GitHub answers a private repository without access with 404 too
    if (error instanceof GitHubApiError && error.status === 404) {
      throw new GitHubApiError(404, error.body, null, `Repository ${owner}/${name} not found`)
    }
    throw error
  }
}

export function clearRepositoryCache(): void {
  repositories.clear()
}
