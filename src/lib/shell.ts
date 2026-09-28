import type { RepositorySearchParams, RepositorySearchSort, SearchOrder } from '../types/github'
import { formatCount } from './format'

// Phosphor palette of the ghs terminal
export const C = {
  bg: '#070a08',
  fg: '#cfe8d6',
  green: '#4dff9a',
  dim: '#5c7a66',
  faint: '#35503f',
  amber: '#ffb547',
  cyan: '#7fd1ff',
  desc: '#9db8a6',
  red: '#ff6b6b',
  white: '#eafff1',
  yellow: '#ffe38a',
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
}

export function seg(t: string, c: string = C.fg, options: Omit<Seg, 't' | 'c'> = {}): Seg {
  return { t, c, ...options }
}

export function line(segs: Seg[], options: Omit<Line, 'segs'> = {}): Line {
  return { segs, ...options }
}

export const COMMANDS = [
  'find', 'next', 'prev', 'page', 'sort', 'ls', 'view', 'open', 'yank',
  'token', 'rate', 'history', 'clear', 'help', 'whoami',
] as const

export const ALIASES: Record<string, string> = {
  f: 'find', search: 'find', n: 'next', p: 'prev', clone: 'yank', y: 'yank',
  o: 'open', v: 'view', h: 'help', '?': 'help', cls: 'clear', logout: 'exit',
}

const KNOWN = new Set<string>([...COMMANDS, ...Object.keys(ALIASES), 'exit'])

/** Sort keys as typed in the shell; `best` means GitHub's best-match ranking */
export const SORT_KEYS = ['best', 'stars', 'forks', 'updated', 'help-wanted'] as const
export type SortKey = (typeof SORT_KEYS)[number]

const API_SORT: Record<Exclude<SortKey, 'best'>, RepositorySearchSort> = {
  stars: 'stars',
  forks: 'forks',
  updated: 'updated',
  'help-wanted': 'help-wanted-issues',
}

export const PAGE_SIZES = [10, 20, 50, 100] as const

const LANGS = ['rust', 'go', 'typescript', 'javascript', 'python', 'c', 'c++', 'zig']
const FLAGS: Record<string, 'value' | 'bool'> = {
  '--lang': 'value', '-l': 'value', '--stars': 'value', '-s': 'value', '--pushed': 'value',
  '--topic': 'value', '-t': 'value', '--user': 'value', '-u': 'value', '--sort': 'value',
  '--order': 'value', '--limit': 'value', '-n': 'value', '--no-archived': 'bool',
}
const STAR_VALUES = ['>100', '>1k', '>5k', '>10k']
const LIMIT_VALUES = PAGE_SIZES.map(String)
const FLAG_VALUES: Record<string, readonly string[]> = {
  '--lang': LANGS, '-l': LANGS, '--sort': SORT_KEYS, '--order': ['asc', 'desc'],
  '--limit': LIMIT_VALUES, '-n': LIMIT_VALUES, '--pushed': ['<24h', '<7d', '<30d', '<1y'],
  '--stars': STAR_VALUES, '-s': STAR_VALUES,
}
const QUALIFIERS = ['language:', 'stars:>', 'pushed:>', 'topic:', 'user:', 'license:', 'archived:false']

export const EXAMPLES = [
  'find vector database --lang rust --stars >5k',
  'find terminal emulator --sort stars',
  'find react --pushed <30d',
  'find llm --stars >10k --sort updated',
]

/** Whitespace-separated words, keeping a quoted phrase in one piece */
const TOKEN = /"[^"]*"?|\S+/g

export function tokenize(input: string): string[] {
  return input.match(TOKEN) ?? []
}

/** A repository search as the shell tracks it */
export interface SearchContext {
  q: string
  sort: SortKey
  order: SearchOrder
  perPage: number
  page: number
}

export function toSearchParams(ctx: SearchContext): RepositorySearchParams {
  return {
    q: ctx.q,
    // GitHub ignores the order without a sort, so leave both out for best match
    sort: ctx.sort === 'best' ? undefined : API_SORT[ctx.sort],
    order: ctx.sort === 'best' ? undefined : ctx.order,
    per_page: ctx.perPage,
    page: ctx.page,
  }
}

/** The request as GitHub sees it, for echoing in the terminal */
export function describeRequest(ctx: SearchContext): string {
  const { sort, order } = toSearchParams(ctx)
  return (
    `GET /search/repositories?q=${encodeURIComponent(ctx.q)}` +
    (sort ? `&sort=${sort}&order=${order}` : '') +
    `&per_page=${ctx.perPage}&page=${ctx.page}`
  )
}

