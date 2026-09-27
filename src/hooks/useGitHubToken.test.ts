import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GITHUB_TOKEN_STORAGE_KEY, setGitHubToken, useGitHubToken } from './useGitHubToken'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGitHubToken', () => {
  it('is null until a token is saved', () => {
    const { result } = renderHook(() => useGitHubToken())
    expect(result.current).toBeNull()
  })

  it('reads a token saved in an earlier visit', () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, 'ghp_saved')
    const { result } = renderHook(() => useGitHubToken())
    expect(result.current).toBe('ghp_saved')
  })

  it('saves a trimmed token and updates every reader', () => {
    const a = renderHook(() => useGitHubToken())
    const b = renderHook(() => useGitHubToken())

    act(() => setGitHubToken('  ghp_new  '))
    expect(localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)).toBe('ghp_new')
    expect(a.result.current).toBe('ghp_new')
    expect(b.result.current).toBe('ghp_new')
  })

  it('removes the token when given null or a blank string', () => {
    const { result } = renderHook(() => useGitHubToken())

    act(() => setGitHubToken('ghp_new'))
    act(() => setGitHubToken('   '))
    expect(result.current).toBeNull()
    expect(localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)).toBeNull()

    act(() => setGitHubToken('ghp_new'))
    act(() => setGitHubToken(null))
    expect(result.current).toBeNull()
  })

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useGitHubToken())

    act(() => {
      localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, 'ghp_other_tab')
      window.dispatchEvent(new StorageEvent('storage', { key: GITHUB_TOKEN_STORAGE_KEY }))
    })
    expect(result.current).toBe('ghp_other_tab')
  })

  it('keeps the token in memory when storage refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const { result } = renderHook(() => useGitHubToken())

    act(() => setGitHubToken('ghp_memory'))
    expect(result.current).toBe('ghp_memory')
  })

  it('treats unreadable storage as no token', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError')
    })
    const { result } = renderHook(() => useGitHubToken())
    expect(result.current).toBeNull()
  })
})
