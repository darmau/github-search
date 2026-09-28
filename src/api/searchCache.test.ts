import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_TTL_MS,
  clearSearchCache,
  getCachedSearch,
  searchCacheKey,
  setCachedSearch,
} from './searchCache'

describe('searchCacheKey', () => {
  it('ignores param order and empty values', () => {
    const key = searchCacheKey('repositories', { q: 'react', page: 2, sort: 'stars' })

    expect(searchCacheKey('repositories', { sort: 'stars', page: 2, q: 'react' })).toBe(key)
    expect(searchCacheKey('repositories', { q: 'react', page: 2, sort: 'stars', order: undefined })).toBe(key)
    expect(searchCacheKey('repositories', { q: 'react', page: 2, sort: 'stars', order: '' as never })).toBe(key)
  })

  it('distinguishes anything that changes the response', () => {
    const key = searchCacheKey('repositories', { q: 'react' })

    expect(searchCacheKey('users', { q: 'react' })).not.toBe(key)
    expect(searchCacheKey('repositories', { q: 'vue' })).not.toBe(key)
    expect(searchCacheKey('repositories', { q: 'react', page: 2 })).not.toBe(key)
    expect(searchCacheKey('repositories', { q: 'react' }, { token: 'a' })).not.toBe(key)
    expect(searchCacheKey('repositories', { q: 'react' }, { textMatch: true })).not.toBe(key)
  })

  it('treats textMatch false like the default', () => {
    expect(searchCacheKey('repositories', { q: 'react' }, { textMatch: false })).toBe(
      searchCacheKey('repositories', { q: 'react' }),
    )
  })

  it('keeps an explicit empty token apart from the default token', () => {
    // '' means "no token", while undefined falls back to VITE_GITHUB_TOKEN
    expect(searchCacheKey('repositories', { q: 'react' }, { token: '' })).not.toBe(
      searchCacheKey('repositories', { q: 'react' }),
    )
  })
})

describe('cache entries', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns what was stored, and undefined on a miss', () => {
    setCachedSearch('a', { total_count: 1 })

    expect(getCachedSearch('a')).toEqual({ total_count: 1 })
    expect(getCachedSearch('b')).toBeUndefined()
  })

  it('expires entries after the TTL', () => {
    setCachedSearch('a', 1)

    vi.advanceTimersByTime(SEARCH_CACHE_TTL_MS - 1)
    expect(getCachedSearch('a')).toBe(1)

    vi.advanceTimersByTime(1)
    expect(getCachedSearch('a')).toBeUndefined()
  })

  it('restarts the TTL when an entry is overwritten', () => {
    setCachedSearch('a', 1)
    vi.advanceTimersByTime(SEARCH_CACHE_TTL_MS - 1)
    setCachedSearch('a', 2)

    vi.advanceTimersByTime(SEARCH_CACHE_TTL_MS - 1)
    expect(getCachedSearch('a')).toBe(2)
  })

  it('evicts the least recently used entry when full', () => {
    for (let i = 0; i < SEARCH_CACHE_MAX_ENTRIES; i++) setCachedSearch(`k${i}`, i)

    // Reading k0 makes k1 the least recently used
    getCachedSearch('k0')
    setCachedSearch('new', 'x')

    expect(getCachedSearch('k0')).toBe(0)
    expect(getCachedSearch('k1')).toBeUndefined()
    expect(getCachedSearch('k2')).toBe(2)
    expect(getCachedSearch('new')).toBe('x')
  })

  it('clears all entries', () => {
    setCachedSearch('a', 1)
    setCachedSearch('b', 2)

    clearSearchCache()
    expect(getCachedSearch('a')).toBeUndefined()
    expect(getCachedSearch('b')).toBeUndefined()
  })
})
