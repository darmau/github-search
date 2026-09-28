import { C } from '../lib/shell'

export type PickAction = 'up' | 'down' | 'open' | 'yank' | 'next' | 'prev' | 'quit'
/** What a key press does: the keys phones lack, and pick mode's actions */
export type Key = 'enter' | 'tab' | 'up' | 'down' | 'esc' | 'ctrlc' | 'ctrll' | `ins:${string}` | `pick:${PickAction}`

// [label, key, name for assistive tech where the label is a symbol]
const PICK_ROW: [string, Key, string?][] = [
  ['↑', 'pick:up', 'previous result'],
  ['↓', 'pick:down', 'next result'],
  ['OPEN ↗', 'pick:open', 'open on GitHub'],
  ['YANK', 'pick:yank'],
  ['PREV', 'pick:prev', 'previous page'],
  ['NEXT', 'pick:next', 'next page'],
  ['QUIT', 'pick:quit'],
]

const PROMPT_ROW: [string, Key, string?][] = [
  ['TAB', 'tab'],
  ['↑', 'up', 'previous command'],
  ['↓', 'down', 'next command'],
  ['ESC', 'esc'],
  ['^C', 'ctrlc', 'cancel line'],
  ['^L', 'ctrll', 'clear screen'],
  ['-', 'ins:-', 'type -'],
  ['>', 'ins:>', 'type >'],
  [':', 'ins::', 'type :'],
  ['/', 'ins:/', 'type /'],
  ['↵', 'enter', 'run'],
]

interface MobileKeysProps {
  /** Show pick mode's actions instead of the prompt's keys */
  pick: boolean
  onPress: (key: Key) => void
  /** Puts focus back on the prompt, so the phone keyboard stays up */
  keepFocus: () => void
}

/** The row of keys under the terminal on narrow screens */
export function MobileKeys({ pick, onPress, keepFocus }: MobileKeysProps) {
  return (
    <div
      className="dowse-scroll flex flex-none gap-1.5 overflow-x-auto px-2.5 pt-2"
      style={{
        borderTop: `1px solid ${C.border}`,
        background: C.bar,
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}
    >
      {(pick ? PICK_ROW : PROMPT_ROW).map(([label, key, name]) => {
        const hot = key === 'pick:open' || key === 'enter'
        return (
          <button
            key={key}
            type="button"
            aria-label={name}
            // mousedown, not click, so the input keeps focus and the keyboard stays up
            onMouseDown={(e) => {
              e.preventDefault()
              onPress(key)
              keepFocus()
            }}
            // A click with no mousedown before it: the keyboard or a screen reader
            onClick={(e) => {
              if (e.detail === 0) onPress(key)
            }}
            className="grid h-11 min-w-11 flex-none cursor-pointer place-items-center px-2.5 text-xs font-bold select-none"
            style={{
              border: `1px solid ${hot ? C.green : '#1d3326'}`,
              color: hot ? C.bg : C.green,
              background: hot ? C.green : C.bg,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
