import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { effectiveToken, getRepository, GitHubApiError, SEARCH_MAX_RESULTS, searchGitHub, searchResource } from '../api/github'
import { getCachedSearch, searchCacheKey, setCachedSearch } from '../api/searchCache'
import { setGitHubToken, useGitHubToken } from '../hooks/useGitHubToken'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useSearchQuota } from '../hooks/useSearchQuota'
import { formatNumber } from '../lib/format'
import { getTotalPages } from '../lib/pagination'
import { parseRepositoryName } from '../lib/repositoryName'
import { validateSearchQuery } from '../lib/searchQuery'
import { SEARCH_TYPE_INFO } from '../lib/searchTypes'
import {
  ALIASES,
  C,
  COMMAND_FOR,
  commonPrefix,
  completionCandidates,
  completionSuffix,
  DEFAULT_PAGE_SIZE,
  EXAMPLES,
  FLAGS,
  formatCountdown,
  highlight,
  isSortKey,
  line,
  looksLikeToken,
  maskSecret,
  maskToken,
  padStart,
  parseSearch,
  searchTypeOf,
  seg,
  SORT_KEYS,
  sortLabel,
  suggestCommand,
  toCommand,
  toSearchParams,
  tokenize,
  USAGE,
  type Line,
  type SearchContext,
  type Seg,
  type ShellAction,
} from '../lib/shell'
import {
  capHint,
  commandLine,
  errorLine,
  helpLines,
  motdLines,
  pageOffset,
  searchLines,
  totalPages,
  type Entry,
  type Layout,
  type SearchEntry,
} from '../lib/shellOutput'
import { describeResult, type AnySearchResponse, type ResultView } from '../lib/shellResults'
import { commandFromUrl, loadCrt, loadHistory, saveCrt, saveHistory, urlWithCommand } from '../lib/shellSession'

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'
/** Lines of output typed out per millisecond, roughly */
const TYPE_MS_PER_LINE = 11
const TYPE_OUT_MS = 3200
const MAX_ENTRIES = 60
const MAX_HISTORY = 50

type PickAction = 'up' | 'down' | 'open' | 'yank' | 'next' | 'prev' | 'quit'
/**
 * Which keys pick mode takes from the prompt. It comes up by itself when
 * results land, so at first it only takes the arrows and esc, and letters
 * still reach the prompt. Moving or clicking a result lets ↵ open it, and esc
 * hands over the letter keys too.
 */
type PickKeys = 'arrows' | 'enter' | 'all'
type Key = 'enter' | 'tab' | 'up' | 'down' | 'esc' | 'ctrlc' | 'ctrll' | `ins:${string}` | `pick:${PickAction}`

interface ShellState {
  entries: Entry[]
  input: string
  caret: number
  history: string[]
  /** Position while browsing history with ↑↓, null when not browsing */
  historyIndex: number | null
  /** What was typed before browsing history */
  draft: string
  /** fzf-style navigation of the live results */
  pick: boolean
  pickKeys: PickKeys
  sel: number
  /** The search the prompt acts on */
  liveId: number | null
  ctx: SearchContext | null
  focused: boolean
  yanked: boolean
  animateUntil: number
}

const PICK_KEYS: Record<string, PickAction> = {
  j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', Enter: 'open', o: 'open',
  y: 'yank', n: 'next', p: 'prev', q: 'quit', Escape: 'quit',
}

/** Whether pick mode at this level takes the key, rather than the prompt */
function pickTakes(level: PickKeys, key: string): boolean {
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Escape') return true
  if (key === 'Enter') return level !== 'arrows'
  return level === 'all'
}

/** Choosing a result lets ↵ open it, without taking back the letter keys */
function withEnter(level: PickKeys): PickKeys {
  return level === 'all' ? 'all' : 'enter'
}

