import { useSyncExternalStore } from 'react'
import { rateLimitBucket } from '../api/github'
import { getQuota, subscribeQuota, type SearchQuota } from '../api/rateLimit'
import type { SearchType } from '../types/github'

/**
 * The search quota left for this token, as reported by the latest response.
 * Undefined until a search has been made, and again once the quota resets.
 */
export function useSearchQuota(type: SearchType, token?: string): SearchQuota | undefined {
  const bucket = rateLimitBucket(type, token)
  return useSyncExternalStore(subscribeQuota, () => getQuota(bucket), () => undefined)
}
