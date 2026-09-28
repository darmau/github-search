import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import { effectiveToken, getRepository, GitHubApiError, searchGitHub, searchResource } from '../api/github'
import { getCachedSearch, searchCacheKey, setCachedSearch } from '../api/searchCache'
import { setGitHubToken, useGitHubToken } from '../hooks/useGitHubToken'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useSearchQuota } from '../hooks/useSearchQuota'
import { parseRepositoryName } from '../lib/repositoryName'
import { SEARCH_TYPE_INFO } from '../lib/searchTypes'
import {
  ALIASES,
  C,
  commonPrefix,
  completionCandidates,
  completionSuffix,
  EXAMPLES,
  formatCountdown,
  highlight,
  line,
  looksLikeToken,
  maskToken,
  searchTypeOf,
  seg,
  sortLabel,
  toCommand,
  toSearchParams,
  tokenize,
  type Line,
  type SearchContext,
  type ShellAction,
} from '../lib/shell'
import {
  createLineCache,
  entryLines,
  errorLine,
  helpLines,
  latestAnnouncement,
  pageOffset,
  totalPages,
  type Entry,
  type Layout,
  type ScrollbackView,
  type SearchEntry,
} from '../lib/shellOutput'
import {
  crtLines,
  didYouMeanLines,
  exitLines,
  historyLines,
  noResultsError,
  openLines,
  pickedIndex,
  rateLines,
  refused,
  resorted,
  searchFromArgs,
  searchHelpLines,
  targetPage,
  tokenRemovedLines,
  tokenSavedLines,
  tokenStatusLines,
  usageLine,
  viewLines,
  whoamiLines,
  yankLines,
  type Refusal,
} from '../lib/shellCommands'
import { describeResult, type AnySearchResponse, type ResultView } from '../lib/shellResults'
import { Announcer } from './Announcer'
import { MobileKeys, type Key, type PickAction } from './MobileKeys'
import { Preview } from './Preview'
import { Cursor, Segs, TerminalLine } from './Segs'
import { commandFromUrl, loadCrt, loadHistory, saveCrt, saveHistory, urlWithCommand } from '../lib/shellSession'

/** Lines of output typed out per millisecond, roughly */
const TYPE_MS_PER_LINE = 11
const TYPE_OUT_MS = 3200
const MAX_ENTRIES = 60
const MAX_HISTORY = 50

/**
 * Which keys pick mode takes from the prompt. It comes up by itself when
 * results land, so at first it only takes the arrows and esc, and letters
 * still reach the prompt. Moving or clicking a result lets ↵ open it, and esc
 * hands over the letter keys too.
 */