export function sortLabel(ctx: Pick<SearchContext, 'sort' | 'order'>): string {
  return ctx.sort === 'best' ? 'best match' : `${ctx.sort} ${ctx.order === 'desc' ? '↓' : '↑'}`
}

export type FindResult =
  | { error: string }
  | { q: string; sort?: SortKey; order?: SearchOrder; perPage?: number }

const DAYS_PER_UNIT: Record<string, number> = { h: 1 / 24, d: 1, w: 7, m: 30, y: 365 }

/** Compiles `find` arguments into a query with GitHub qualifiers */
export function parseFind(args: string[], now: number): FindResult {
  const terms: string[] = []
  const qualifiers: string[] = []
  let sort: SortKey | undefined
  let order: SearchOrder | undefined
  let perPage: number | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!/^-{1,2}[a-z]/i.test(arg) || arg.includes(':')) {
      // `-language:go` is an exclusion qualifier, not a flag
      if (/^-?[a-z][\w-]*:/i.test(arg)) qualifiers.push(arg)
      else terms.push(arg)
      continue
    }

    const kind = FLAGS[arg]
    if (!kind) return { error: `unknown flag ${arg} (see help)` }
    if (kind === 'bool') {
      qualifiers.push('archived:false')
      continue
    }
    const value = args[++i]
    if (value === undefined) return { error: `${arg} needs a value` }

    switch (arg) {
      case '--lang':
      case '-l':
        qualifiers.push(`language:${value.toLowerCase()}`)
        break
      case '--stars':
      case '-s':
        qualifiers.push(`stars:${value.replace(/(\d+)k/gi, (_, n: string) => String(Number(n) * 1000))}`)
        break
      case '--pushed': {
        const m = /^<(\d+)([hdwmy])$/.exec(value)
        if (m) {
          const since = new Date(now - Number(m[1]) * DAYS_PER_UNIT[m[2]] * 864e5)
          qualifiers.push(`pushed:>${since.toISOString().slice(0, 10)}`)
        } else {
          qualifiers.push(`pushed:${value}`)
        }
        break
      }
      case '--topic':
      case '-t':
        qualifiers.push(`topic:${value.toLowerCase()}`)
        break
      case '--user':
      case '-u':
        qualifiers.push(`user:${value}`)
        break
      case '--sort':
        if (!isSortKey(value)) return { error: `--sort expects ${SORT_KEYS.join('|')}` }
        sort = value
        break
      case '--order':
        if (value !== 'asc' && value !== 'desc') return { error: '--order expects asc|desc' }
        order = value
        break
      default: {
        const n = Number(value)
        if (!(PAGE_SIZES as readonly number[]).includes(n)) {
          return { error: `--limit expects ${PAGE_SIZES.join('|')}` }
        }
        perPage = n
      }
    }
  }

  if (!terms.length && !qualifiers.length) return { error: 'missing query' }
  return { q: [...terms, ...qualifiers].join(' '), sort, order, perPage }
}

export function isSortKey(value: string | undefined): value is SortKey {
  return (SORT_KEYS as readonly (string | undefined)[]).includes(value)
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

/**
 * Tab-completion candidates for the word before the caret. `ranks` are the
 * result numbers on screen, for `open`/`view`/`yank`.
 */
export function completionCandidates(before: string, ranks: string[]): { word: string; candidates: string[] } {
  const words = before.split(/\s+/)
  const word = words[words.length - 1]
  const prev = words.length > 1 ? words[words.length - 2] : undefined
  const command = ALIASES[words[0]] ?? words[0]

  let candidates: readonly string[]
  if (words.length === 1) candidates = COMMANDS
  else if (word.startsWith('-')) candidates = Object.keys(FLAGS).filter((f) => f.startsWith('--'))
  else if (prev !== undefined && FLAG_VALUES[prev]) candidates = FLAG_VALUES[prev]
  else if (command === 'sort' && words.length === 2) candidates = SORT_KEYS
  else if (command === 'sort' && words.length === 3) candidates = ['asc', 'desc']
  else if (command === 'token' && words.length === 2) candidates = ['set', 'rm']
  else if (command === 'help') candidates = COMMANDS
  else if (['open', 'view', 'yank'].includes(command)) candidates = ranks
  else if (/^language:/i.test(word)) candidates = LANGS.map((l) => `language:${l}`)
  else candidates = QUALIFIERS

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
