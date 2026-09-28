import { memo } from 'react'
import { C, type Line, type Seg, type ShellAction } from '../lib/shell'

/**
 * One line of the scrollback. Memoized: cached lines keep their identity, so
 * only lines that changed re-render on each tick. Give it an `act` that keeps
 * its identity too.
 */
export const TerminalLine = memo(function TerminalLine({
  line,
  act,
}: {
  line: Line
  act: (action: ShellAction) => void
}) {
  return (
    <div
      aria-hidden={line.decorative || undefined}
      onClick={line.action ? () => act(line.action!) : undefined}
      className="whitespace-pre-wrap wrap-break-word"
      style={{ minHeight: '1.55em', background: line.bg, cursor: line.action ? 'pointer' : undefined }}
    >
      <Segs segs={line.segs} act={act} />
    </div>
  )
})

/** Runs of styled terminal text; clicking one with an action runs it */
export function Segs({ segs, act }: { segs: Seg[]; act: (action: ShellAction) => void }) {
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

/** The block cursor drawn over the character at `caret` */
export function Cursor({ on, caret, ch }: { on: boolean; caret: number; ch: string }) {
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
