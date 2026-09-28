import { C, highlight, sortLabel, type SearchContext, type ShellAction } from '../lib/shell'
import type { ResultView } from '../lib/shellResults'
import { Segs } from './Segs'

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

const NO_SIGNAL =
  '   ┌──────────────┐\n   │  ·  ·  ·  ·  │\n   │   NO SIGNAL  │\n   │  ·  ·  ·  ·  │\n   └──────────────┘'

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
export function Preview({ glow, ctx, view, rank, yanked, onOpen, onYank, act }: PreviewProps) {
  const label = (text: string) => <span style={{ color: C.dim }}>{text}</span>
  const value = (text: string | number) => <span style={{ color: C.white }}>{text}</span>

  return (
    <div
      className="dowse-scroll flex w-[420px] flex-none flex-col gap-3.5 overflow-y-auto"
      style={{ borderLeft: `1px solid ${C.border}`, padding: '14px 20px 18px' }}
    >
      <div aria-hidden style={{ color: C.faint }}>
        ── 1:preview ──────────────────────────
      </div>
      {ctx && (
        <div className="text-xs">
          <div className="mb-0.5" style={{ color: C.dim }}>
            compiled query
          </div>
          <div>
            {label('type = ')}
            {value(ctx.type)}
            {ctx.mode && (
              <>
                {label(' · search_type = ')}
                {value(ctx.mode)}
              </>
            )}
          </div>
          {ctx.repo && (
            <div>
              {label('repo = ')}
              {value(ctx.repo)}
            </div>
          )}
          <div className="whitespace-pre-wrap wrap-break-word">
            {label('q = ')}
            <Segs segs={highlight(`find ${ctx.q}`).slice(2)} act={act} />
          </div>
          <div>
            {label('sort = ')}
            {value(sortLabel(ctx))}
            {label(' · per_page = ')}
            {value(ctx.perPage)}
          </div>
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
          {view.detail && (
            <div className="text-pretty" style={{ color: C.desc }}>
              {view.detail}
            </div>
          )}
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
            <div className="text-xs leading-6 whitespace-pre-wrap">
              <Segs segs={view.tags} act={act} />
            </div>
          )}
          {view.fragments.length > 0 && (
            <div
              className="overflow-x-auto p-2.5 text-xs whitespace-pre"
              style={{ background: '#0d1510', border: `1px solid ${C.border}` }}
            >
              {view.fragments.map((f, i) => (
                <div key={i} style={{ minHeight: '1.5em' }}>
                  <Segs segs={f} act={act} />
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onYank}
            className="flex cursor-pointer justify-between gap-2.5 px-[11px] py-[9px] text-left text-xs"
            style={{ background: '#0d1510', border: `1px solid ${C.border}` }}
          >
            <span className="min-w-0 truncate">
              {view.yank.shell ? (
                <>
                  {label('$ ')}
                  {view.yank.shell}
                </>
              ) : (
                <>
                  {label(`${view.yank.label}  `)}
                  {view.yank.text}
                </>
              )}
            </span>
            <span className="flex-none" style={{ color: yanked ? C.green : C.dim }}>
              {yanked ? 'copied ✓' : 'y yank'}
            </span>
          </button>
          <button type="button" onClick={onOpen} className="dowse-open cursor-pointer p-[9px] text-center">
            [ ↵ open on github ↗ ]
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3.5" style={{ color: C.dim }}>
          <div aria-hidden className="whitespace-pre" style={{ color: C.faint, lineHeight: 1.3 }}>
            {NO_SIGNAL}
          </div>
          <div>
            no target. run a search, e.g. <span style={{ color: C.green }}>find &lt;terms&gt;</span>; the selected
            result shows up here.
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
