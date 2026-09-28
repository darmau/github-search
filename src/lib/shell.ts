import type { SearchEndpoints, SearchOrder, SearchType } from '../types/github'
import { formatCount } from './format'
import { parseRepositoryName } from './repositoryName'

// Phosphor palette of the dowse terminal
export const C = {
  bg: '#070a08',
  fg: '#cfe8d6',
  green: '#4dff9a',
  dim: '#7a9a84',
  faint: '#608069',
  amber: '#ffb547',
  cyan: '#7fd1ff',
  desc: '#9db8a6',
  red: '#ff6b6b',
  white: '#eafff1',
  yellow: '#ffe38a',
  purple: '#c9a2ff',
  border: '#16261c',
  bar: '#0b110d',
} as const

/** What clicking a piece of terminal output does */
export type ShellAction =
  | { type: 'run'; command: string }
  | { type: 'fill'; text: string }
  | { type: 'openUrl'; url: string }
  | { type: 'select'; index: number }

/** A run of text in one style */
export interface Seg {
  t: string
  c: string
  bg?: string
  bold?: boolean
  underline?: boolean
  action?: ShellAction
}

export interface Line {
  segs: Seg[]
  bg?: string
  action?: ShellAction
  /** Drawing, not text, e.g. the ASCII logo: hidden from screen readers */
  decorative?: boolean
}

export function seg(t: string, c: string = C.fg, options: Omit<Seg, 't' | 'c'> = {}): Seg {
  return { t, c, ...options }
}

export function line(segs: Seg[], options: Omit<Line, 'segs'> = {}): Line {
  return { segs, ...options }
}

/** The command that runs each kind of search */
export const SEARCH_COMMANDS = {
  find: 'repositories',
  code: 'code',
  issues: 'issues',
  commits: 'commits',
  users: 'users',
  topics: 'topics',
  labels: 'labels',
} as const satisfies Record<string, SearchType>

export const COMMAND_FOR: { readonly [T in SearchType]: string } = {
  repositories: 'find', code: 'code', issues: 'issues', commits: 'commits', users: 'users', topics: 'topics', labels: 'labels',
}

export const COMMANDS = [
  ...Object.keys(SEARCH_COMMANDS),
  'next', 'prev', 'page', 'sort', 'ls', 'view', 'open', 'yank',
  'token', 'rate', 'history', 'clear', 'help', 'whoami', 'crt',
]

export const ALIASES: Record<string, string> = {
  f: 'find', search: 'find', repos: 'find', issue: 'issues', commit: 'commits', user: 'users',
  topic: 'topics', label: 'labels', n: 'next', p: 'prev', clone: 'yank', y: 'yank', o: 'open',
  v: 'view', h: 'help', '?': 'help', cls: 'clear', logout: 'exit',
}

const KNOWN = new Set<string>([...COMMANDS, ...Object.keys(ALIASES), 'exit'])

/** The search type a command runs, if it runs one */
export function searchTypeOf(command: string): SearchType | undefined {
  const name = ALIASES[command] ?? command
  return Object.hasOwn(SEARCH_COMMANDS, name) ? SEARCH_COMMANDS[name as keyof typeof SEARCH_COMMANDS] : undefined
}

/**
 * Sort keys as typed in the shell; `best` means GitHub's best-match ranking.
 * The others are the API's own names, except the shorter `help-wanted`.
 */
export const SORT_KEYS: { readonly [T in SearchType]: readonly string[] } = {
  repositories: ['best', 'stars', 'forks', 'updated', 'help-wanted'],
  code: ['best'],
  issues: [
    'best', 'created', 'updated', 'comments', 'interactions', 'reactions', 'reactions-+1', 'reactions--1',
    'reactions-smile', 'reactions-tada', 'reactions-heart', 'reactions-thinking_face',
  ],
  commits: ['best', 'author-date', 'committer-date'],
  users: ['best', 'followers', 'repositories', 'joined'],
  topics: ['best'],
  labels: ['best', 'created', 'updated'],
}

export const PAGE_SIZES = [10, 20, 50, 100] as const

const LANGS = ['rust', 'go', 'typescript', 'javascript', 'python', 'c', 'c++', 'zig']
const COUNTS = ['>100', '>1k', '>5k', '>10k']
const AGES = ['<24h', '<7d', '<30d', '<1y']

