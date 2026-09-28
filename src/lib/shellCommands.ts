/**
 * The shell's commands, apart from their side effects: checking arguments and
 * building the lines they print. The Terminal runs the effects (searching,
 * opening tabs) and prints what these return.
 */
import { SEARCH_MAX_RESULTS, type RateLimitResource } from '../api/github'
import type { SearchQuota } from '../api/rateLimit'
import type { SearchType } from '../types/github'
import { formatNumber } from './format'
import { getTotalPages } from './pagination'
import { validateSearchQuery } from './searchQuery'
import { SEARCH_TYPE_INFO } from './searchTypes'
import {
  C,
  COMMAND_FOR,
  DEFAULT_PAGE_SIZE,
  FLAGS,
  formatCountdown,
  highlight,
  isSortKey,
  line,
  padStart,
  parseSearch,
  seg,
  SORT_KEYS,
  suggestCommand,
  USAGE,
  type Line,
  type SearchContext,
} from './shell'
import { capHint, pageOffset, TOKEN_HINT, totalPages, type SearchEntry } from './shellOutput'
import type { ResultView } from './shellResults'

export const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

/** A command that can't run: an error, and maybe more lines explaining it */
export interface Refusal {
  error: string
  more?: Line[]
}

export function refused<T>(value: T | Refusal): value is Refusal {
  return typeof value === 'object' && value !== null && 'error' in value
}

export function usageLine(usage: string): Line {
  return line([seg('usage: ', C.dim), ...highlight(usage)])
}

/** A search command's arguments as a search, the page size carrying over from the last one */
export function searchFromArgs(
  command: string,
  type: SearchType,
  args: string[],
  now: number,
  perPage: number = DEFAULT_PAGE_SIZE,
): SearchContext | Refusal {
  const parsed = parseSearch(type, args, now)
  const invalid = 'error' in parsed ? parsed.error : validateSearchQuery(parsed.q, type)?.message
  if (invalid || 'error' in parsed) return { error: `${command}: ${invalid}`, more: [usageLine(USAGE[type])] }

  const size = parsed.perPage ?? perPage
  const lastPage = getTotalPages(SEARCH_MAX_RESULTS, size)
  if ((parsed.page ?? 1) > lastPage) {
    return {
      error: `${command}: github serves only the first ${formatNumber(SEARCH_MAX_RESULTS)} results, so at most --page ${lastPage} with --limit ${size}`,
    }
  }
  return {
    type,
    q: parsed.q,
    sort: parsed.sort ?? 'best',
    order: parsed.order ?? 'desc',
    perPage: size,
    page: parsed.page ?? 1,
    repo: parsed.repo,
    mode: parsed.mode,
  }
}

/** Why there are no results to act on, from the state of the search on screen */
export function noResultsError(status: SearchEntry['status'] | undefined): string {
  if (status === 'loading') return 'wait for the current search to finish'
  if (status === 'limited') return 'rate limited — the search runs again once the limit resets'
  if (status === 'error') return 'the last search failed — run a search first'
  return 'no results on screen — run a search first'
}

/** The page `next`, `prev` or `page <n>` goes to */
export function targetPage(
  command: 'next' | 'prev' | 'page',
  arg: string | undefined,
  entry: SearchEntry,
): number | Refusal {
  const pages = totalPages(entry)
  const page = command === 'page' ? parseInt(arg ?? '', 10) : entry.ctx.page + (command === 'next' ? 1 : -1)
  if (page >= 1 && page <= pages) return page

  const error =
    command === 'page'
      ? `page: expected 1–${pages}`
      : `${command}: already on the ${page < 1 ? 'first' : 'last'} page (${entry.ctx.page}/${pages})`
  // Past the last page only because GitHub stops at 1,000 results
  const capped = page > pages && (entry.data?.total_count ?? 0) > pages * entry.ctx.perPage
  return {
    error,
    more: capped ? [capHint('  github returns only the first 1,000 results — narrow with ', entry.ctx)] : undefined,
  }
}

/** The search `sort <key> [asc|desc]` re-sorts the last one into */
export function resorted(ctx: SearchContext, args: string[]): SearchContext | Refusal {
  const keys = SORT_KEYS[ctx.type]
  const [key, order = 'desc'] = args
  if (keys.length === 1) {
    return { error: `sort: ${SEARCH_TYPE_INFO[ctx.type].singular} search can only be ordered by best match` }
  }
  if (!isSortKey(ctx.type, key)) return { error: `sort: expected ${keys.join(' | ')}` }
  if (order !== 'asc' && order !== 'desc') return { error: 'sort: order must be asc|desc' }
  return { ...ctx, sort: key, order, page: 1 }
}

/**
 * Which result on the page `open`/`view`/`yank [#]` acts on: the rank typed,
 * or the selected one without it
 */
export function pickedIndex(arg: string | undefined, sel: number, entry: SearchEntry): number | Refusal {
  const count = entry.data?.items.length ?? 0
  if (!count) return { error: 'no results on screen' }
  const offset = pageOffset(entry.ctx)
  const index = arg === undefined ? Math.min(sel, count - 1) : parseInt(arg, 10) - offset - 1
  if (index >= 0 && index < count) return index
  return { error: `#${arg} is not on this page (${offset + 1}–${offset + count})` }
}

