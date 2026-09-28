import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDebouncedCallback } from './useDebouncedCallback'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('calls once with the last arguments after calls stop for the delay', () => {
  const fn = vi.fn()
  const { result } = renderHook(() => useDebouncedCallback(fn, 300))

  result.current.run('a')
  act(() => {
    vi.advanceTimersByTime(200)
  })
  result.current.run('ab')
  act(() => {
    vi.advanceTimersByTime(299)
  })
  expect(fn).not.toHaveBeenCalled()

  act(() => {

    vi.advanceTimersByTime(1)

  })
  expect(fn).toHaveBeenCalledTimes(1)
  expect(fn).toHaveBeenCalledWith('ab')
})

it('drops the pending call on cancel', () => {
  const fn = vi.fn()
  const { result } = renderHook(() => useDebouncedCallback(fn, 300))

  result.current.run('a')
  result.current.cancel()
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(fn).not.toHaveBeenCalled()
})

it('drops the pending call on unmount', () => {
  const fn = vi.fn()
  const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 300))

  result.current.run('a')
  unmount()
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(fn).not.toHaveBeenCalled()
})

it('runs the latest callback and stays stable across renders', () => {
  const first = vi.fn()
  const second = vi.fn()
  const { result, rerender } = renderHook(({ fn }) => useDebouncedCallback(fn, 300), {
    initialProps: { fn: first },
  })
  const initial = result.current

  result.current.run('a')
  rerender({ fn: second })
  act(() => {
    vi.advanceTimersByTime(300)
  })

  expect(result.current).toBe(initial)
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith('a')
})

it('makes the pending call straight away on flush, and only once', () => {
  const fn = vi.fn()
  const { result } = renderHook(() => useDebouncedCallback(fn, 300))

  result.current.run('a')
  result.current.flush()
  expect(fn).toHaveBeenCalledTimes(1)
  expect(fn).toHaveBeenCalledWith('a')

  act(() => {

    vi.advanceTimersByTime(300)

  })
  result.current.flush()
  expect(fn).toHaveBeenCalledTimes(1)
})

it('does nothing on flush when no call is pending', () => {
  const fn = vi.fn()
  const { result } = renderHook(() => useDebouncedCallback(fn, 300))

  result.current.flush()
  result.current.run('a')
  result.current.cancel()
  result.current.flush()
  expect(fn).not.toHaveBeenCalled()
})
