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

export class GitHubApiError extends Error {
  readonly status: number
  readonly body: GitHubErrorBody | null
  /** Set when the request was rejected by the rate limiter */
  readonly rateLimitReset: Date | null

  constructor(status: number, body: GitHubErrorBody | null, rateLimitReset: Date | null) {
    super(describeError(status, body, rateLimitReset))
    this.name = 'GitHubApiError'
    this.status = status
    this.body = body
    this.rateLimitReset = rateLimitReset
  }
}

function describeError(
  status: number,
  body: GitHubErrorBody | null,
  rateLimitReset: Date | null,
): string {
  if (rateLimitReset) {
    return `Rate limit exceeded, resets at ${rateLimitReset.toLocaleTimeString()}`
  }
  // 422 bodies carry the useful detail in errors[0].message
  const detail = body && 'errors' in body ? body.errors?.[0]?.message : undefined
  return detail ?? body?.message ?? `GitHub API request failed (${status})`
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
    const rateLimited =
      (res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0'
    const reset = res.headers.get('x-ratelimit-reset')
    throw new GitHubApiError(
      res.status,
      body,
      rateLimited && reset ? new Date(Number(reset) * 1000) : null,
    )
  }

  return res.json() as Promise<SearchEndpoints[T]['response']>
}
