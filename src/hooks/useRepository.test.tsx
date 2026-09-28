import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRepository, GitHubApiError } from '../api/github'
import type { RepositoryName } from '../lib/repositoryName'
import { useRepository } from './useRepository'

vi.mock('../api/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/github')>()),
  getRepository: vi.fn(),
}))

const lookUp = vi.mocked(getRepository)
const repo = { id: 1, full_name: 'o/r' } as Awaited<ReturnType<typeof getRepository>>

afterEach(() => {
  lookUp.mockReset()
  vi.useRealTimers()
})

interface Props {
  name: RepositoryName | null
  token?: string
}

function renderLookup(name: RepositoryName | null, token?: string) {
  const initialProps: Props = { name, token }
  return renderHook(({ name, token }: Props) => useRepository(name, token), { initialProps })
}

describe('useRepository', () => {
  it('stays idle without a name', () => {
    const { result } = renderLookup(null)
    expect(result.current.status).toBe('idle')
    expect(lookUp).not.toHaveBeenCalled()
  })

  it('loads the repository with the token', async () => {
    lookUp.mockResolvedValue(repo)
    const { result } = renderLookup({ owner: 'o', name: 'r' }, 'secret')
    expect(result.current.status).toBe('loading')

    await act(async () => {})
    expect(result.current).toMatchObject({ status: 'success', data: repo })
    expect(lookUp).toHaveBeenCalledWith('o', 'r', expect.objectContaining({ token: 'secret' }))
  })

  it('does not look up again for an equal name', async () => {
    lookUp.mockResolvedValue(repo)
    const { rerender } = renderLookup({ owner: 'o', name: 'r' })
    await act(async () => {})

    rerender({ name: { owner: 'o', name: 'r' } })
    expect(lookUp).toHaveBeenCalledTimes(1)
  })

  it('reports an error and looks up again on refetch', async () => {
    lookUp.mockRejectedValueOnce(new Error('nope')).mockResolvedValue(repo)
    const { result } = renderLookup({ owner: 'o', name: 'r' })
    await act(async () => {})
    expect(result.current).toMatchObject({ status: 'error', error: new Error('nope') })

    await act(async () => result.current.refetch())
    expect(result.current.status).toBe('success')
  })

  it('aborts a lookup whose name has changed', async () => {
    lookUp.mockReturnValue(new Promise(() => {}))
    const { rerender } = renderLookup({ owner: 'o', name: 'r' })
    const signal = lookUp.mock.calls[0][2]!.signal!

    rerender({ name: { owner: 'o', name: 'other' } })
    expect(signal.aborted).toBe(true)
  })

  it('retries by itself once a rate limit resets', async () => {
    vi.useFakeTimers()
    lookUp
      .mockRejectedValueOnce(
        new GitHubApiError(403, null, {
          type: 'primary',
          resource: 'core',
          resetAt: new Date(Date.now() + 10_000),
        }),
      )
      .mockResolvedValue(repo)
    const { result } = renderLookup({ owner: 'o', name: 'r' })
    await act(async () => {})
    expect(result.current.status).toBe('error')

    await act(async () => {
      vi.advanceTimersByTime(11_000)
    })
    expect(result.current.status).toBe('success')
  })
})
