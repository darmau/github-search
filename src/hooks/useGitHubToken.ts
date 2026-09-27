import { useSyncExternalStore } from 'react'

/**
 * A personal access token the user chose to save in this browser. It raises
 * the search rate limit from 10 to 30 req/min, and never leaves the browser
 * except in requests to api.github.com.
 */
export const GITHUB_TOKEN_STORAGE_KEY = 'github-search:token'

const listeners = new Set<() => void>()

// Set when localStorage refuses writes (e.g. some private modes), so the token
// still works for this page's lifetime instead of silently vanishing.
let fallback: { token: string | null } | null = null

function getSnapshot(): string | null {
  if (fallback) return fallback.token
  try {
    return localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab saving or removing the token
  function handleStorage(e: StorageEvent) {
    if (e.key === GITHUB_TOKEN_STORAGE_KEY || e.key === null) listener()
  }
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
  }
}

/** Saves the token, or removes it when given `null` or a blank string */
export function setGitHubToken(token: string | null): void {
  const value = token?.trim() || null
  try {
    if (value) localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, value)
    else localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY)
    fallback = null
  } catch {
    fallback = { token: value }
  }
  listeners.forEach((listener) => listener())
}

/** The saved token, kept in sync across components and tabs */
export function useGitHubToken(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