type Compiled = { qualifier: string } | { mode: 'semantic' | 'hybrid' } | { repo: string }

interface FlagDef {
  /** Suggested values; a flag without `compile` taking a value is a switch */
  values?: readonly string[]
  takesValue: boolean
  compile: (value: string, now: number) => Compiled
}

const DAYS_PER_UNIT: Record<string, number> = { h: 1 / 24, d: 1, w: 7, m: 30, y: 365 }

/** `<30d` → `>2026-08-29`, i.e. more recent than 30 days ago */
function since(value: string, now: number): string {
  const m = /^<(\d+)([hdwmy])$/.exec(value)
  if (!m) return value
  return `>${new Date(now - Number(m[1]) * DAYS_PER_UNIT[m[2]] * 864e5).toISOString().slice(0, 10)}`
}

/** `>5k` → `>5000` */
function count(value: string): string {
  return value.replace(/(\d+)k/gi, (_, n: string) => String(Number(n) * 1000))
}

const valued = (name: string, transform: (v: string, now: number) => string = (v) => v, values?: readonly string[]): FlagDef => ({
  values,
  takesValue: true,
  compile: (v, now) => ({ qualifier: `${name}:${transform(v, now)}` }),
})
const toggle = (qualifier: string): FlagDef => ({ takesValue: false, compile: () => ({ qualifier }) })
const lower = (v: string) => v.toLowerCase()
/** A value with spaces needs quotes, unless it was typed with them */
const quoted = (v: string) => (/\s/.test(v) && !/^".*"$/.test(v) ? `"${v}"` : v)
const withAliases = (defs: Record<string, FlagDef>, aliases: Record<string, string>) => {
  const out = { ...defs }
  for (const [short, long] of Object.entries(aliases)) out[short] = defs[long]
  return out
}

/** The flags each search command accepts, besides --sort, --order and --limit */
export const FLAGS: { readonly [T in SearchType]: Readonly<Record<string, FlagDef>> } = {
  repositories: withAliases({
    '--lang': valued('language', lower, LANGS),
    '--stars': valued('stars', count, COUNTS),
    '--pushed': valued('pushed', since, AGES),
    '--topic': valued('topic', lower),
    '--user': valued('user'),
    '--no-archived': toggle('archived:false'),
  }, { '-l': '--lang', '-s': '--stars', '-t': '--topic', '-u': '--user' }),
  code: withAliases({
    '--lang': valued('language', lower, LANGS),
    '--repo': valued('repo'),
    '--path': valued('path'),
    '--ext': valued('extension'),
    '--user': valued('user'),
  }, { '-l': '--lang', '-r': '--repo', '-u': '--user' }),
  issues: withAliases({
    '--repo': valued('repo'),
    '--state': valued('is', lower, ['open', 'closed']),
    '--pr': toggle('is:pr'),
    '--issue': toggle('is:issue'),
    '--author': valued('author'),
    '--label': valued('label', quoted),
    '--lang': valued('language', lower, LANGS),
    '--semantic': { takesValue: false, compile: () => ({ mode: 'semantic' }) },
    '--hybrid': { takesValue: false, compile: () => ({ mode: 'hybrid' }) },
  }, { '-r': '--repo', '-a': '--author', '-l': '--lang' }),
  commits: withAliases({
    '--repo': valued('repo'),
    '--author': valued('author'),
    '--committed': valued('committer-date', since, AGES),
    '--user': valued('user'),
  }, { '-r': '--repo', '-a': '--author', '-u': '--user' }),
  users: withAliases({
    '--location': valued('location', quoted),
    '--followers': valued('followers', count, COUNTS),
    '--repos': valued('repos', count, COUNTS),
    '--type': valued('type', lower, ['user', 'org']),
    '--lang': valued('language', lower, LANGS),
  }, { '-l': '--lang' }),
  topics: {
    '--featured': toggle('is:featured'),
    '--curated': toggle('is:curated'),
    '--repos': valued('repositories', count, COUNTS),
  },
  labels: withAliases({
    '--repo': { takesValue: true, compile: (v) => ({ repo: v }) },
  }, { '-r': '--repo' }),
}

