import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isSameSearch,
  parseSearchUrl,
  toSearchUrl,
  type SearchUrlState,
} from '../lib/searchUrl'

/** `push` adds a history entry the back button returns to; `replace` doesn't */
export type HistoryMode = 'push' | 'replace'

export type NavigateSearch = (
  update: (prev: SearchUrlState) => SearchUrlState,
  mode: HistoryMode,
) => void

/**
 * Search state that lives in the URL, so it survives a reload, can be shared
 * as a link, and follows the browser's back and forward buttons.
 *
 * `onPopState` runs after back/forward changed the state, e.g. to refill an
 * input that isn't derived from it.
 */
export function useSearchUrlState(
  onPopState?: (state: SearchUrlState) => void,
): [SearchUrlState, NavigateSearch] {
  const [state, setState] = useState(() => parseSearchUrl(window.location.search))

  // navigate() reads from here rather than from `state`, so calls made before
  // React re-renders still build on each other.
  const stateRef = useRef(state)
  const onPopStateRef = useRef(onPopState)
  useEffect(() => {
    onPopStateRef.current = onPopState
  })

  useEffect(() => {
    // Replace a hand-edited URL (?page=abc) with what is actually shown
    writeHistory(stateRef.current, 'replace')

    function handlePopState() {
      const next = parseSearchUrl(window.location.search)
      stateRef.current = next
      setState(next)
      onPopStateRef.current?.(next)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback<NavigateSearch>((update, mode) => {
    const prev = stateRef.current
    const next = update(prev)
    if (isSameSearch(prev, next)) return

    stateRef.current = next
    writeHistory(next, mode)
    setState(next)
  }, [])

  return [state, navigate]
}

function writeHistory(state: SearchUrlState, mode: HistoryMode) {
  const { pathname, search, hash } = window.location
  const url = `${pathname}${toSearchUrl(state, search)}${hash}`
  if (mode === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
}
