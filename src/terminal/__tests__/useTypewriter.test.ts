import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTypewriter } from '../useTypewriter'

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string initially (before startDelay)', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'Hello', startDelay: 800, charInterval: 40 })
    )

    expect(result.current.displayedText).toBe('')
    expect(result.current.isTyping).toBe(true)
    expect(result.current.isDone).toBe(false)
  })

  it('starts typing after startDelay', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'Hello', startDelay: 800, charInterval: 40 })
    )

    act(() => { vi.advanceTimersByTime(800) })
    expect(result.current.displayedText).toBe('H')
    expect(result.current.isTyping).toBe(true)
  })

  it('types all characters over time', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'Hi', startDelay: 100, charInterval: 50 })
    )

    act(() => { vi.advanceTimersByTime(100) })  // 'H'
    expect(result.current.displayedText).toBe('H')

    act(() => { vi.advanceTimersByTime(50) })   // 'Hi'
    expect(result.current.displayedText).toBe('Hi')

    act(() => { vi.advanceTimersByTime(50) })   // done
    expect(result.current.isTyping).toBe(false)
    expect(result.current.isDone).toBe(true)
  })

  it('cleans up timer on unmount (no state update after unmount)', () => {
    const { result, unmount } = renderHook(() =>
      useTypewriter({ echoText: 'Hello', startDelay: 100, charInterval: 40 })
    )

    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current.displayedText).toBe('H')

    unmount()

    // Advance past completion — should not throw
    act(() => { vi.advanceTimersByTime(500) })
    // No assertion needed — the test passes if no error is thrown
  })

  it('uses default startDelay=800 and charInterval=40', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'AB' })
    )

    act(() => { vi.advanceTimersByTime(799) })
    expect(result.current.displayedText).toBe('')

    act(() => { vi.advanceTimersByTime(1) })   // 800ms
    expect(result.current.displayedText).toBe('A')

    act(() => { vi.advanceTimersByTime(40) })  // 840ms
    expect(result.current.displayedText).toBe('AB')
  })
})