const COMMON_FLAGS = ['--sort', '--order', '--limit', '-n', '--page']

/** Qualifiers offered by tab completion */
const QUALIFIERS: { readonly [T in SearchType]: readonly string[] } = {
  repositories: ['language:', 'stars:>', 'pushed:>', 'topic:', 'user:', 'license:', 'archived:false'],
  code: ['language:', 'repo:', 'path:', 'extension:', 'filename:', 'user:'],
  issues: ['repo:', 'is:open', 'is:closed', 'is:pr', 'is:issue', 'author:', 'label:', 'assignee:', 'created:>'],
  commits: ['repo:', 'author:', 'committer-date:>', 'author-date:>', 'user:'],
  users: ['location:', 'followers:>', 'repos:>', 'type:user', 'type:org', 'language:'],
  topics: ['is:featured', 'is:curated', 'repositories:>'],
  labels: [],
}

export const USAGE: { readonly [T in SearchType]: string } = {
  repositories: 'find <terms> [--lang L] [--stars >N] [--pushed <30d] [--sort key]',
  code: 'code <terms> [--lang L] [--repo owner/name] [--path dir] [--ext ts]',
  issues: 'issues <terms> [--repo owner/name] [--state open] [--pr|--issue] [--author U]',
  commits: 'commits <terms> [--repo owner/name] [--author U] [--committed <30d]',
  users: 'users <terms> [--location L] [--followers >N] [--type user|org]',
  topics: 'topics <terms> [--featured] [--curated] [--repos >N]',
  labels: 'labels <owner/name> <terms> [--sort created|updated]',
}

export const EXAMPLES = [
  'find vector database --lang rust --stars >5k',
  'issues memory leak --repo vercel/next.js --state open',
  'users tom --location berlin --followers >100',
  'labels vercel/next.js bug',
]

/**
 * Whitespace-separated words, keeping a quoted phrase in one piece, also as
 * part of a word: `label:"good first issue"` is one
 */
