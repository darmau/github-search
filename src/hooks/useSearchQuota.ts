import { useSyncExternalStore } from 'react'
import { rateLimitBucket, type RateLimitResource } from '../api/github'
import { getQuota, subscribeQuota, type SearchQuota } from '../api/rateLimit'

/**
 * The quota left for this token and resource (see `searchResource`), as
 * reported by the latest response. Undefined until a request has been made,
 * and again once the quota resets.
 */
export function useSearchQuota(resource: RateLimitResource, token?: string): SearchQuota | undefined {
  const bucket = rateLimitBucket(resource, token)
  return useSyncExternalStore(subscribeQuota, () => getQuota(bucket), () => undefined)
}
