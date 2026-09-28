import { useSyncExternalStore } from 'react'
import type { RateLimitResource } from '../api/github'
import { getQuota, subscribeQuota, type SearchQuota } from '../api/rateLimit'

/**
 * The quota left for this resource (see `searchResource`), as
 * reported by the latest response. Undefined until a request has been made,
 * and again once the quota resets.
 */
export function useSearchQuota(resource: RateLimitResource): SearchQuota | undefined {
  return useSyncExternalStore(
    subscribeQuota,
    () => getQuota(resource),
    () => undefined,
  )
}
