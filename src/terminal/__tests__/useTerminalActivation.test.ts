import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTerminalActivation } from '../useTerminalActivation'
import { useScrollStore } from '../../stores/scrollStore'

describe('useTerminalActivation', () => {
  beforeEach(() => {
    // 重置 store 到已知状态
    useScrollStore.setState({
      terminalMode: 'idle',
      echoLines: [],
      inputValue: '',
      typewriterDone: true,
    })
  })

  it('returns isActive=false when terminalMode is idle', () => {
    useScrollStore.setState({ terminalMode: 'idle' })
    const { result } = renderHook(() => useTerminalActivation())
    expect(result.current.isActive).toBe(false)
  })

  it('returns isActive=true when terminalMode is active', () => {
    useScrollStore.setState({ terminalMode: 'active' })
    const { result } = renderHook(() => useTerminalActivation())
    expect(result.current.isActive).toBe(true)
  })

  it('activate() sets terminalMode to active from idle', () => {
    useScrollStore.setState({ terminalMode: 'idle' })
    const { result } = renderHook(() => useTerminalActivation())

    act(() => {
      result.current.activate()
    })

    expect(useScrollStore.getState().terminalMode).toBe('active')
  })

  it('activate() does nothing from non-idle state', () => {
    useScrollStore.setState({ terminalMode: 'typing' })
    const { result } = renderHook(() => useTerminalActivation())

    act(() => {
      result.current.activate()
    })

    expect(useScrollStore.getState().terminalMode).toBe('typing')
  })

  it('onKeyDown activates on / key', () => {
    useScrollStore.setState({ terminalMode: 'idle' })
    const { result } = renderHook(() => useTerminalActivation())

    const event = new KeyboardEvent('keydown', { key: '/' })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

    act(() => {
      result.current.onKeyDown(event)
    })

    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(useScrollStore.getState().terminalMode).toBe('active')
  })

  it('onKeyDown ignores / when target is INPUT', () => {
    useScrollStore.setState({ terminalMode: 'idle' })
    const { result } = renderHook(() => useTerminalActivation())

    const input = document.createElement('input')
    const event = new KeyboardEvent('keydown', { key: '/' })
    Object.defineProperty(event, 'target', { get: () => input, configurable: true })

    act(() => {
      result.current.onKeyDown(event)
    })

    expect(useScrollStore.getState().terminalMode).toBe('idle')
  })

  it('onKeyDown ignores / when target is TEXTAREA', () => {
    useScrollStore.setState({ terminalMode: 'idle' })
    const { result } = renderHook(() => useTerminalActivation())

    const textarea = document.createElement('textarea')
    const event = new KeyboardEvent('keydown', { key: '/' })
    Object.defineProperty(event, 'target', { get: () => textarea, configurable: true })

    act(() => {
      result.current.onKeyDown(event)
    })

    expect(useScrollStore.getState().terminalMode).toBe('idle')
  })

  it('returns stable onKeyDown and activate references', () => {
    const { result, rerender } = renderHook(() => useTerminalActivation())

    const firstOnKeyDown = result.current.onKeyDown
    const firstActivate = result.current.activate

    rerender()

    expect(result.current.onKeyDown).toBe(firstOnKeyDown)
    expect(result.current.activate).toBe(firstActivate)
  })
})
