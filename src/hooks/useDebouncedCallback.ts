import { useCallback, useEffect, useMemo, useRef } from 'react'

export interface DebouncedCallback<TArgs extends unknown[]> {
  /** Schedules the callback, replacing any call still pending */
  run: (...args: TArgs) => void
  /** Drops the pending call, if any */
  cancel: () => void
  /** Makes the pending call now instead of waiting, if there is one */
  flush: () => void
}

/**
 * Calls `fn` with the latest arguments once calls have stopped for `delay` ms.
 * `run`, `cancel` and `flush` are stable, always use the latest `fn`, and a
 * pending call is dropped on unmount.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): DebouncedCallback<TArgs> {
  const fnRef = useRef(fn)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Arguments of the call still waiting for its timer, so flush can make it early
  const pendingRef = useRef<TArgs | null>(null)
  useEffect(() => {
    fnRef.current = fn
  })

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current)
    pendingRef.current = null
  }, [])

  const flush = useCallback(() => {
    const args = pendingRef.current
    if (args === null) return
    cancel()
    fnRef.current(...args)
  }, [cancel])

  const run = useCallback(
    (...args: TArgs) => {
      clearTimeout(timerRef.current)
      pendingRef.current = args
      timerRef.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  useEffect(() => cancel, [cancel])

  return useMemo(() => ({ run, cancel, flush }), [run, cancel, flush])
}