export function viewLines(view: ResultView): Line[] {
  return [
    line([
      seg('→ ', C.green),
      seg('previewing ', C.desc),
      seg(view.prefix + view.title.trim(), C.green, { bold: true }),
    ]),
  ]
}

export function openLines(view: ResultView): Line[] {
  return [line([seg('↗ ', C.green), seg('opening ', C.desc), seg(view.url, C.cyan, { underline: true })])]
}

export function yankLines({ yank }: ResultView): Line[] {
  return yank.shell
    ? [
        line([seg('$ ', C.dim), seg(yank.shell, C.white)]),
        line([seg('  copied to clipboard — paste into your real shell', C.dim)]),
      ]
    : [line([seg(`copied ${yank.label} `, C.dim), seg(yank.text, C.white)])]
}

/** `token`: whether the build has one, and how to give it one */
export function tokenStatusLines(hasToken: boolean): Line[] {
  if (hasToken)
    return [line([seg('token ', C.dim), seg('from VITE_GITHUB_TOKEN', C.white), seg(' · 30 searches/min', C.dim)])]
  return [
    line([seg('no token · 10 searches/min · no code or semantic issue search', C.amber)]),
    line([
      seg('  create a fine-grained token with no extra permissions: ', C.dim),
      seg(NEW_TOKEN_URL.replace('https://', ''), C.cyan, {
        underline: true,
        action: { type: 'openUrl', url: NEW_TOKEN_URL },
      }),
    ]),
    line([seg('  then set ', C.dim), TOKEN_HINT, seg(' and rebuild', C.dim)]),
  ]
}

export interface RateView {
  remaining: number
  limit: number
  /** Undefined until a request has reported it */
  quota: SearchQuota | undefined
  resource: RateLimitResource
  hasToken: boolean
  now: number
}

export function rateLines({ remaining, limit, quota, resource, hasToken, now }: RateView): Line[] {
  const filled = Math.round((remaining / limit) * 20)
  const reset = quota ? ` · resets in ${formatCountdown(quota.resetAt.getTime() - now)}` : ''
  return [
    line([
      seg('quota  ', C.dim),
      seg('█'.repeat(filled), remaining ? C.green : C.red),
      seg('░'.repeat(20 - filled), C.faint),
      seg(`  ${remaining}/${limit} left${reset}`, C.desc),
    ]),
    line([
      seg('limit  ', C.dim),
      seg(`${limit}/min · ${resource.replace('_', ' ')} · ${hasToken ? 'token' : 'anonymous'}`, C.desc),
    ]),
  ]
}

/** Numbered, each one clickable to put it back at the prompt */
export function historyLines(history: readonly string[]): Line[] {
  if (!history.length) return [line([seg('(empty)', C.dim)])]
  return history.map((h, i) =>
    line([
      seg(`${padStart(String(i + 1), 4)}  `, C.dim),
      ...highlight(h).map((x) => ({ ...x, action: { type: 'fill' as const, text: h } })),
    ]),
  )
}

export function whoamiLines(hasToken: boolean, limit: number): Line[] {
  return [
    hasToken
      ? line([seg('authenticated via token', C.desc), seg(` · ${limit} searches/min`, C.desc)])
      : line([seg('guest', C.white), seg(` (anonymous) · ${limit} searches/min`, C.desc)]),
  ]
}

/** `help <search>`: one search command in detail */
export function searchHelpLines(type: SearchType): Line[] {
  const info = SEARCH_TYPE_INFO[type]
  const flags = Object.keys(FLAGS[type]).filter((f) => f.startsWith('--'))
  const example = info.placeholder.replace(
    /^.*e\.g\. /,
    `${COMMAND_FOR[type]} ${type === 'labels' ? 'vercel/next.js ' : ''}`,
  )
  return [
    line([seg(info.label, C.white, { bold: true }), seg(` — ${COMMAND_FOR[type]}`, C.dim)]),
    usageLine(USAGE[type]),
    line([seg('flags: ', C.dim), seg([...flags, '--sort', '--order', '--limit', '--page'].join(' '), C.cyan)]),
    line([seg('sort:  ', C.dim), seg(SORT_KEYS[type].join(' · '), C.desc)]),
    line([seg('e.g.   ', C.dim), ...highlight(example)]),
  ]
}

export function crtLines(on: boolean): Line[] {
  const other = on ? 'off' : 'on'
  return [
    line([
      seg('crt ', C.dim),
      seg(on ? 'on' : 'off', C.white),
      seg(on ? ' · scanlines and glow · ' : ' · plain text · ', C.dim),
      seg(`crt ${other}`, C.green, { action: { type: 'run', command: `crt ${other}` } }),
    ]),
  ]
}

export function exitLines(): Line[] {
  return [
    line([
      seg('logout: this shell is the product. try ', C.dim),
      seg('clear', C.green, { action: { type: 'run', command: 'clear' } }),
      seg(' instead.', C.dim),
    ]),
  ]
}

/** A close command to try instead, if there is one */
export function didYouMeanLines(typed: string): Line[] {
  const suggestion = suggestCommand(typed)
  if (!suggestion) return []
  return [
    line([
      seg('  did you mean ', C.dim),
      seg(suggestion, C.green, { bold: true, action: { type: 'fill', text: `${suggestion} ` } }),
      seg('?', C.dim),
    ]),
  ]
}
