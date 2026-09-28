import { GitHubApiError, SEARCH_MAX_RESULTS } from '../api/github'
import type { RepositorySearchResponse, RepositorySearchResultItem } from '../types/github'
import { formatNumber } from './format'
import { getTotalPages } from './pagination'
import {
  C,
  describeRequest,
  EXAMPLES,
  formatAgo,
  formatCountdown,
  formatShort,
  highlight,
  line,
  pad,
  padStart,
  seg,
  sortLabel,
  truncate,
  type Line,
  type SearchContext,
  type Seg,
} from './shell'

/** `d`esktop or `m`obile: the same session renders differently on each */
export type Layout = 'd' | 'm'

export interface SearchEntry {
  kind: 'search'
  id: number
  ctx: SearchContext
  /** When the entry last changed, for the type-out effect */
  at: number
  status: 'loading' | 'done' | 'error' | 'limited'
  /** Served from the search cache, without a request */
  cached: boolean
  ms: number
  data?: RepositorySearchResponse
  error?: Error
  /** When a rate limited search is retried */
  resetAt?: number
}

export type Entry =
  | { kind: 'motd'; id: number; at: number }
  | { kind: 'cmd'; id: number; text: string; suffix?: string; at: number }
  | { kind: 'lines'; id: number; lines: Line[]; mobile?: Line[]; at: number }
  | SearchEntry

export const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

export function spinner(now: number): string {
  return SPINNER[Math.floor(now / 80) % SPINNER.length]
}

const LOGO = [
  '  ____  _   _  ____  ',
  ' / ___|| | | |/ ___| ',
  '| |  _ | |_| |\\___ \\ ',
  '| |_| ||  _  | ___) |',
  ' \\____||_| |_||____/ ',
]

const TOKEN_HINT = seg('token set <pat>', C.green, { action: { type: 'fill', text: 'token set ' } })

export function motdLines(hasToken: boolean, date: string): Line[] {
  return [
    ...LOGO.map((l) => line([seg(l, C.green, { bold: true })])),
    line([]),
    line([seg('ghs', C.white, { bold: true }), seg(` — github search shell · ${hasToken ? 'token' : 'guest'}@tty0 · ${date}`, C.dim)]),
    hasToken
      ? line([seg('[ ok ] ', C.green), seg('token in use · 30 searches/min', C.desc)])
      : line([seg('[warn] ', C.amber), seg('no token · 10 searches/min · ', C.desc), TOKEN_HINT, seg(' for 30', C.desc)]),
    line([seg('[info] ', C.cyan), seg(`each query returns at most ${formatNumber(SEARCH_MAX_RESULTS)} results`, C.desc)]),
    line([]),
    line([seg('try:', C.dim)]),
    ...EXAMPLES.map((x) =>
      line([seg('  ❯ ', C.faint), ...highlight(x).map((s) => ({ ...s, action: { type: 'run' as const, command: x } }))]),
    ),
    line([]),
    line([
      seg('help', C.green, { action: { type: 'run', command: 'help' } }),
      seg(' for commands · tab completes · ↑ history · ^L clears', C.dim),
    ]),
    line([]),
  ]
}

export function commandLine(text: string, layout: Layout, suffix?: string): Line {
  const prompt =
    layout === 'm'
      ? [seg('ghs', C.green, { bold: true }), seg(' ❯ ', C.green)]
      : [seg('ghs', C.green, { bold: true }), seg(' ~/search ', C.dim), seg('❯ ', C.green)]
  return line([...prompt, ...highlight(text), ...(suffix ? [seg(suffix, C.dim)] : [])])
}

export function errorLine(message: string): Line {
  return line([seg('ghs: ', C.red, { bold: true }), seg(message, C.red)])
}

const HELP: [string, string][] = [
  ['find <terms> [flags]', 'search repositories (f, search)'],
  ['  --lang, -l <lang>', 'language:<lang>'],
  ['  --stars, -s <range>', 'stars:<range>  e.g. >5k, 100..500'],
  ['  --pushed <age>', 'pushed within  <24h <7d <30d <1y'],
  ['  --topic, -t <topic>', 'topic:<topic>'],
  ['  --user, -u <owner>', 'user:<owner>'],
  ['  --no-archived', 'archived:false'],
  ['  --sort <key>', 'best | stars | forks | updated | help-wanted'],
  ['  --order <asc|desc>', 'default desc'],
  ['  --limit, -n <n>', '10 | 20 | 50 | 100 per page'],
  ['  <qualifier>', 'any GitHub qualifier, e.g. license:mit'],
  ['next · prev · page <n>', 'paginate the last search'],
  ['sort <key> [asc|desc]', 're-sort the last search'],
  ['ls', 'reprint last results (no quota)'],
  ['view · open · yank [#]', 'preview · open on GitHub · copy clone URL'],
  ['token [set <pat> | rm]', 'raise the limit from 10 to 30/min'],
  ['rate · history · whoami · clear', ''],
]

