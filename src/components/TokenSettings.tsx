import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { setGitHubToken, useGitHubToken } from '../hooks/useGitHubToken'

/** Fine-grained tokens can read public repositories without any permissions */
const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

export function TokenSettings() {
  const token = useGitHubToken()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const panelId = useId()
  const inputId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    // pointerdown rather than click, so a drag that starts inside the panel
    // (e.g. selecting text in the input) and ends outside doesn't close it
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Don't strand keyboard focus on a panel that is about to disappear
      if (rootRef.current?.contains(document.activeElement)) toggleRef.current?.focus()
      setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function save(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setGitHubToken(draft)
    setDraft('')
    setOpen(false)
  }

  function remove() {
    setGitHubToken(null)
    setDraft('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {token ? 'Token saved' : 'Add token'}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
        >
          <p>
            Without a token GitHub allows 10 searches a minute; with one, 30.{' '}
            <a
              href={NEW_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Create a fine-grained token
            </a>{' '}
            with no extra permissions.
          </p>

          {token ? (
            <div className="flex items-center justify-between gap-2">
              <code className="truncate font-mono text-gray-900 dark:text-gray-100">{maskToken(token)}</code>
              <button
                type="button"
                onClick={remove}
                className="shrink-0 rounded-md border border-red-300 px-3 py-1 font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                Remove token
              </button>
            </div>
          ) : (
            <form onSubmit={save} className="space-y-2">
              <label htmlFor={inputId} className="block font-medium text-gray-900 dark:text-gray-100">
                GitHub token
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  type="password"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="github_pat_…"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="rounded-md bg-blue-600 px-3 py-1 font-medium text-white enabled:hover:bg-blue-700 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          <p className="text-xs text-gray-500">
            Stored only in this browser and sent only to api.github.com. Anyone using this browser
            profile can read it, so don't save a token with write access.
          </p>
        </div>
      )}
    </div>
  )
}

/** Enough of the token to recognise it, not enough to use it */
function maskToken(token: string): string {
  return token.length <= 8 ? '••••' : `••••${token.slice(-4)}`
}
