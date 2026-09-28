import { GitHubApiError, MissingTokenError, SEARCH_MAX_RESULTS } from '../api/github'
import type { RepositorySearchResultItem } from '../types/github'
import { formatNumber } from './format'
import { getTotalPages } from './pagination'
import { SEARCH_TYPE_INFO } from './searchTypes'
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
import { describeResult, repoOwner, type AnySearchResponse } from './shellResults'

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
  data?: AnySearchResponse
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

export const TOKEN_HINT = seg('token set <pat>', C.green, { action: { type: 'fill', text: 'token set ' } })

export function motdLines(hasToken: boolean, date: string): Line[] {
  return [
    ...LOGO.map((l) => line([seg(l, C.green, { bold: true })])),
    line([]),
    line([seg('ghs', C.white, { bold: true }), seg(` — github search shell · ${hasToken ? 'token' : 'guest'}@tty0 · ${date}`, C.dim)]),
    hasToken
      ? line([seg('[ ok ] ', C.green), seg('token in use · 30 searches/min · code search on', C.desc)])
      : line([seg('[warn] ', C.amber), seg('no token · 10 searches/min · no code search · ', C.desc), TOKEN_HINT]),
    line([seg('[info] ', C.cyan), seg(`each query returns at most ${formatNumber(SEARCH_MAX_RESULTS)} results`, C.desc)]),
    line([]),
    line([seg('search: ', C.dim), ...['find', 'code', 'issues', 'commits', 'users', 'topics', 'labels'].flatMap((c, i) => [
      ...(i ? [seg(' · ', C.faint)] : []),
      seg(c, C.green, { action: { type: 'run', command: `help ${c}` } }),
    ])]),
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

/** [usage, description, flags] */
const SEARCH_HELP: [string, string, string][] = [
  ['find <terms> [flags]', 'repositories (f, repos)', '--lang --stars --pushed --topic --user --no-archived'],
  ['code <terms> [flags]', 'code · needs a token', '--lang --repo --path --ext --user'],
  ['issues <terms> [flags]', 'issues and pull requests', '--repo --state --pr --issue --author --label --lang --semantic --hybrid'],
  ['commits <terms> [flags]', 'commits', '--repo --author --committed --user'],
  ['users <terms> [flags]', 'users and organizations', '--location --followers --repos --type --lang'],
  ['topics <terms> [flags]', 'topics', '--featured --curated --repos'],
  ['labels <owner/name> <terms>', "a repository's labels", '--repo'],
]

const OTHER_HELP: [string, string][] = [
  ['  any search', '--sort <key> --order asc|desc --limit 10|20|50|100'],
  ['  <qualifier>', 'any GitHub qualifier, e.g. license:mit'],
  ['next · prev · page <n>', 'paginate the last search'],
  ['sort <key> [asc|desc]', 're-sort the last search (tab lists keys)'],
  ['ls', 'reprint last results (no quota)'],
  ['view · open · yank [#]', 'preview · open on GitHub · copy'],
  ['token [set <pat> | rm]', 'raise the limit from 10 to 30/min'],
  ['rate · history · whoami · clear', ''],
]

/** Desktop and mobile variants of `help` */
export function helpLines(): { lines: Line[]; mobile: Line[] } {
  const title = (t: string) => line([seg(t, C.white, { bold: true })])
  const key = (k: string) => seg(k, C.amber)
  const text = (t: string) => seg(t, C.dim)
  const usage = (u: string) =>
    // Flags aren't commands, so don't paint them as unknown ones
    highlight(pad(u, 34)).map((s) => (u.startsWith('  ') && s.c === C.red ? { ...s, c: C.cyan } : s))
  const lines = [
    title('search'),
    ...SEARCH_HELP.flatMap(([u, description, flags]) => [
      line([seg('  '), ...usage(u), seg(description, C.desc)]),
      line([seg('      '), seg(flags, C.cyan)]),
    ]),
    line([]),
    title('commands'),
    ...OTHER_HELP.map(([u, description]) => line([seg('  '), ...usage(u), seg(description, C.desc)])),
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
    title('search'),
    ...SEARCH_HELP.map(([u, description, flags]) => line([seg(u, C.green), seg(`\n  ${description}`, C.dim), seg(`\n  ${flags}`, C.cyan)])),
    line([]),
    title('commands'),
    ...OTHER_HELP.filter(([u]) => !u.startsWith('  ')).map(([u, description]) =>
      line([seg(u, C.green), seg(description ? `\n  ${description}` : '', C.dim)]),
    ),
    line([seg('any search: --sort --order --limit', C.cyan)]),
    line([]),
    line([seg('pick: ↑↓ move · OPEN · YANK · PREV/NEXT · QUIT', C.dim)]),
  ]
  return { lines, mobile }
}

export function totalPages(entry: SearchEntry): number {
  return getTotalPages(entry.data?.total_count ?? 0, entry.ctx.perPage, SEARCH_MAX_RESULTS)
}

/** Rank of the first result on the entry's page, minus one */
export function pageOffset(ctx: SearchContext): number {
  return (ctx.page - 1) * ctx.perPage
}

/** How to get past the 1,000-result cap: flags for repositories, qualifiers otherwise */
export function capHint(prefix: string, ctx: SearchContext): Line {
  const suggestions = ctx.type === 'repositories' ? ['--lang', '--stars', '--pushed'] : SEARCH_TYPE_INFO[ctx.type].narrowWith
  if (!suggestions.length) return line([seg(`${prefix.replace(/ — narrow with $/, '')} — use more specific terms`, C.dim)])
  return line([
    seg(prefix, C.dim),
    ...suggestions.flatMap((s, i) => [
      ...(i ? [seg(i === suggestions.length - 1 ? ' or ' : ', ', C.dim)] : []),
      ...highlight(`x ${s}`).slice(2),
    ]),
  ])
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
  const info = SEARCH_TYPE_INFO[ctx.type]
  const lines: Line[] = []
  const push = (segs: Seg[], options?: Omit<Line, 'segs'>) => lines.push(line(segs, options))

  const where = ctx.type === 'labels' ? `${ctx.repo} ` : ''
  push([seg(`→ ${desktop ? describeRequest(ctx) : `${ctx.type} ${where}q=${ctx.q} · ${sortLabel(ctx)} · p${ctx.page}`}`, C.faint)])

  if (entry.status === 'loading') {
    push([seg(`${spinner(now)} `, C.amber), seg('querying api.github.com …', C.amber)])
    return lines
  }

  if (entry.status === 'limited') {
    const error = entry.error as GitHubApiError
    const secondary = error.rateLimit?.type === 'secondary'
    push([
      seg(`[fail] ${error.status} `, C.red, { bold: true }),
      seg(secondary ? 'too many requests in a short time' : `${error.rateLimit?.resource === 'core' ? 'API' : 'search'} quota used up`, C.red),
    ])
    if (live && entry.resetAt) {
      push([
        seg('       retrying automatically in ', C.desc),
        seg(formatCountdown(entry.resetAt - now), C.white, { bold: true }),
        seg(` ${spinner(now)}`, C.amber),
      ])
      if (!view.hasToken) push([seg('       hint: ', C.dim), TOKEN_HINT, seg(' raises the limit', C.dim)])
    }
    push([])
    return lines
  }

  if (entry.status === 'error' || !entry.data) {
    const error = entry.error
    const status = error instanceof GitHubApiError ? `${error.status} ` : ''
    push([seg(`[fail] ${status}`, C.red, { bold: true }), seg(error?.message ?? 'search failed', C.red)])
    if (error instanceof MissingTokenError) {
      push([seg('       ', C.dim), TOKEN_HINT, seg(' to use this search', C.dim)])
    } else if (error instanceof GitHubApiError && error.status === 401) {
      push([seg('       try ', C.dim), seg('token rm', C.green, { action: { type: 'fill', text: 'token rm' } }), seg(' or a new token', C.dim)])
    }
    push([])
    return lines
  }

  const { data } = entry
  if (!data.total_count) {
    push([seg(`0 ${info.plural}`, C.white, { bold: true }), seg(' match ', C.dim), seg(ctx.q, C.yellow), ...(where ? [seg(` in ${ctx.repo}`, C.dim)] : [])])
    push([seg('  drop a qualifier or broaden the terms', C.dim)])
    push([])
    return lines
  }

  const pages = totalPages(entry)
  const offset = pageOffset(ctx)
  push([
    seg(formatNumber(data.total_count), C.green, { bold: true }),
    seg(` ${data.total_count === 1 ? info.singular : info.plural}`),
    seg(` · ${entry.cached ? 'cached' : `${entry.ms}ms`} · page ${ctx.page}/${pages} · ${sortLabel(ctx)}`, C.dim),
  ])
  if (data.incomplete_results) push([seg('[warn] ', C.amber), seg('search timed out, results may be incomplete', C.amber)])
  const table = desktop && ctx.type === 'repositories'
  if (table) {
    push([seg(`          ${pad('REPOSITORY', 44)}${padStart('STARS', 7)}${padStart('FORKS', 8)}  ${pad('LANG', 12)}PUSHED`, C.faint)])
  }

  data.items.forEach((item, i) => {
    const on = live && i === view.sel
    const rank = String(offset + i + 1)
    const options = { bg: on ? 'rgba(77,255,154,.09)' : undefined, action: live ? { type: 'select' as const, index: i } : undefined }
    const openAction = { type: 'run' as const, command: `open ${rank}` }
    const mark = seg(on ? ' > ' : '   ', C.green, { bold: true })
    const r = describeResult(ctx, item, now)
    const title = (t: string) =>
      seg(t, r.titleColor ?? (on ? C.white : C.green), { bg: r.titleBg, bold: true, underline: on && !r.titleBg, action: on ? openAction : undefined })
    const indent = desktop ? ' '.repeat(10) : '       '

    if (table) {
      // The design's column layout, repositories on wide screens only
      const repo = item as RepositorySearchResultItem
      const owner = repoOwner(repo)
      const full = `${owner}/${repo.name}`
      const nameWidth = Math.min(full.length, 43)
      push([
        mark,
        seg(`${padStart(rank, 4)}   `, on ? C.green : C.dim),
        seg(`${owner}/`, C.dim),
        title(full.length > 43 ? truncate(repo.name, 43 - owner.length - 1) : repo.name),
        seg(' '.repeat(44 - nameWidth) + padStart(formatShort(repo.stargazers_count), 7), C.white),
        seg(padStart(formatShort(repo.forks_count), 8), C.desc),
        seg(`  ${pad(repo.language ?? '—', 12)}`, C.cyan),
        seg(pad(formatAgo(repo.pushed_at, now), 11), C.dim),
        ...(repo.archived ? [seg('ARCHIVED', C.amber)] : []),
      ], options)
      if (r.detail) push([seg(indent + truncate(r.detail, 100), C.desc)], options)
      if (r.tags.length) push([seg(indent), ...r.tags], options)
      push([])
      return
    }

    const width = desktop ? 100 : 44
    push([
      mark,
      seg(desktop ? `${padStart(rank, 4)}   ` : `${padStart(rank, 3)} `, on ? C.green : C.dim),
      seg(r.prefix, C.dim),
      title(desktop ? r.title : truncate(r.title, Math.max(12, 40 - r.prefix.length))),
      ...r.badges,
    ], options)
    push([seg(indent), ...r.meta], options)
    if (r.detail) push([seg(indent + truncate(r.detail, width), C.desc)], options)
    if (on && !desktop && r.more.length) push([seg(indent), ...r.more], options)
    if (r.tags.length && (desktop || on)) push([seg(indent), ...r.tags], options)
    if (r.fragments.length && (desktop || on)) {
      for (const f of r.fragments) push([seg(`${indent}│ `, C.faint), ...f], options)
    }
    if (on && !desktop) {
      push([
        seg(indent),
        seg('[ open ↗ ]', C.bg, { bg: C.green, bold: true, action: openAction }),
        seg('  '),
        seg(view.yanked ? '[ copied ✓ ]' : `[ yank ${r.yank.label} ]`, C.green, { bold: true, action: { type: 'run', command: `yank ${rank}` } }),
      ], options)
    }
    push([])
  })

  if (data.total_count > SEARCH_MAX_RESULTS && ctx.page === pages) {
    lines.push(capHint(`github returns only the first ${formatNumber(SEARCH_MAX_RESULTS)} of ${formatNumber(data.total_count)} — narrow with `, ctx))
  }

  if (live) {
    if (view.remaining <= Math.max(2, view.limit * 0.2)) {
      push([
        seg('[warn] ', C.amber),
        seg(`${view.remaining} of ${view.limit} searches left this minute`, C.amber),
        ...(view.hasToken ? [] : [seg(' · ', C.dim), TOKEN_HINT, seg(' for more', C.dim)]),
      ])
    }
    const link = (t: string) => seg(t, C.green, { underline: true, action: { type: 'run', command: t } })
    const sorts = SORT_SUGGESTIONS[ctx.type]
    push([
      seg('── ', C.faint),
      ...(ctx.page < pages ? [link('next'), seg(' · ', C.dim)] : []),
      ...(ctx.page > 1 ? [link('prev'), seg(' · ', C.dim)] : []),
      ...sorts.flatMap((s, i) => [...(i ? [seg(' · ', C.dim)] : []), link(`sort ${s}`)]),
      seg(desktop ? `${sorts.length ? ' · ' : ''}open <#> · yank <#> · esc → pick` : '', C.dim),
    ])
  }
  push([])
  return lines
}

const SORT_SUGGESTIONS: { readonly [T in SearchContext['type']]: readonly string[] } = {
  repositories: ['stars', 'updated'],
  code: [],
  issues: ['created', 'comments'],
  commits: ['author-date'],
  users: ['followers', 'joined'],
  topics: [],
  labels: ['created'],
}
