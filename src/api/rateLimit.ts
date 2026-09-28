import type { GitHubApiError, RateLimit } from './github'

/** Search quota as reported by the latest successful response */
export interface SearchQuota {
  limit: number
  remaining: number
  /** When `remaining` goes back up to `limit` */
  resetAt: Date
}

export type RateLimitedError = GitHubApiError & { rateLimit: RateLimit }

// All keyed by rate limit resource (see `searchResource`)
const cooldowns = new Map<string, RateLimitedError>()
const quotas = new Map<string, SearchQuota>()
const quotaTimers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/**
 * The rate limit error still in force for this bucket, if any. Requests made
 * before it resets would only fail again, and hitting a secondary limit
 * repeatedly can make GitHub block the client for longer.
 */
export function getCooldown(bucket: string): RateLimitedError | undefined {
  const error = cooldowns.get(bucket)
  if (!error) return undefined
  if (Date.now() < error.rateLimit.resetAt.getTime()) return error
  cooldowns.delete(bucket)
  return undefined
}

export function startCooldown(bucket: string, error: RateLimitedError): void {
  cooldowns.set(bucket, error)
}

/** Records the quota a successful response reported, which also ends any cooldown */
export function recordQuota(bucket: string, quota: SearchQuota | null): void {
  cooldowns.delete(bucket)
  if (!quota) return

  clearTimeout(quotaTimers.get(bucket))
  quotas.set(bucket, quota)
  // Once the window resets the numbers are stale, and nothing else would clear them
  quotaTimers.set(
    bucket,
    setTimeout(() => {
      quotas.delete(bucket)
      quotaTimers.delete(bucket)
      notify()
    }, quota.resetAt.getTime() - Date.now()),
  )
  notify()
}

/** The last known quota, or undefined once it has reset. Stable between changes. */
export function getQuota(bucket: string): SearchQuota | undefined {
  return quotas.get(bucket)
}

export function subscribeQuota(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetRateLimits(): void {
  cooldowns.clear()
  quotas.clear()
  quotaTimers.forEach((timer) => clearTimeout(timer))
  quotaTimers.clear()
}