/** Desktop and mobile variants of `help` */
export function helpLines(): { lines: Line[]; mobile: Line[] } {
  const title = (t: string) => line([seg(t, C.white, { bold: true })])
  const key = (k: string) => seg(k, C.amber)
  const text = (t: string) => seg(t, C.dim)
  const lines = [
    title('commands'),
    ...HELP.map(([usage, description]) =>
      line([
        seg('  '),
        // Flags aren't commands, so don't paint them as unknown ones
        ...highlight(pad(usage, 34)).map((s) => (usage.startsWith('  ') && s.c === C.red ? { ...s, c: C.cyan } : s)),
        seg(description, C.desc),
      ]),
    ),
    line([]),
    line([
      seg('keys  ', C.white, { bold: true }),
      key('tab'), text(' complete · '), key('↑↓'), text(' history · '), key('→'), text(' accept suggestion · '),
      key('^L'), text(' clear · '), key('^C'), text(' cancel · '), key('esc'), text(' pick mode'),
    ]),
    line([
      seg('pick  ', C.white, { bold: true }),
      key('j/k'), text(' move · '), key('↵'), text(' open · '), key('y'), text(' yank · '),
      key('n/p'), text(' page · '), key('q'), text(' quit'),
    ]),
  ]
  const mobile = [
    title('commands'),
    ...HELP.filter(([usage]) => !usage.startsWith('  ')).map(([usage, description]) =>
      line([seg(usage, C.green), seg(description ? `\n  ${description}` : '', C.dim)]),
    ),
    line([seg('find flags: --lang --stars --pushed --topic --user --no-archived --sort --order --limit', C.cyan)]),
    line([]),
    line([seg('pick: ↑↓ move · OPEN · YANK · PREV/NEXT · QUIT', C.dim)]),
  ]
  return { lines, mobile }
}

export function repoOwner(item: RepositorySearchResultItem): string {
  return item.owner?.login ?? item.full_name.split('/')[0]
}

export function totalPages(entry: SearchEntry): number {
  return getTotalPages(entry.data?.total_count ?? 0, entry.ctx.perPage, SEARCH_MAX_RESULTS)
}

/** Rank of the first result on the entry's page, minus one */
export function pageOffset(ctx: SearchContext): number {
  return (ctx.page - 1) * ctx.perPage
}

const NARROW_HINT = [
  seg('--lang', C.cyan), seg(', ', C.dim), seg('--stars', C.cyan), seg(' or ', C.dim), seg('--pushed', C.cyan),
]

export function capHint(prefix: string): Line {
  return line([seg(prefix, C.dim), ...NARROW_HINT])
}

export interface SearchView {
  layout: Layout
  /** The search the prompt acts on: selectable, with navigation links */
  live: boolean
  sel: number
  yanked: boolean
  now: number
  limit: number
  remaining: number
  hasToken: boolean
}

