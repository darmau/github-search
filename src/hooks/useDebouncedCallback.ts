import { useCallback, useEffect, useMemo, useRef } from 'react'

export interface DebouncedCallback<TArgs extends unknown[]> {
  /** Schedules the callback, replacing any call still pending */
  run: (...args: TArgs) => void
  /** Drops the pending call, if any */
  cancel: () => void
}

/**
 * Calls `fn` with the latest arguments once calls have stopped for `delay` ms.
 * `run` and `cancel` are stable, always use the latest `fn`, and a pending
 * call is dropped on unmount.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): DebouncedCallback<TArgs> {
  const fnRef = useRef(fn)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    fnRef.current = fn
  })

  const cancel = useCallback(() => clearTimeout(timerRef.current), [])

  const run = useCallback(
    (...args: TArgs) => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fnRef.current(...args), delay)
    },
    [delay],
  )

  useEffect(() => cancel, [cancel])

  return useMemo(() => ({ run, cancel }), [run, cancel])
}