type PickKeys = 'arrows' | 'enter' | 'all'

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
  j: 'down',
  ArrowDown: 'down',
  k: 'up',
  ArrowUp: 'up',
  Enter: 'open',
  o: 'open',
  y: 'yank',
  n: 'next',
  p: 'prev',
  q: 'quit',
  Escape: 'quit',
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
  // Drawn lines of each entry, kept for as long as the terminal is mounted
  const [lineCache] = useState(createLineCache)

  const hintId = useId()
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
  const selected: ResultView | undefined =
    live && items.length ? describeResult(live.ctx, items[selIndex], now) : undefined
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

  async function fetchResults(
    ctx: SearchContext,
    signal: AbortSignal,
  ): Promise<{ data: AnySearchResponse; cached: boolean }> {
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
    setS((prev) => ({
      ...prev,
      entries: [...prev.entries, ...entries].slice(-MAX_ENTRIES),
      animateUntil: at + TYPE_OUT_MS,
      ...patch,
    }))
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

    const print = (lines: Line[], mobile?: Line[]) => {
      if (lines.length) out.push({ kind: 'lines', id: newId(), lines, mobile, at })
    }
    const fail = (refusal: Refusal | string) => {
      const { error, more = [] } = typeof refusal === 'string' ? { error: refusal } : refusal
      print([errorLine(error)])
      print(more)
    }
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
      fail(noResultsError(live?.status))
      return null
    }

    const [first, ...args] = text ? tokenize(text) : ['']
    const command = ALIASES[first] ?? first
    const type = searchTypeOf(command)
    if (!text) {
      // A blank line, as in any shell
    } else if (type) {
      const ctx = searchFromArgs(command, type, args, at, s.ctx?.perPage)
      if (refused(ctx)) fail(ctx)
      else search(ctx)
    } else {
      switch (command) {
        case 'next':
        case 'prev':
        case 'page': {
          const entry = onScreen()
          if (!entry) break
          const page = targetPage(command, args[0], entry)
          if (typeof page === 'number') search({ ...entry.ctx, page })
          else fail(page)
          break
        }
        case 'sort': {
          if (!s.ctx) {
            fail('no previous search — run a search first')
            break
          }
          const ctx = resorted(s.ctx, args)
          if (refused(ctx)) fail(ctx)
          else search(ctx)
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
          const entry = onScreen()
          if (!entry?.data) break
          const index = pickedIndex(args[0], s.sel, entry)
          if (typeof index !== 'number') {
            fail(index)
            break
          }
          const view = describeResult(entry.ctx, entry.data.items[index], at)
          patch.sel = index
          patch.pick = true
          patch.pickKeys = withEnter(pickKeys)
          if (command === 'view') print(viewLines(view))
          else if (command === 'open') {
            window.open(view.url, '_blank', 'noopener')
            print(openLines(view))
          } else {
            copy(view.yank.text)
            print(yankLines(view))
          }
          break
        }
        case 'token': {
          const [sub, token] = args
          if (sub === 'set') {
            if (!token) fail('token set: missing token')
            else if (!looksLikeToken(token))
              fail("token: that doesn't look like a GitHub token (ghp_… or github_pat_…)")
            else {
              setGitHubToken(token)
              print(tokenSavedLines(token))
            }
          } else if (sub === 'rm') {
            if (!savedToken) fail('token: none saved')
            else {
              setGitHubToken(null)
              print(tokenRemovedLines(hasBuildToken()))
            }
          } else print(tokenStatusLines(savedToken, hasToken))
          break
        }
        case 'rate':
          print(rateLines({ remaining, limit, quota, resource, hasToken, now: at }))
          break
        case 'history':
          print(historyLines(history))
          break
        case 'whoami':
          print(whoamiLines(hasToken, limit))
          break
        case 'help': {
          const topic = args[0] && searchTypeOf(args[0])
          if (topic) print(searchHelpLines(topic))
          else {
            const help = helpLines()
            print(help.lines, help.mobile)
          }
          break
        }
        case 'crt': {
          const [value] = args
          if (value !== undefined && value !== 'on' && value !== 'off') {
            print([usageLine('crt [on | off]')])
            break
          }
          const on = value === undefined ? crt : value === 'on'
          if (on !== crt) {
            setCrt(on)
            saveCrt(on)
          }
          print(crtLines(on))
          break
        }
        case 'clear':
          setS((prev) => ({ ...prev, ...patch, entries: [] }))
          return false
        case 'exit':
          print(exitLines())
          break
        default:
          fail(`command not found: ${first}`)
          print(didYouMeanLines(first))
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
        lines: [
          line(
            candidates.map((c) =>
              seg(`${c}   `, C.cyan, { action: { type: 'fill', text: replaced(c + completionSuffix(c)) + after } }),
            ),
          ),
        ],
      },
    ])
  }

  function browseHistory(step: number) {
    const { history } = s
    if (!history.length) return
    const draft = s.historyIndex === null ? s.input : s.draft
    const index = Math.max(0, Math.min(history.length, (s.historyIndex ?? history.length) + step))
    const input = index === history.length ? draft : history[index]
    setS((prev) => ({
      ...prev,
      draft,
      historyIndex: index === history.length ? null : index,
      input,
      caret: input.length,
    }))
  }

  function pickAct(action: PickAction) {
    if (!items.length) return setS((prev) => ({ ...prev, pick: false }))
    if (action === 'down')
      setS((prev) => ({ ...prev, sel: Math.min(items.length - 1, prev.sel + 1), pickKeys: withEnter(prev.pickKeys) }))
    else if (action === 'up')
      setS((prev) => ({ ...prev, sel: Math.max(0, prev.sel - 1), pickKeys: withEnter(prev.pickKeys) }))
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
      ? ([...s.history]
          .reverse()
          .concat(EXAMPLES)
          .find((x) => x.startsWith(s.input) && x.length > s.input.length)
          ?.slice(s.input.length) ?? '')
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

  // Rows are memoized, so they get a callback that keeps its identity while
  // `act` itself is new on every render
  const actRef = useRef(act)
  useLayoutEffect(() => {
    actRef.current = act
  })
  const stableAct = useCallback((action: ShellAction) => actRef.current(action), [])

  // Scrollback, typed out line by line as it arrives
  const typeOut = !reducedMotion
  const view: ScrollbackView = {
    layout,
    liveId: s.liveId,
    sel: s.sel,
    yanked: s.yanked,
    now,
    limit,
    remaining,
    hasToken,
    today,
  }
  const lines: Line[] = []
  for (const e of s.entries) {
    let ls = entryLines(e, view, lineCache)
    if (typeOut && e.kind !== 'cmd') ls = ls.slice(0, Math.max(1, Math.floor((now - e.at) / TYPE_MS_PER_LINE) + 1))
    lines.push(...ls)
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, s.input, s.pick, layout])

  const quotaColor = remaining === 0 ? C.red : remaining <= limit * 0.2 ? C.amber : C.green
  const quotaBar = `${'▮'.repeat(Math.round((remaining / limit) * 10))}${'▯'.repeat(10 - Math.round((remaining / limit) * 10))}`
  const quotaText = (
    <span style={{ color: quotaColor }}>
      <span aria-hidden>{quotaBar}</span> {remaining}/{limit}
      <span className="sr-only"> searches left</span>
    </span>
  )

  // The drawn output isn't live: typing out, spinners and countdowns would be
  // noise read aloud. These announce the latest output and the result picked
  // instead.
  const spoken = latestAnnouncement(s.entries)
  const liveRegions = (
    <Announcer
      output={spoken?.text ?? ''}
      outputKey={spoken?.key ?? ''}
      picked={pickOn && selected ? `${selectedRank}: ${selected.spoken}` : ''}
    />
  )

  const pickHint = pickOn
    ? layout === 'd'
      ? [
          seg(' PICK ', C.bg, { bg: C.green, bold: true }),
          seg(`  ${selIndex + 1}/${items.length}   `, C.green),
          ...(s.pickKeys === 'all'
            ? [
                seg('j/k', C.white),
                seg(' move   ', C.dim),
                seg('↵', C.white),
                seg(' open   ', C.dim),
                seg('y', C.white),
                seg(` yank ${selected?.yank.label ?? ''}   `, C.dim),
                seg('n/p', C.white),
                seg(' page   ', C.dim),
                seg('q', C.white),
                seg(' quit', C.dim),
              ]
            : [
                seg('↑↓', C.white),
                seg(' move   ', C.dim),
                ...(s.pickKeys === 'enter' ? [seg('↵', C.white), seg(' open   ', C.dim)] : []),
                seg('esc', C.white),
                seg(' more keys · or just start typing', C.dim),
              ]),
        ]
      : [
          seg(' PICK ', C.bg, { bg: C.green, bold: true }),
          seg(`  ${selIndex + 1}/${items.length}  `, C.green),
          seg('keys below · tap a row', C.dim),
        ]
    : null

  const prompt = (
    <div className="relative flex min-h-[1.55em] whitespace-pre">
      {pickHint ? (
        <div>
          <Segs segs={pickHint} act={act} />
        </div>
      ) : (
        <>
          <span style={{ color: C.green, fontWeight: 700 }}>dowse</span>
          {layout === 'd' && <span style={{ color: C.dim }}> ~/search</span>}
          <span style={{ color: C.green }}> ❯ </span>
          <div
            className="relative min-w-0 flex-1"
            style={layout === 'm' ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } : undefined}
          >
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
        aria-describedby={hintId}
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
      role="log"
      // Announced through the live regions instead
      aria-live="off"
      aria-label="Output"
      onClick={focusInput}
      className="dowse-scroll min-h-0 flex-1 cursor-text overflow-y-auto"
      style={{ padding: layout === 'd' ? '14px 20px 18px' : '10px 12px 12px' }}
    >
      {lines.map((l, i) => (
        <TerminalLine key={i} line={l} act={stableAct} />
      ))}
      {prompt}
      <p id={hintId} className="sr-only">
        Type help for commands. Tab completes, up and down browse history. After a search, arrow keys pick a result and
        enter opens it.
      </p>
    </div>
  )

  const overlay = crt ? (
    <>
      <div aria-hidden className="dowse-scan" />
      <div aria-hidden className="dowse-crt" />
    </>
  ) : null

  if (layout === 'm') {
    return (
      // No glow on phones, where it smears small text
      <div
        className="dowse dowse-flat relative flex h-dvh flex-col overflow-hidden"
        style={{ fontSize: 13, lineHeight: 1.5 }}
      >
        {overlay}
        {liveRegions}
        <div
          className="flex flex-none items-center gap-2 px-3.5 pb-2"
          style={{ borderBottom: `1px solid ${C.border}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}
        >
          <span style={{ color: C.green, fontWeight: 700 }}>dowse</span>
          <span style={{ color: C.dim }}>— tty0</span>
          <span className="ml-auto">{quotaText}</span>
        </div>
        {scrollback}
        <MobileKeys
          pick={pickOn}
          onPress={press}
          keepFocus={() => {
            if (document.activeElement !== inputRef.current) inputRef.current?.focus({ preventScroll: true })
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`dowse relative flex h-dvh flex-col overflow-hidden${crt ? '' : ' dowse-flat'}`}
      style={{ fontSize: 13, lineHeight: 1.55 }}
    >
      {overlay}
      {liveRegions}
      <div
        className="flex h-8.5 flex-none items-center gap-2 px-3.5 text-xs"
        style={{ background: C.bar, borderBottom: `1px solid ${C.border}` }}
      >
        <div aria-hidden className="flex gap-1.75">
          {[0, 1, 2].map((i) => (
            <div key={i} className="size-2.75 rounded-full" style={{ background: '#26382d' }} />
          ))}
        </div>
        <span className="flex-1 text-center" style={{ color: C.dim }}>
          dowse — {hasToken ? 'token' : 'guest'}@tty0
        </span>
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
      <div
        className="flex h-6 flex-none items-center text-xs"
        style={{ background: C.green, color: '#051008', textShadow: 'none' }}
      >
        <span className="flex h-6 items-center px-2.5 font-bold" style={{ background: '#051008', color: C.green }}>
          {pickOn ? 'PICK' : s.focused ? 'INSERT' : 'IDLE'}
        </span>
        <span className="px-2.5">[dowse] 0:search* 1:preview</span>
        <span className="ml-auto px-2.5">
          {s.ctx &&
            `${s.ctx.type} · ${sortLabel(s.ctx)} · ${live?.data ? `p${s.ctx.page}/${totalPages(live)} · ` : ''}`}
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