export function searchLines(entry: SearchEntry, view: SearchView): Line[] {
  const { ctx } = entry
  const { layout, live, now } = view
  const desktop = layout === 'd'
  const lines: Line[] = []
  const push = (segs: Seg[], options?: Omit<Line, 'segs'>) => lines.push(line(segs, options))

  push([seg(`→ ${desktop ? describeRequest(ctx) : `q=${ctx.q} · ${sortLabel(ctx)} · p${ctx.page}`}`, C.faint)])

  if (entry.status === 'loading') {
    push([seg(`${spinner(now)} `, C.amber), seg('querying api.github.com …', C.amber)])
    return lines
  }

  if (entry.status === 'limited') {
    const error = entry.error as GitHubApiError
    const secondary = error.rateLimit?.type === 'secondary'
    push([
      seg(`[fail] ${error.status} `, C.red, { bold: true }),
      seg(secondary ? 'too many requests in a short time' : `search quota used up · 0 of ${view.limit} left`, C.red),
    ])
    if (live && entry.resetAt) {
      push([
        seg('       retrying automatically in ', C.desc),
        seg(formatCountdown(entry.resetAt - now), C.white, { bold: true }),
        seg(` ${spinner(now)}`, C.amber),
      ])
      if (!view.hasToken) push([seg('       hint: ', C.dim), TOKEN_HINT, seg(' raises the limit to 30/min', C.dim)])
    }
    push([])
    return lines
  }

  if (entry.status === 'error' || !entry.data) {
    const error = entry.error
    const status = error instanceof GitHubApiError ? `${error.status} ` : ''
    push([seg(`[fail] ${status}`, C.red, { bold: true }), seg(error?.message ?? 'search failed', C.red)])
    if (error instanceof GitHubApiError && error.status === 401) {
      push([seg('       try ', C.dim), seg('token rm', C.green, { action: { type: 'fill', text: 'token rm' } }), seg(' or a new token', C.dim)])
    }
    push([])
    return lines
  }

  const { data } = entry
  if (!data.total_count) {
    push([seg('0 repositories', C.white, { bold: true }), seg(' match ', C.dim), seg(ctx.q, C.yellow)])
    push([seg('  drop a qualifier or broaden the terms', C.dim)])
    push([])
    return lines
  }

  const pages = totalPages(entry)
  const offset = pageOffset(ctx)
  push([
    seg(formatNumber(data.total_count), C.green, { bold: true }),
    seg(data.total_count === 1 ? ' repository' : ' repositories'),
    seg(` · ${entry.cached ? 'cached' : `${entry.ms}ms`} · page ${ctx.page}/${pages} · ${sortLabel(ctx)}`, C.dim),
  ])
  if (data.incomplete_results) push([seg('[warn] ', C.amber), seg('search timed out, results may be incomplete', C.amber)])
  if (desktop) {
    push([seg(`          ${pad('REPOSITORY', 44)}${padStart('STARS', 7)}${padStart('FORKS', 8)}  ${pad('LANG', 12)}PUSHED`, C.faint)])
  }

  data.items.forEach((item, i) => {
    const on = live && i === view.sel
    const rank = String(offset + i + 1)
    const owner = repoOwner(item)
    const options = { bg: on ? 'rgba(77,255,154,.09)' : undefined, action: live ? { type: 'select' as const, index: i } : undefined }
    const openAction = { type: 'run' as const, command: `open ${rank}` }
    const mark = seg(on ? ' > ' : '   ', C.green, { bold: true })
    const name = (t: string) => seg(t, on ? C.white : C.green, { bold: true, underline: on, action: on ? openAction : undefined })
    const topics = item.topics ?? []
    const language = item.language ?? '—'

    if (desktop) {
      const full = `${owner}/${item.name}`
      const nameWidth = Math.min(full.length, 43)
      push([
        mark,
        seg(`${padStart(rank, 4)}   `, on ? C.green : C.dim),
        seg(`${owner}/`, C.dim),
        name(full.length > 43 ? truncate(item.name, 43 - owner.length - 1) : item.name),
        seg(' '.repeat(44 - nameWidth) + padStart(formatShort(item.stargazers_count), 7), C.white),
        seg(padStart(formatShort(item.forks_count), 8), C.desc),
        seg(`  ${pad(language, 12)}`, C.cyan),
        seg(pad(formatAgo(item.pushed_at, now), 11), C.dim),
        ...(item.archived ? [seg('ARCHIVED', C.amber)] : []),
      ], options)
      if (item.description) push([seg(' '.repeat(10) + truncate(item.description, 100), C.desc)], options)
      if (topics.length) push([seg(' '.repeat(10), C.dim), ...topics.map((t) => seg(`#${t}  `, C.amber))], options)
    } else {
      push([mark, seg(`${padStart(rank, 3)} `, on ? C.green : C.dim), seg(`${owner}/`, C.dim), name(truncate(item.name, 40 - owner.length))], options)
      push([
        seg(`       ${formatShort(item.stargazers_count)} stars · `, C.white),
        seg(language, C.cyan),
        seg(` · ${formatAgo(item.pushed_at, now)}`, C.dim),
        ...(item.archived ? [seg(' · ARCHIVED', C.amber)] : []),
      ], options)
      if (item.description) push([seg(`       ${truncate(item.description, 44)}`, C.desc)], options)
      if (on) {
        push([seg(`       license ${item.license?.spdx_id ?? '—'} · ${formatShort(item.open_issues_count)} issues · ${item.default_branch}`, C.dim)], options)
        if (topics.length) push([seg('       '), ...topics.map((t) => seg(`#${t} `, C.amber))], options)
        push([
          seg('       '),
          seg('[ open ↗ ]', C.bg, { bg: C.green, bold: true, action: openAction }),
          seg('  '),
          seg(view.yanked ? '[ copied ✓ ]' : '[ yank url ]', C.green, { bold: true, action: { type: 'run', command: `yank ${rank}` } }),
        ], options)
      }
    }
    push([])
  })

  if (data.total_count > SEARCH_MAX_RESULTS && ctx.page === pages) {
    lines.push(capHint(`github returns only the first ${formatNumber(SEARCH_MAX_RESULTS)} of ${formatNumber(data.total_count)} — narrow with `))
  }

  if (live) {
    if (view.remaining <= Math.max(2, view.limit * 0.2)) {
      push([
        seg('[warn] ', C.amber),
        seg(`${view.remaining} of ${view.limit} searches left this minute`, C.amber),
        ...(view.hasToken ? [] : [seg(' · ', C.dim), TOKEN_HINT, seg(' for 30', C.dim)]),
      ])
    }
    const link = (t: string) => seg(t, C.green, { underline: true, action: { type: 'run', command: t } })
    push([
      seg('── ', C.faint),
      ...(ctx.page < pages ? [link('next'), seg(' · ', C.dim)] : []),
      ...(ctx.page > 1 ? [link('prev'), seg(' · ', C.dim)] : []),
      link('sort stars'),
      seg(' · ', C.dim),
      link('sort updated'),
      seg(desktop ? ' · open <#> · yank <#> · esc → pick' : '', C.dim),
    ])
  }
  push([])
  return lines
}
