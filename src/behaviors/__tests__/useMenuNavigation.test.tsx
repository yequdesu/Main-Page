// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useMenuNavigation } from '../useMenuNavigation'
import { useScrollStore } from '../../stores/scrollStore'
import { executeCommand } from '../../terminal/commands'
import { PAGE_FLOW } from '../../types'

const initial = useScrollStore.getState()
afterEach(() => { cleanup(); useScrollStore.setState(initial, true) })

it.each([0, 0.6, 1, 1.22])('menu 从页面进度 %s 请求现有转场，不直接跳写进度', page => {
  useScrollStore.getState().setPageProgress(page)
  const navigate = vi.fn()
  renderHook(() => useMenuNavigation(navigate))
  act(() => { expect(executeCommand('menu')).toContain('Opening Menu') })
  expect(navigate).toHaveBeenCalledExactlyOnceWith(PAGE_FLOW.structureEnd)
  expect(useScrollStore.getState().pageProgress).toBe(page)
  // 普通状态更新不再次播放；重复命令仍可替换已被滚轮中断的播放。
  act(() => useScrollStore.getState().setInputValue('help'))
  expect(navigate).toHaveBeenCalledTimes(1)
  act(() => executeCommand('menu'))
  expect(navigate).toHaveBeenCalledTimes(2)
})

it.each(['voyager', 'planet'])('从 %s 聚焦进入 Menu 发出镜头交接事件，不返回全景', target => {
  useScrollStore.getState().setPageProgress(1)
  const store = useScrollStore.getState()
  if (target === 'voyager') store.focusVoyager()
  else store.setFocusedPlanet(2)
  const navigate = vi.fn(() => {
    expect(useScrollStore.getState().focusEvent).toEqual({ type: 'exit', reason: 'menu' })
  })
  renderHook(() => useMenuNavigation(navigate))
  act(() => useScrollStore.getState().requestMenu())
  expect(navigate).toHaveBeenCalledExactlyOnceWith(PAGE_FLOW.structureEnd)
  expect(useScrollStore.getState().focusedVoyager).toBe(false)
  expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
  expect(useScrollStore.getState().pageProgress).toBe(1)
})

it.each([1.01, 1.15])('在 %s 中断 Menu 并反向回到 Act 3 时恢复普通退出', peak => {
  useScrollStore.getState().setPageProgress(1)
  useScrollStore.getState().focusVoyager()
  renderHook(() => useMenuNavigation(vi.fn()))
  act(() => {
    useScrollStore.getState().requestMenu()
    useScrollStore.getState().setPageProgress(peak)
  })
  expect(useScrollStore.getState().focusEvent).toEqual({ type: 'exit', reason: 'menu' })
  act(() => useScrollStore.getState().setPageProgress(1))
  expect(useScrollStore.getState().focusEvent).toEqual({ type: 'exit', reason: 'scene' })
})

it('已在 Menu 时不重播，卸载或回调更新后不残留订阅', () => {
  const first = vi.fn(), second = vi.fn()
  const hook = renderHook(({ navigate }) => useMenuNavigation(navigate), { initialProps: { navigate: first } })
  hook.rerender({ navigate: second })
  act(() => executeCommand('menu'))
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledTimes(1)
  act(() => useScrollStore.getState().setPageProgress(PAGE_FLOW.structureEnd))
  act(() => {
    expect(executeCommand('menu')).toContain('Already in Menu')
    useScrollStore.getState().requestMenu()
  })
  expect(second).toHaveBeenCalledTimes(1)
  hook.unmount()
  useScrollStore.getState().setPageProgress(1)
  useScrollStore.getState().requestMenu()
  expect(second).toHaveBeenCalledTimes(1)
})
