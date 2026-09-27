import type { SearchEndpoints, SearchType } from '../types/github'
import type { SearchOptions } from './github'

/**
 * Search results change slowly, and unauthenticated search allows only
 * 10 req/min, so reusing a result for a few minutes is well worth it.
 */
export const SEARCH_CACHE_TTL_MS = 5 * 60_000
export const SEARCH_CACHE_MAX_ENTRIES = 100

interface Entry {
  data: unknown
  storedAt: number
}

// Map iteration follows insertion order, so re-inserting on every read keeps
// the least recently used entry first, ready to be evicted.
const entries = new Map<string, Entry>()

/**
 * Identifies a request. Equivalent requests share a key regardless of param
 * order or empty values, mirroring how `searchGitHub` builds the URL.
 */
export function searchCacheKey<T extends SearchType>(
  type: T,
  params: SearchEndpoints[T]['params'],
  { token, textMatch }: Omit<SearchOptions, 'signal'> = {},
): string {
  const compactParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== '')
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  )
  // The token is part of the key: authenticated results can include private repos.
  // Undefined fields drop out of the JSON, so `{}` and `{ textMatch: false }` match.
  return JSON.stringify([type, compactParams, { token, textMatch: textMatch || undefined }])
}

export function getCachedSearch<TData>(key: string): TData | undefined {
  const entry = entries.get(key)
  if (!entry) return undefined

  entries.delete(key)
  if (Date.now() - entry.storedAt >= SEARCH_CACHE_TTL_MS) return undefined

  entries.set(key, entry)
  return entry.data as TData
}

export function setCachedSearch(key: string, data: unknown): void {
  entries.delete(key)
  entries.set(key, { data, storedAt: Date.now() })

  while (entries.size > SEARCH_CACHE_MAX_ENTRIES) {
    entries.delete(entries.keys().next().value!)
  }
}

export function deleteCachedSearch(key: string): void {
  entries.delete(key)
}

export function clearSearchCache(): void {
  entries.clear()
}