/** dowse: a shell for GitHub search */
export function Terminal() {
  // A saved token takes over from the build-time one
  const savedToken = useGitHubToken() ?? undefined
  const hasToken = effectiveToken(savedToken) !== undefined
  const desktop = useMediaQuery('(min-width: 1200px)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const layout: Layout = desktop ? 'd' : 'm'

  const [s, setS] = useState<ShellState>(() => ({
    entries: [{ kind: 'motd', id: 0, at: Date.now() }],
    input: '',
    caret: 0,
    history: loadHistory(MAX_HISTORY),
    historyIndex: null,
    draft: '',
    pick: false,
    pickKeys: 'arrows',
    sel: 0,
    liveId: null,
    ctx: null,
    focused: false,
    yanked: false,
    animateUntil: Date.now() + TYPE_OUT_MS,
  }))
  const [now, setNow] = useState(() => Date.now())
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [crt, setCrt] = useState(loadCrt)

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const requests = useRef(new Set<AbortController>())
  const yankTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const live = s.entries.find((e): e is SearchEntry => e.kind === 'search' && e.id === s.liveId)
  // Code and semantic issue search count against limits of their own
  const resource = s.ctx ? searchResource(s.ctx.type, toSearchParams(s.ctx)) : 'search'
  const quota = useSearchQuota(resource, savedToken)
  const limit = quota?.limit ?? (hasToken && resource === 'search' ? 30 : 10)
  const remaining = live?.status === 'limited' ? 0 : (quota?.remaining ?? limit)
  const items = (live?.status === 'done' && live.data?.items) || []
  const selIndex = Math.min(s.sel, items.length - 1)
  const selected: ResultView | undefined = live && items.length ? describeResult(live.ctx, items[selIndex], now) : undefined
  const selectedRank = live && selected ? pageOffset(live.ctx) + selIndex + 1 : 0
  const pickOn = s.pick && items.length > 0

  // Ticks fast while output is typing out or a spinner runs, otherwise once a
  // second for the clock and countdowns
  const busy = now < s.animateUntil || s.entries.some((e) => e.kind === 'search' && e.status === 'loading')
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), busy && !reducedMotion ? 40 : 1000)
    return () => clearInterval(timer)
  }, [busy, reducedMotion])

  useEffect(() => {
    const pending = requests.current
    return () => {
      pending.forEach((controller) => controller.abort())
      clearTimeout(yankTimer.current)
    }
  }, [])

  useEffect(() => {
    if (desktop) inputRef.current?.focus({ preventScroll: true })
  }, [desktop])

  useEffect(() => saveHistory(s.history), [s.history])

  // Keep the real input's caret where the drawn one is
  useLayoutEffect(() => {
    const el = inputRef.current
    if (el && document.activeElement === el && el.selectionStart !== s.caret) el.setSelectionRange(s.caret, s.caret)
  }, [s.caret, s.input])

  function newId() {
    return nextId.current++
  }

  function settle(id: number, patch: Partial<SearchEntry>) {
    const at = Date.now()
    setS((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === id && e.kind === 'search' ? { ...e, ...patch, at } : e)),
      animateUntil: at + TYPE_OUT_MS,
      // Land in pick mode once results arrive, unless the user is typing
      ...(prev.liveId === id ? { pick: patch.status === 'done' && prev.input === '', sel: 0 } : {}),
    }))
    setNow(at)
  }

  async function fetchResults(ctx: SearchContext, signal: AbortSignal): Promise<{ data: AnySearchResponse; cached: boolean }> {
    let repositoryId: number | undefined
    if (ctx.type === 'labels') {
      // Label search takes the repository's id; the lookup is cached
      const name = parseRepositoryName(ctx.repo ?? '')!
      repositoryId = (await getRepository(name.owner, name.name, { token: savedToken, signal })).id
    }
    const params = toSearchParams(ctx, repositoryId)
    const options = { token: savedToken, textMatch: SEARCH_TYPE_INFO[ctx.type].textMatch }
    const key = searchCacheKey(ctx.type, params, options)
    const cached = getCachedSearch<AnySearchResponse>(key)
    if (cached) return { data: cached, cached: true }
    const data = await searchGitHub(ctx.type, params, { ...options, signal })
    setCachedSearch(key, data)
    return { data, cached: false }
  }

  function runSearch(id: number, ctx: SearchContext) {
    settle(id, { status: 'loading' })
    const controller = new AbortController()
    requests.current.add(controller)
    const started = performance.now()
    fetchResults(ctx, controller.signal)
      .then(({ data, cached }) => {
        settle(id, { status: 'done', data, cached, ms: Math.round(performance.now() - started) })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof GitHubApiError && error.rateLimit) {
          settle(id, { status: 'limited', error, resetAt: error.rateLimit.resetAt.getTime() })
        } else {
          settle(id, { status: 'error', error: error instanceof Error ? error : new Error(String(error)) })
        }
      })
      .finally(() => requests.current.delete(controller))
  }

  // A rate limited search on screen is retried as soon as the limit resets
  const retry = useEffectEvent((entry: SearchEntry) => runSearch(entry.id, entry.ctx))
  const limitedEntry = live?.status === 'limited' ? live : undefined
  useEffect(() => {
    if (!limitedEntry?.resetAt) return
    const timer = setTimeout(() => retry(limitedEntry), limitedEntry.resetAt - Date.now() + 1000)
    return () => clearTimeout(timer)
  }, [limitedEntry])

  function setInput(input: string, keepHistory = false) {
    setS((prev) => ({ ...prev, input, caret: input.length, historyIndex: keepHistory ? prev.historyIndex : null }))
  }

  function fill(text: string) {
    setInput(text)
    inputRef.current?.focus({ preventScroll: true })
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {})
    setS((prev) => ({ ...prev, yanked: true }))
    clearTimeout(yankTimer.current)
    yankTimer.current = setTimeout(() => setS((prev) => ({ ...prev, yanked: false })), 1300)
  }

  function append(entries: Entry[], patch: Partial<ShellState> = {}) {
    const at = Date.now()
    setS((prev) => ({ ...prev, entries: [...prev.entries, ...entries].slice(-MAX_ENTRIES), animateUntil: at + TYPE_OUT_MS, ...patch }))
    setNow(at)
  }

  /** `pickKeys` carries pick mode's keys over, for commands pick mode itself runs */
  /** Returns whether the command started a search */
  function exec(raw: string, pickKeys: PickKeys = 'arrows'): boolean {
    const at = Date.now()
    const text = raw.trim()
    const out: Entry[] = [{ kind: 'cmd', id: newId(), text: maskToken(raw), at }]
    const masked = maskToken(text)
    const history = text && s.history.at(-1) !== masked ? [...s.history, masked].slice(-MAX_HISTORY) : s.history
    const patch: Partial<ShellState> = { history, historyIndex: null, pick: false, pickKeys }
    let launch: SearchEntry | null = null

    const print = (lines: Line[], mobile?: Line[]) => out.push({ kind: 'lines', id: newId(), lines, mobile, at })
    const fail = (message: string) => print([errorLine(message)])
    const usage = (u: string) => print([line([seg('usage: ', C.dim), ...highlight(u)])])
    const search = (ctx: SearchContext, done?: SearchEntry) => {
      launch = done
        ? { ...done, id: newId(), ctx, at, cached: true }
        : { kind: 'search', id: newId(), ctx, at, status: 'loading', cached: false, ms: 0 }
      out.push(launch)
      patch.ctx = ctx
      patch.liveId = launch.id
      patch.sel = 0
    }
    // The results on screen, for commands that act on them
    const onScreen = (): SearchEntry | null => {
      if (live?.status === 'done' && live.data) return live
      fail(
        live?.status === 'loading'
          ? 'wait for the current search to finish'
          : live?.status === 'limited'
            ? 'rate limited — the search runs again once the limit resets'
            : live?.status === 'error'
              ? 'the last search failed — run a search first'
              : 'no results on screen — run a search first',
      )
      return null
    }
    const pickItem = (arg: string | undefined) => {
      const entry = onScreen()
      if (!entry?.data?.items.length) {
        if (entry) fail('no results on screen')
        return null
      }
      const list = entry.data.items
      const offset = pageOffset(entry.ctx)
      const index = arg === undefined ? Math.min(s.sel, list.length - 1) : parseInt(arg, 10) - offset - 1
      if (!(index >= 0 && index < list.length)) {
        fail(`#${arg} is not on this page (${offset + 1}–${offset + list.length})`)
        return null
      }
      return { view: describeResult(entry.ctx, list[index], at), index }
    }

    if (text) {
      const [first, ...args] = tokenize(text)
      const command = ALIASES[first] ?? first
      const type = searchTypeOf(command)
      if (type) {
        const parsed = parseSearch(type, args, at)
        const invalid = 'error' in parsed ? parsed.error : validateSearchQuery(parsed.q, type)?.message
        if (invalid || 'error' in parsed) {
          fail(`${command}: ${invalid}`)
          usage(USAGE[type])
        } else {
          const perPage = parsed.perPage ?? s.ctx?.perPage ?? DEFAULT_PAGE_SIZE
          const lastPage = getTotalPages(SEARCH_MAX_RESULTS, perPage)
          if ((parsed.page ?? 1) > lastPage) {
            fail(`${command}: github serves only the first ${formatNumber(SEARCH_MAX_RESULTS)} results, so at most --page ${lastPage} with --limit ${perPage}`)
          } else {
            search({
              type,
              q: parsed.q,
              sort: parsed.sort ?? 'best',
              order: parsed.order ?? 'desc',
              perPage,
              page: parsed.page ?? 1,
              repo: parsed.repo,
              mode: parsed.mode,
            })
          }
        }
      } else {
        switch (command) {
          case 'next':
          case 'prev':
          case 'page': {
            const entry = onScreen()
            if (!entry) break
            const pages = totalPages(entry)
            const page = command === 'page' ? parseInt(args[0], 10) : entry.ctx.page + (command === 'next' ? 1 : -1)
            if (!(page >= 1 && page <= pages)) {
              fail(
                command === 'page'
                  ? `page: expected 1–${pages}`
                  : `${command}: already on the ${page < 1 ? 'first' : 'last'} page (${entry.ctx.page}/${pages})`,
              )
              if (page > pages && (entry.data?.total_count ?? 0) > pages * entry.ctx.perPage) {
                out.push({ kind: 'lines', id: newId(), at, lines: [capHint('  github returns only the first 1,000 results — narrow with ', entry.ctx)] })
              }
              break
            }
            search({ ...entry.ctx, page })
            break
          }
          case 'sort': {
            if (!s.ctx) {
              fail('no previous search — run a search first')
              break
            }
            const keys = SORT_KEYS[s.ctx.type]
            const [key, order = 'desc'] = args
            if (keys.length === 1) fail(`sort: ${SEARCH_TYPE_INFO[s.ctx.type].singular} search can only be ordered by best match`)
            else if (!isSortKey(s.ctx.type, key)) fail(`sort: expected ${keys.join(' | ')}`)
            else if (order !== 'asc' && order !== 'desc') fail('sort: order must be asc|desc')
            else search({ ...s.ctx, sort: key, order, page: 1 })
            break
          }
          case 'ls': {
            const entry = onScreen()
            if (entry) search(entry.ctx, entry)
            break
          }
          case 'view':
          case 'open':
          case 'yank': {
            const picked = pickItem(args[0])
            if (!picked) break
            const { view, index } = picked
            patch.sel = index
            patch.pick = true
            patch.pickKeys = withEnter(pickKeys)
            const name = view.prefix + view.title.trim()
            if (command === 'view') {
              print([line([seg('→ ', C.green), seg('previewing ', C.desc), seg(name, C.green, { bold: true })])])
            } else if (command === 'open') {
              window.open(view.url, '_blank', 'noopener')
              print([line([seg('↗ ', C.green), seg('opening ', C.desc), seg(view.url, C.cyan, { underline: true })])])
            } else {
              copy(view.yank.text)
              print(
                view.yank.shell
                  ? [
                      line([seg('$ ', C.dim), seg(view.yank.shell, C.white)]),
                      line([seg('  copied to clipboard — paste into your real shell', C.dim)]),
                    ]
                  : [line([seg(`copied ${view.yank.label} `, C.dim), seg(view.yank.text, C.white)])],
              )
            }
            break
          }
          case 'token': {
            if (args[0] === 'set') {
              const token = args[1]
              if (!token) fail('token set: missing token')
              else if (!looksLikeToken(token)) fail("token: that doesn't look like a GitHub token (ghp_… or github_pat_…)")
              else {
                setGitHubToken(token)
                print([
                  line([seg('[ ok ] ', C.green), seg(`token ${maskSecret(token)} saved in this browser · limit 30/min`, C.desc)]),
                  line([seg('[info] ', C.cyan), seg("sent only to api.github.com. don't use a token with write access.", C.desc)]),
                ])
              }
              break
            }
            if (args[0] === 'rm') {
              if (!savedToken) fail('token: none saved')
              else {
                setGitHubToken(null)
                print([line([seg('[ ok ] ', C.green), seg(`token removed${hasBuildToken() ? ' · using the build-time token' : ' · limit 10/min'}`, C.desc)])])
              }
              break
            }
            print(
              hasToken
                ? [line([
                    seg('token ', C.dim),
                    seg(savedToken ? maskSecret(savedToken) : 'from build', C.white),
                    seg(' · 30 searches/min', C.dim),
                    ...(savedToken ? [seg(' · ', C.dim), seg('token rm', C.green, { action: { type: 'fill', text: 'token rm' } })] : []),
                  ])]
                : [
                    line([seg('no token · 10 searches/min · no code or semantic issue search', C.amber)]),
                    line([
                      seg('  create a fine-grained token with no extra permissions: ', C.dim),
                      seg(NEW_TOKEN_URL.replace('https://', ''), C.cyan, { underline: true, action: { type: 'openUrl', url: NEW_TOKEN_URL } }),
                    ]),
                    line([seg('  then ', C.dim), seg('token set <pat>', C.green, { action: { type: 'fill', text: 'token set ' } })]),
                  ],
            )
            break
          }
          case 'rate': {
            const filled = Math.round((remaining / limit) * 20)
            print([
              line([
                seg('quota  ', C.dim),
                seg('█'.repeat(filled), remaining ? C.green : C.red),
                seg('░'.repeat(20 - filled), C.faint),
                seg(`  ${remaining}/${limit} left${quota ? ` · resets in ${formatCountdown(quota.resetAt.getTime() - at)}` : ''}`, C.desc),
              ]),
              line([seg('limit  ', C.dim), seg(`${limit}/min · ${resource.replace('_', ' ')} · ${hasToken ? 'token' : 'anonymous'}`, C.desc)]),
            ])
            break
          }
          case 'history':
            print(
              history.length
                ? history.map((h, i) =>
                    line([
                      seg(`${padStart(String(i + 1), 4)}  `, C.dim),
                      ...highlight(h).map((x) => ({ ...x, action: { type: 'fill' as const, text: h } })),
                    ]),
                  )
                : [line([seg('(empty)', C.dim)])],
            )
            break
          case 'whoami':
            print([
              hasToken
                ? line([seg('authenticated via token', C.desc), seg(` · ${limit} searches/min`, C.desc)])
                : line([seg('guest', C.white), seg(` (anonymous) · ${limit} searches/min`, C.desc)]),
            ])
            break
          case 'help': {
            const topic = args[0] && searchTypeOf(args[0])
            if (topic) {
              const flags = Object.keys(FLAGS[topic]).filter((f) => f.startsWith('--'))
              print([
                line([seg(SEARCH_TYPE_INFO[topic].label, C.white, { bold: true }), seg(` — ${COMMAND_FOR[topic]}`, C.dim)]),
                line([seg('usage: ', C.dim), ...highlight(USAGE[topic])]),
                line([seg('flags: ', C.dim), seg([...flags, '--sort', '--order', '--limit', '--page'].join(' '), C.cyan)]),
                line([seg('sort:  ', C.dim), seg(SORT_KEYS[topic].join(' · '), C.desc)]),
                line([seg('e.g.   ', C.dim), ...highlight(SEARCH_TYPE_INFO[topic].placeholder.replace(/^.*e\.g\. /, `${COMMAND_FOR[topic]} ${topic === 'labels' ? 'vercel/next.js ' : ''}`))]),
              ])
              break
            }
            const help = helpLines()
            print(help.lines, help.mobile)
            break
          }
          case 'crt': {
            const [value] = args
            if (value !== undefined && value !== 'on' && value !== 'off') {
              usage('crt [on | off]')
              break
            }
            const on = value === undefined ? crt : value === 'on'
            if (on !== crt) {
              setCrt(on)
              saveCrt(on)
            }
            print([line([
              seg('crt ', C.dim),
              seg(on ? 'on' : 'off', C.white),
              seg(on ? ' · scanlines and glow · ' : ' · plain text · ', C.dim),
              seg(`crt ${on ? 'off' : 'on'}`, C.green, { action: { type: 'run', command: `crt ${on ? 'off' : 'on'}` } }),
            ])])
            break
          }
          case 'clear':
            setS((prev) => ({ ...prev, ...patch, entries: [] }))
            return false
          case 'exit':
            print([line([
              seg('logout: this shell is the product. try ', C.dim),
              seg('clear', C.green, { action: { type: 'run', command: 'clear' } }),
              seg(' instead.', C.dim),
            ])])
            break
          default: {
            fail(`command not found: ${first}`)
            const suggestion = suggestCommand(first)
            if (suggestion) {
              print([line([
                seg('  did you mean ', C.dim),
                seg(suggestion, C.green, { bold: true, action: { type: 'fill', text: `${suggestion} ` } }),
                seg('?', C.dim),
              ])])
            }
          }
        }
      }
    }

    append(out, patch)
    // Satisfies TypeScript's narrowing, which can't see the assignment in `search`
    const launched = launch as SearchEntry | null
    if (launched?.status === 'loading') runSearch(launched.id, launched.ctx)
    else if (launched) setS((prev) => ({ ...prev, pick: true }))
    return launched !== null
  }

  // The search on screen goes in the URL, so it can be shared and bookmarked,
  // and back and forward return to earlier ones. A search the URL started
  // replaces its entry instead of adding another.
  const urlMode = useRef<'push' | 'replace'>('push')
  useEffect(() => {
    if (!s.ctx) return
    const command = toCommand(s.ctx)
    const mode = urlMode.current
    urlMode.current = 'push'
    if (commandFromUrl(window.location.search) === command) return
    const url = urlWithCommand(window.location, command)
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }, [s.ctx])

  const runFromUrl = useEffectEvent((command: string | null) => {
    if (!command) return
    urlMode.current = 'replace'
    if (!exec(command)) urlMode.current = 'push'
  })
  useEffect(() => {
    const onPopState = () => runFromUrl(commandFromUrl(window.location.search))
    // Read now: by the time the timer fires, a search typed meanwhile may have
    // changed the URL. Deferred, so StrictMode's mount, unmount and mount runs it once.
    const initial = commandFromUrl(window.location.search)
    const timer = setTimeout(() => runFromUrl(initial))
    window.addEventListener('popstate', onPopState)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  function run(command: string) {
    setInput('')
    exec(command)
  }

  function complete() {
    const before = s.input.slice(0, s.caret)
    const after = s.input.slice(s.caret)
    const offset = live ? pageOffset(live.ctx) : 0
    const ranks = items.map((_, i) => String(offset + i + 1))
    const { word, candidates } = completionCandidates(before, { ranks, sortType: s.ctx?.type })
    if (!candidates.length) return

    const replaced = (w: string) => before.slice(0, before.length - word.length) + w
    const put = (w: string) => {
      const head = replaced(w)
      setS((prev) => ({ ...prev, input: head + after, caret: head.length }))
    }
    if (candidates.length === 1) return put(candidates[0] + completionSuffix(candidates[0]))
    const prefix = commonPrefix(candidates)
    if (prefix.length > word.length) return put(prefix)

    const at = Date.now()
    append([
      { kind: 'cmd', id: newId(), text: s.input, at },
      {
        kind: 'lines',
        id: newId(),
        at,
        lines: [line(candidates.map((c) => seg(`${c}   `, C.cyan, { action: { type: 'fill', text: replaced(c + completionSuffix(c)) + after } })))],
      },
    ])
  }

  function browseHistory(step: number) {
    const { history } = s
    if (!history.length) return
    const draft = s.historyIndex === null ? s.input : s.draft
    const index = Math.max(0, Math.min(history.length, (s.historyIndex ?? history.length) + step))
    const input = index === history.length ? draft : history[index]
    setS((prev) => ({ ...prev, draft, historyIndex: index === history.length ? null : index, input, caret: input.length }))
  }

  function pickAct(action: PickAction) {
    if (!items.length) return setS((prev) => ({ ...prev, pick: false }))
    if (action === 'down') setS((prev) => ({ ...prev, sel: Math.min(items.length - 1, prev.sel + 1), pickKeys: withEnter(prev.pickKeys) }))
    else if (action === 'up') setS((prev) => ({ ...prev, sel: Math.max(0, prev.sel - 1), pickKeys: withEnter(prev.pickKeys) }))
    else if (action === 'open' || action === 'yank') exec(`${action} ${selectedRank}`, s.pickKeys)
    else if (action === 'next' || action === 'prev') exec(action, s.pickKeys)
    else setS((prev) => ({ ...prev, pick: false }))
  }

  function press(key: Key) {
    if (key === 'enter') run(s.input)
    else if (key === 'tab') complete()
    else if (key === 'up') browseHistory(-1)
    else if (key === 'down') browseHistory(1)
    else if (key === 'esc') {
      if (s.input) setInput('')
      // Entered on purpose, so pick mode takes the letter keys too
      else if (items.length) setS((prev) => ({ ...prev, pick: !prev.pick, pickKeys: 'all' }))
    } else if (key === 'ctrlc') {
      append([{ kind: 'cmd', id: newId(), text: maskToken(s.input), suffix: '^C', at: Date.now() }], { pick: false })
      setInput('')
    } else if (key === 'ctrll') setS((prev) => ({ ...prev, entries: [], pick: false }))
    else if (key.startsWith('ins:')) {
      const ch = key.slice(4)
      setS((prev) => ({
        ...prev,
        input: prev.input.slice(0, prev.caret) + ch + prev.input.slice(prev.caret),
        caret: prev.caret + ch.length,
        pick: false,
      }))
    } else pickAct(key.slice(5) as PickAction)
  }

  // Autosuggestion from history and the examples, accepted with →
  const ghost =
    s.input && s.caret >= s.input.length && !s.pick
      ? ([...s.history].reverse().concat(EXAMPLES).find((x) => x.startsWith(s.input) && x.length > s.input.length)?.slice(s.input.length) ?? '')
      : ''

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const { key } = e
    if (e.ctrlKey && !e.metaKey) {
      const lower = key.toLowerCase()
      if (lower === 'l' || lower === 'c') {
        e.preventDefault()
        return press(lower === 'l' ? 'ctrll' : 'ctrlc')
      }
      if (lower === 'u') {
        e.preventDefault()
        return setInput('')
      }
    }
    if (pickOn && s.input === '' && PICK_KEYS[key] && pickTakes(s.pickKeys, key)) {
      e.preventDefault()
      // Before it has the letter keys, esc hands them over rather than quitting
      if (key === 'Escape' && s.pickKeys !== 'all') return setS((prev) => ({ ...prev, pickKeys: 'all' }))
      return pickAct(PICK_KEYS[key])
    }
    const mapped: Record<string, Key> = { Enter: 'enter', Tab: 'tab', ArrowUp: 'up', ArrowDown: 'down', Escape: 'esc' }
    if (mapped[key]) {
      e.preventDefault()
      return press(mapped[key])
    }
    if (key === 'ArrowRight' && ghost) {
      e.preventDefault()
      setInput(s.input + ghost)
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const { value, selectionStart } = e.target
    setS((prev) => ({ ...prev, input: value, caret: selectionStart ?? value.length, pick: false, historyIndex: null }))
  }

  function act(action: ShellAction) {
    if (action.type === 'run') run(action.command)
    else if (action.type === 'fill') fill(action.text)
    else if (action.type === 'openUrl') window.open(action.url, '_blank', 'noopener')
    else setS((prev) => ({ ...prev, sel: action.index, pick: true, pickKeys: withEnter(prev.pickKeys) }))
  }

  function focusInput() {
    // Don't steal a text selection someone is about to copy
    if (String(window.getSelection() ?? '')) return
    inputRef.current?.focus({ preventScroll: true })
  }

  // Scrollback, typed out line by line as it arrives
  const typeOut = !reducedMotion
  const lines: Line[] = []
  for (const e of s.entries) {
    let ls: Line[]
    if (e.kind === 'cmd') ls = [commandLine(e.text, layout, e.suffix)]
    else if (e.kind === 'motd') ls = motdLines(hasToken, today)
    else if (e.kind === 'lines') ls = layout === 'm' && e.mobile ? e.mobile : e.lines
    else {
      ls = searchLines(e, {
        layout, live: e.id === s.liveId, sel: s.sel, yanked: s.yanked, now, limit, remaining, hasToken,
      })
    }
    if (typeOut && e.kind !== 'cmd') ls = ls.slice(0, Math.max(1, Math.floor((now - e.at) / TYPE_MS_PER_LINE) + 1))
    lines.push(...ls)
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, s.input, s.pick, layout])

  const quotaColor = remaining === 0 ? C.red : remaining <= limit * 0.2 ? C.amber : C.green
  const quotaBar = `${'▮'.repeat(Math.round((remaining / limit) * 10))}${'▯'.repeat(10 - Math.round((remaining / limit) * 10))}`
  const quotaText = <span style={{ color: quotaColor }}>{quotaBar} {remaining}/{limit}</span>

  const pickHint = pickOn
    ? layout === 'd'
      ? [
          seg(' PICK ', C.bg, { bg: C.green, bold: true }), seg(`  ${selIndex + 1}/${items.length}   `, C.green),
          ...(s.pickKeys === 'all'
            ? [
                seg('j/k', C.white), seg(' move   ', C.dim), seg('↵', C.white), seg(' open   ', C.dim), seg('y', C.white),
                seg(` yank ${selected?.yank.label ?? ''}   `, C.dim),
                seg('n/p', C.white), seg(' page   ', C.dim), seg('q', C.white), seg(' quit', C.dim),
              ]
            : [
                seg('↑↓', C.white), seg(' move   ', C.dim),
                ...(s.pickKeys === 'enter' ? [seg('↵', C.white), seg(' open   ', C.dim)] : []),
                seg('esc', C.white), seg(' more keys · or just start typing', C.dim),
              ]),
        ]
      : [seg(' PICK ', C.bg, { bg: C.green, bold: true }), seg(`  ${selIndex + 1}/${items.length}  `, C.green), seg('keys below · tap a row', C.dim)]
    : null

  const prompt = (
    <div className="relative flex min-h-[1.55em] whitespace-pre">
      {pickHint ? (
        <div><Segs segs={pickHint} act={act} /></div>
      ) : (
        <>
          <span style={{ color: C.green, fontWeight: 700 }}>dowse</span>
          {layout === 'd' && <span style={{ color: C.dim }}> ~/search</span>}
          <span style={{ color: C.green }}> ❯ </span>
          <div className="relative min-w-0 flex-1" style={layout === 'm' ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } : undefined}>
            <Segs segs={highlight(s.input)} act={act} />
            <span style={{ color: C.faint }}>{ghost}</span>
            {!s.input && <span style={{ color: C.faint }}> type help · tab completes · ↑ history</span>}
            <Cursor on={s.focused} caret={s.caret} ch={s.input[s.caret] ?? ' '} />
          </div>
        </>
      )}
      <input
        ref={inputRef}
        aria-label="Command"
        value={s.input}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSelect={(e) => {
          const caret = e.currentTarget.selectionStart ?? 0
          if (caret !== s.caret) setS((prev) => ({ ...prev, caret }))
        }}
        onFocus={() => setS((prev) => ({ ...prev, focused: true }))}
        onBlur={() => setS((prev) => ({ ...prev, focused: false }))}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="absolute bottom-0 left-0 h-px w-px border-0 p-0 text-base opacity-0"
      />
    </div>
  )

  const scrollback = (
    <div
      ref={scrollRef}
      onClick={focusInput}
      className="dowse-scroll min-h-0 flex-1 cursor-text overflow-y-auto"
      style={{ padding: layout === 'd' ? '14px 20px 18px' : '10px 12px 12px' }}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          onClick={l.action ? () => act(l.action!) : undefined}
          className="whitespace-pre-wrap wrap-break-word"
          style={{ minHeight: '1.55em', background: l.bg, cursor: l.action ? 'pointer' : undefined }}
        >
          <Segs segs={l.segs} act={act} />
        </div>
      ))}
      {prompt}
    </div>
  )

  const overlay = crt ? (
    <>
      <div aria-hidden className="dowse-scan" />
      <div aria-hidden className="dowse-crt" />
    </>
  ) : null

  if (layout === 'm') {
    const keys: [string, Key][] = pickOn
      ? [['↑', 'pick:up'], ['↓', 'pick:down'], ['OPEN ↗', 'pick:open'], ['YANK', 'pick:yank'], ['PREV', 'pick:prev'], ['NEXT', 'pick:next'], ['QUIT', 'pick:quit']]
      : [['TAB', 'tab'], ['↑', 'up'], ['↓', 'down'], ['ESC', 'esc'], ['^C', 'ctrlc'], ['^L', 'ctrll'], ['-', 'ins:-'], ['>', 'ins:>'], [':', 'ins::'], ['/', 'ins:/'], ['↵', 'enter']]
    return (
      // No glow on phones, where it smears small text
      <div className="dowse dowse-flat relative flex h-dvh flex-col overflow-hidden" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {overlay}
        <div className="flex flex-none items-center gap-2 px-3.5 pb-2" style={{ borderBottom: `1px solid ${C.border}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
          <span style={{ color: C.green, fontWeight: 700 }}>dowse</span>
          <span style={{ color: C.dim }}>— tty0</span>
          <span className="ml-auto">{quotaText}</span>
        </div>
        {scrollback}
        <div
          className="dowse-scroll flex flex-none gap-1.5 overflow-x-auto px-2.5 pt-2"
          style={{ borderTop: `1px solid ${C.border}`, background: C.bar, paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          {keys.map(([label, key]) => {
            const hot = key === 'pick:open' || key === 'enter'
            return (
              <button
                key={key}
                type="button"
                // mousedown, not click, so the input keeps focus and the keyboard stays up
                onMouseDown={(e) => {
                  e.preventDefault()
                  press(key)
                  if (document.activeElement !== inputRef.current) inputRef.current?.focus({ preventScroll: true })
                }}
                className="grid h-11 min-w-11 flex-none cursor-pointer place-items-center px-2.5 text-xs font-bold select-none"
                style={{ border: `1px solid ${hot ? C.green : '#1d3326'}`, color: hot ? C.bg : C.green, background: hot ? C.green : C.bg }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={`dowse relative flex h-dvh flex-col overflow-hidden${crt ? '' : ' dowse-flat'}`} style={{ fontSize: 13, lineHeight: 1.55 }}>
      {overlay}
      <div className="flex h-8.5 flex-none items-center gap-2 px-3.5 text-xs" style={{ background: C.bar, borderBottom: `1px solid ${C.border}` }}>
        <div aria-hidden className="flex gap-1.75">
          {[0, 1, 2].map((i) => <div key={i} className="size-2.75 rounded-full" style={{ background: '#26382d' }} />)}
        </div>
        <span className="flex-1 text-center" style={{ color: C.dim }}>dowse — {hasToken ? 'token' : 'guest'}@tty0</span>
        {quotaText}
      </div>
      <div className="flex min-h-0 flex-1">
        {scrollback}
        <Preview
          glow={crt}
          ctx={s.ctx}
          view={selected}
          rank={selectedRank}
          yanked={s.yanked}
          onOpen={() => exec(`open ${selectedRank}`)}
          onYank={() => exec(`yank ${selectedRank}`)}
          act={act}
        />
      </div>
      <div className="flex h-6 flex-none items-center text-xs" style={{ background: C.green, color: '#051008', textShadow: 'none' }}>
        <span className="flex h-6 items-center px-2.5 font-bold" style={{ background: '#051008', color: C.green }}>
          {pickOn ? 'PICK' : s.focused ? 'INSERT' : 'IDLE'}
        </span>
        <span className="px-2.5">[dowse] 0:search* 1:preview</span>
        <span className="ml-auto px-2.5">
          {s.ctx && `${s.ctx.type} · ${sortLabel(s.ctx)} · ${live?.data ? `p${s.ctx.page}/${totalPages(live)} · ` : ''}`}
          quota {remaining}/{limit}
          {quota && quota.remaining < quota.limit && ` · reset ${formatCountdown(quota.resetAt.getTime() - now)}`}
          {hasToken ? ' · token' : ' · anon'}
        </span>
        <span className="flex h-6 items-center px-2.5" style={{ background: '#2fcf76' }}>
          {new Date(now).toTimeString().slice(0, 5)}
        </span>
      </div>
    </div>
  )
}

function hasBuildToken(): boolean {
  return effectiveToken(undefined) !== undefined
}

function Segs({ segs, act }: { segs: Seg[]; act: (action: ShellAction) => void }) {
  return segs.map((x, i) => (
    <span
      key={i}
      onClick={
        x.action
          ? (e) => {
              // The line may have its own action, e.g. selecting the row
              e.stopPropagation()
              act(x.action!)
            }
          : undefined
      }
      style={{
        color: x.c,
        background: x.bg,
        fontWeight: x.bold ? 700 : undefined,
        textDecoration: x.underline ? 'underline' : undefined,
        cursor: x.action ? 'pointer' : undefined,
      }}
    >
      {x.t}
    </span>
  ))
}

function Cursor({ on, caret, ch }: { on: boolean; caret: number; ch: string }) {
  return (
    <span
      aria-hidden
      className={on ? 'dowse-cursor' : undefined}
      style={{
        position: 'absolute',
        top: 0,
        left: `${caret}ch`,
        width: '1ch',
        height: '1.5em',
        background: on ? C.green : 'transparent',
        outline: on ? 'none' : `1px solid ${C.green}`,
        outlineOffset: -1,
        color: C.bg,
        whiteSpace: 'pre',
        boxShadow: on ? '0 0 8px rgba(77,255,154,.7)' : 'none',
        textShadow: 'none',
      }}
    >
      {ch}
    </span>
  )
}

const CHEAT: [string, string][] = [
  ['find', 'repositories'],
  ['code · issues', 'code, issues and PRs'],
  ['commits · users', 'commits, people and orgs'],
  ['topics · labels', 'topics, repo labels'],
  ['tab', 'complete cmd / flag / value'],
  ['↑ ↓ · →', 'history · accept suggestion'],
  ['esc', 'pick mode'],
  ['help', 'everything else'],
]

const NO_SIGNAL = '   ┌──────────────┐\n   │  ·  ·  ·  ·  │\n   │   NO SIGNAL  │\n   │  ·  ·  ·  ·  │\n   └──────────────┘'

interface PreviewProps {
  glow: boolean
  ctx: SearchContext | null
  view: ResultView | undefined
  rank: number
  yanked: boolean
  onOpen: () => void
  onYank: () => void
  act: (action: ShellAction) => void
}

/** The tmux-style right pane: compiled query and the selected result */
function Preview({ glow, ctx, view, rank, yanked, onOpen, onYank, act }: PreviewProps) {
  const label = (text: string) => <span style={{ color: C.dim }}>{text}</span>
  const value = (text: string | number) => <span style={{ color: C.white }}>{text}</span>

  return (
    <div className="dowse-scroll flex w-[420px] flex-none flex-col gap-3.5 overflow-y-auto" style={{ borderLeft: `1px solid ${C.border}`, padding: '14px 20px 18px' }}>
      <div style={{ color: C.faint }}>── 1:preview ──────────────────────────</div>
      {ctx && (
        <div className="text-xs">
          <div className="mb-0.5" style={{ color: C.dim }}>compiled query</div>
          <div>{label('type = ')}{value(ctx.type)}{ctx.mode && <>{label(' · search_type = ')}{value(ctx.mode)}</>}</div>
          {ctx.repo && <div>{label('repo = ')}{value(ctx.repo)}</div>}
          <div className="whitespace-pre-wrap wrap-break-word">
            {label('q = ')}
            <Segs segs={highlight(`find ${ctx.q}`).slice(2)} act={act} />
          </div>
          <div>{label('sort = ')}{value(sortLabel(ctx))}{label(' · per_page = ')}{value(ctx.perPage)}</div>
        </div>
      )}
      {view ? (
        <>
          <div className="flex justify-between text-xs" style={{ color: C.dim }}>
            <span>── target ──</span>
            <span>#{String(rank).padStart(2, '0')}</span>
          </div>
          <div className="wrap-break-word" style={{ fontSize: 17, lineHeight: 1.3 }}>
            {label(view.prefix)}
            <span
              style={{
                color: view.titleColor ?? C.green,
                background: view.titleBg,
                fontWeight: 700,
                textShadow: glow && !view.titleBg ? '0 0 10px rgba(77,255,154,.5)' : 'none',
              }}
            >
              {view.title}
            </span>
            <Segs segs={view.badges} act={act} />
          </div>
          {view.detail && <div className="text-pretty" style={{ color: C.desc }}>{view.detail}</div>}
          <div className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-0.5 text-xs">
            {view.facts.map((f) => (
              <div key={f.label} className="contents">
                {label(f.label)}
                <span
                  onClick={f.url ? () => act({ type: 'openUrl', url: f.url! }) : undefined}
                  className={f.url ? 'cursor-pointer truncate underline' : 'wrap-break-word'}
                  style={{ color: f.color }}
                >
                  {f.value}
                </span>
              </div>
            ))}
          </div>
          {view.tags.length > 0 && (
            <div className="text-xs leading-6 whitespace-pre-wrap"><Segs segs={view.tags} act={act} /></div>
          )}
          {view.fragments.length > 0 && (
            <div className="overflow-x-auto p-2.5 text-xs whitespace-pre" style={{ background: '#0d1510', border: `1px solid ${C.border}` }}>
              {view.fragments.map((f, i) => <div key={i} style={{ minHeight: '1.5em' }}><Segs segs={f} act={act} /></div>)}
            </div>
          )}
          <button
            type="button"
            onClick={onYank}
            className="flex cursor-pointer justify-between gap-2.5 px-[11px] py-[9px] text-left text-xs"
            style={{ background: '#0d1510', border: `1px solid ${C.border}` }}
          >
            <span className="min-w-0 truncate">
              {view.yank.shell ? <>{label('$ ')}{view.yank.shell}</> : <>{label(`${view.yank.label}  `)}{view.yank.text}</>}
            </span>
            <span className="flex-none" style={{ color: yanked ? C.green : C.dim }}>{yanked ? 'copied ✓' : 'y yank'}</span>
          </button>
          <button type="button" onClick={onOpen} className="dowse-open cursor-pointer p-[9px] text-center">
            [ ↵ open on github ↗ ]
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3.5" style={{ color: C.dim }}>
          <div className="whitespace-pre" style={{ color: C.faint, lineHeight: 1.3 }}>{NO_SIGNAL}</div>
          <div>
            no target. run a search, e.g. <span style={{ color: C.green }}>find &lt;terms&gt;</span>; the selected result shows up here.
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-[3px] text-xs">
            {CHEAT.map(([k, d]) => (
              <div key={k} className="contents">
                <span style={{ color: C.amber }}>{k}</span>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
