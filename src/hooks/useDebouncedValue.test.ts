import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('returns the initial value immediately', () => {
  const { result } = renderHook(() => useDebouncedValue('a', 300))
  expect(result.current).toBe('a')
})

it('only updates after the value stops changing for the delay', () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
    initialProps: { value: 'a' },
  })

  rerender({ value: 'ab' })
  act(() => vi.advanceTimersByTime(200))
  rerender({ value: 'abc' })
  act(() => vi.advanceTimersByTime(299))
  expect(result.current).toBe('a')

  act(() => vi.advanceTimersByTime(1))
  expect(result.current).toBe('abc')
})
