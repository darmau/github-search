import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { clearSearchCache } from '../api/searchCache'
import { setGitHubToken } from '../hooks/useGitHubToken'

afterEach(() => {
  // Testing Library only auto-cleans when `afterEach` is a global, which it
  // isn't without `test.globals`, so unmount rendered trees here instead.
  cleanup()
  // The search cache is module-level and would otherwise leak between tests
  clearSearchCache()
  // So does the jsdom URL, which holds the search state
  window.history.replaceState(null, '', '/')
  // And the saved token, which lives in localStorage
  setGitHubToken(null)
  localStorage.clear()
})
