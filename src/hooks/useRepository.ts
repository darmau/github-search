import { useCallback, useEffect, useState } from 'react'
import { getRepository, GitHubApiError } from '../api/github'
import type { RepositoryName } from '../lib/repositoryName'
import type { Repository } from '../types/github'
import type { UseGitHubSearchResult } from './useGitHubSearch'

const RATE_LIMIT_RETRY_SLACK_MS = 1_000

interface Settled {
  key: string
  attempt: number
  data?: Repository
  error?: Error
}

/**
 * Looks up a repository whenever `name` or `token` change, e.g. for the id
 * label search needs. Pass `null` to stay idle. Like `useGitHubSearch`, a
 * rate limited lookup is retried automatically once the limit resets.
 */
export function useRepository(
  name: RepositoryName | null,
  token: string | undefined,
): UseGitHubSearchResult<Repository> {
  // A string, so an inline object for `name` doesn't restart the lookup
  const key = name ? JSON.stringify([name.owner, name.name, token ?? null]) : null
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (key === null) return

    const [owner, repo, reqToken] = JSON.parse(key) as [string, string, string | null]
    const controller = new AbortController()

    getRepository(owner, repo, { token: reqToken ?? undefined, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setSettled({ key, attempt, data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setSettled({ key, attempt, error: error instanceof Error ? error : new Error(String(error)) })
      })

    return () => controller.abort()
  }, [key, attempt])

  const refetch = useCallback(() => setAttempt((n) => n + 1), [])

  const current = settled?.key === key && settled.attempt === attempt ? settled : null

  const rateLimit = current?.error instanceof GitHubApiError ? current.error.rateLimit : null
  useEffect(() => {
    if (!rateLimit) return
    const delay = rateLimit.resetAt.getTime() - Date.now() + RATE_LIMIT_RETRY_SLACK_MS
    const timer = setTimeout(() => setAttempt((n) => n + 1), delay)
    return () => clearTimeout(timer)
  }, [rateLimit])

  if (key === null) return { status: 'idle', data: undefined, error: undefined, refetch }
  if (!current) return { status: 'loading', data: undefined, error: undefined, refetch }
  if (current.error) return { status: 'error', data: undefined, error: current.error, refetch }
  return { status: 'success', data: current.data!, error: undefined, refetch }
}
