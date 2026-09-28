/**
 * What the shell keeps beyond a page load: settings and history in
 * localStorage, and the search on screen in the URL, so it can be shared,
 * bookmarked and reached with back and forward.
 */

const CRT_KEY = 'dowse:crt'
const HISTORY_KEY = 'dowse:history'
/** The URL parameter holding the command of the search on screen */
export const COMMAND_PARAM = 'cmd'

/** Scanlines and glow, on unless turned off with `crt off` */
export function loadCrt(): boolean {
  try {
    return localStorage.getItem(CRT_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveCrt(on: boolean): void {
  try {
    if (on) localStorage.removeItem(CRT_KEY)
    else localStorage.setItem(CRT_KEY, 'off')
  } catch {
    // Still applies for this visit
  }
}

/** Command history, oldest first. Tokens were masked before it was saved. */
export function loadHistory(max: number): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((h): h is string => typeof h === 'string').slice(-max) : []
  } catch {
    return []
  }
}

export function saveHistory(history: readonly string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch {
    // Still kept for this visit
  }
}

/** The command in a query string, e.g. `?cmd=find+qdrant` */
export function commandFromUrl(search: string): string | null {
  return new URLSearchParams(search).get(COMMAND_PARAM)?.trim() || null
}

/** The current URL with its command replaced, other params and the hash kept */
export function urlWithCommand(
  { pathname, search, hash }: Pick<Location, 'pathname' | 'search' | 'hash'>,
  command: string,
): string {
  const params = new URLSearchParams(search)
  params.set(COMMAND_PARAM, command)
  return `${pathname}?${params}${hash}`
}