const TOKEN = /(?:[^\s"]+|"[^"]*"?)+/g

export function tokenize(input: string): string[] {
  return input.match(TOKEN) ?? []
}

/** A search as the shell tracks it */
export interface SearchContext {
  type: SearchType
  q: string
  /** One of `SORT_KEYS[type]` */
  sort: string
  order: SearchOrder
  perPage: number
  page: number
  /** Label search looks in this repository ("owner/name") */
  repo?: string
  /** Semantic or hybrid issue search */
  mode?: 'semantic' | 'hybrid'
}

export type AnySearchParams = SearchEndpoints[SearchType]['params']

/** Label search also needs the repository's id, which takes a lookup */
export function toSearchParams(ctx: SearchContext, repositoryId?: number): AnySearchParams {
  const sorted = ctx.sort !== 'best'
  return {
    q: ctx.q,
    // GitHub ignores the order without a sort, so leave both out for best match
    sort: sorted ? (ctx.type === 'repositories' && ctx.sort === 'help-wanted' ? 'help-wanted-issues' : ctx.sort) : undefined,
    order: sorted ? ctx.order : undefined,
    per_page: ctx.perPage,
    page: ctx.page,
    ...(ctx.type === 'labels' ? { repository_id: repositoryId } : {}),
    ...(ctx.mode ? { search_type: ctx.mode } : {}),
  } as AnySearchParams
}

/** The request as GitHub sees it, for echoing in the terminal */
export function describeRequest(ctx: SearchContext): string {
  const { sort, order } = toSearchParams(ctx) as { sort?: string; order?: string }
  return (
    (ctx.type === 'labels' ? `GET /repos/${ctx.repo} → ` : '') +
    `GET /search/${ctx.type}?q=${encodeURIComponent(ctx.q)}` +
    (sort ? `&sort=${sort}&order=${order}` : '') +
    (ctx.mode ? `&search_type=${ctx.mode}` : '') +
    `&per_page=${ctx.perPage}&page=${ctx.page}`
  )
}

/** The page size a search uses unless given `--limit` */
export const DEFAULT_PAGE_SIZE = 10

/** A command that runs this search again, e.g. to put it in a link */
export function toCommand(ctx: SearchContext): string {
  const sorted = ctx.sort !== 'best'
  return [
    COMMAND_FOR[ctx.type],
    ...(ctx.type === 'labels' && ctx.repo ? [ctx.repo] : []),
    ctx.q,
    ...(ctx.mode ? [`--${ctx.mode}`] : []),
    ...(sorted ? ['--sort', ctx.sort] : []),
    ...(sorted && ctx.order === 'asc' ? ['--order', 'asc'] : []),
    ...(ctx.perPage !== DEFAULT_PAGE_SIZE ? ['--limit', String(ctx.perPage)] : []),
    ...(ctx.page > 1 ? ['--page', String(ctx.page)] : []),
  ].join(' ')
}

export function sortLabel(ctx: Pick<SearchContext, 'sort' | 'order'>): string {
  return ctx.sort === 'best' ? 'best match' : `${ctx.sort} ${ctx.order === 'desc' ? '↓' : '↑'}`
}

export function isSortKey(type: SearchType, value: string | undefined): value is string {
  return value !== undefined && SORT_KEYS[type].includes(value)
}

export type ParsedSearch =
  | { error: string }
  | Pick<SearchContext, 'q' | 'repo' | 'mode'> & { sort?: string; order?: SearchOrder; perPage?: number; page?: number }

/** Compiles a search command's arguments into a query with GitHub qualifiers */
export function parseSearch(type: SearchType, args: string[], now: number): ParsedSearch {
  const flags = FLAGS[type]
  const terms: string[] = []
  const qualifiers: string[] = []
  let sort: string | undefined
  let order: SearchOrder | undefined
  let perPage: number | undefined
  let page: number | undefined
  let repo: string | undefined
  let mode: 'semantic' | 'hybrid' | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!/^-{1,2}[a-z]/i.test(arg) || arg.includes(':')) {
      // Label search takes its repository as the first owner/name argument
      if (type === 'labels' && repo === undefined && arg.includes('/')) repo = arg
      // `-language:go` is an exclusion qualifier, not a flag
      else if (/^-?[a-z][\w-]*:/i.test(arg)) qualifiers.push(arg)
      else terms.push(arg)
      continue
    }

    const def = flags[arg]
    if (!def && !COMMON_FLAGS.includes(arg)) return { error: `unknown flag ${arg} (see help)` }
    const value = def && !def.takesValue ? '' : args[++i]
    if (value === undefined) return { error: `${arg} needs a value` }

    if (arg === '--sort') {
      if (!isSortKey(type, value)) return { error: `--sort expects ${SORT_KEYS[type].join('|')}` }
      sort = value
    } else if (arg === '--order') {
      if (value !== 'asc' && value !== 'desc') return { error: '--order expects asc|desc' }
      order = value
    } else if (arg === '--limit' || arg === '-n') {
      const n = Number(value)
      if (!(PAGE_SIZES as readonly number[]).includes(n)) return { error: `--limit expects ${PAGE_SIZES.join('|')}` }
      perPage = n
    } else if (arg === '--page') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) return { error: '--page expects a page number' }
      page = n
    } else {
      const compiled = def.compile(value, now)
      if ('qualifier' in compiled) qualifiers.push(compiled.qualifier)
      else if ('mode' in compiled) mode = compiled.mode
      else repo = compiled.repo
    }
  }

  if (type === 'labels') {
    if (!repo) return { error: 'which repository? e.g. labels vercel/next.js bug' }
    const name = parseRepositoryName(repo)
    if (!name) return { error: `${repo} is not a repository (owner/name)` }
    repo = `${name.owner}/${name.name}`
  }
  if (!terms.length && !qualifiers.length) return { error: 'missing query' }
  return { q: [...terms, ...qualifiers].join(' '), sort, order, perPage, page, repo, mode }
}

/** Syntax highlighting for a command line */
export function highlight(text: string): Seg[] {
  const out: Seg[] = []
  let index = 0
  let inQuote = false
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue
    if (/^\s+$/.test(part)) {
      out.push(seg(part))
      continue
    }
    const i = index++
    if (inQuote || part.startsWith('"')) {
      out.push(seg(part, C.yellow))
      if ((part.match(/"/g) ?? []).length % 2) inQuote = !inQuote
    } else if (i === 0) {
      out.push(seg(part, KNOWN.has(part) ? C.green : C.red, { bold: true }))
    } else if (/^-{1,2}[a-z]/i.test(part) && !part.includes(':')) {
      out.push(seg(part, C.cyan))
    } else {
      const m = /^(-?[a-z][\w-]*:)(.*)$/i.exec(part)
      if (m) out.push(seg(m[1], C.amber), seg(m[2], C.white))
      else out.push(seg(part, /^[<>=\d]/.test(part) ? C.white : C.fg))
    }
  }
  return out
}

export interface CompletionContext {
  /** Result numbers on screen, for `open`/`view`/`yank` */
  ranks: string[]
  /** The type `sort` would re-sort */
  sortType: SearchType | undefined
}

/** Tab-completion candidates for the word before the caret */
export function completionCandidates(before: string, { ranks, sortType }: CompletionContext): { word: string; candidates: string[] } {
  const words = before.split(/\s+/)
  const word = words[words.length - 1]
  const prev = words.length > 1 ? words[words.length - 2] : undefined
  const command = ALIASES[words[0]] ?? words[0]
  const type = searchTypeOf(command)

  let candidates: readonly string[] = []
  if (words.length === 1) candidates = COMMANDS
  else if (type && word.startsWith('-')) {
    candidates = [...Object.keys(FLAGS[type]), ...COMMON_FLAGS].filter((f) => f.startsWith('--'))
  } else if (type && prev === '--sort') candidates = SORT_KEYS[type]
  else if (type && prev === '--order') candidates = ['asc', 'desc']
  else if (type && (prev === '--limit' || prev === '-n')) candidates = PAGE_SIZES.map(String)
  else if (type && prev === '--page') candidates = []
  else if (type && prev && FLAGS[type][prev]?.takesValue) candidates = FLAGS[type][prev].values ?? []
  else if (command === 'sort' && words.length === 2) candidates = sortType ? SORT_KEYS[sortType] : []
  else if (command === 'sort' && words.length === 3) candidates = ['asc', 'desc']
  else if (command === 'token' && words.length === 2) candidates = ['set', 'rm']
  else if (command === 'crt' && words.length === 2) candidates = ['on', 'off']
  else if (command === 'help') candidates = COMMANDS
  else if (['open', 'view', 'yank'].includes(command)) candidates = ranks
  else if (type && /^language:/i.test(word)) candidates = LANGS.map((l) => `language:${l}`)
  else if (type) candidates = QUALIFIERS[type]

  return { word, candidates: candidates.filter((c) => c.startsWith(word)) }
}

/** Completions that end mid-token (`language:`, `stars:>`) don't get a trailing space */
export function completionSuffix(candidate: string): string {
  return /[:>]$/.test(candidate) ? '' : ' '
}

export function commonPrefix(words: string[]): string {
  let prefix = words[0] ?? ''
  for (const w of words) while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1)
  return prefix
}

export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}

export function suggestCommand(typed: string): string | undefined {
  return COMMANDS.find((c) => levenshtein(c, typed) <= 2)
}

/** Enough of a token to recognise it, not enough to use it */
export function maskSecret(token: string): string {
  return `••••${token.slice(-4)}`
}

/** Keeps a token out of the scrollback and history */
export function maskToken(text: string): string {
  return text.replace(/(token\s+set\s+)(\S+)/, (_, head: string, token: string) => head + maskSecret(token))
}

export function looksLikeToken(token: string): boolean {
  return /^(ghp_|github_pat_|gho_)/.test(token)
}

/** 49234 → "49.2k" */
export function formatShort(n: number): string {
  return formatCount(n).toLowerCase()
}

/** "3h ago", "12d ago", or the date once it's a month old */
export function formatAgo(iso: string, now: number): string {
  const days = (now - Date.parse(iso)) / 864e5
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h ago`
  if (days < 30) return `${Math.round(days)}d ago`
  return iso.slice(0, 10)
}

/** Repository size, which GitHub reports in KB */
export function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`
  if (kb < 1024 * 1024) return `${Math.round(kb / 1024)} MB`
  return `${(kb / 1024 / 1024).toFixed(1)} GB`
}

export function pad(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s + ' '.repeat(n - s.length)
}

export function padStart(s: string, n: number): string {
  return ' '.repeat(Math.max(0, n - s.length)) + s
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** "0:42" until a time */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
