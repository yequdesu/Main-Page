// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { gsap } from 'gsap'
import SystemStructureOverlay from '../SystemStructureOverlay'

afterEach(cleanup)

it('DOM 镜像支持直达 Menu、反向隐藏和 StrictMode，卸载释放所有 Timeline', () => {
  const before = gsap.globalTimeline.getChildren().length
  const back = vi.fn()
  const scene = (progress: number) => <StrictMode><SystemStructureOverlay progress={progress} onBack={back} /></StrictMode>
  const view = render(scene(1))
  const section = view.container.querySelector('section')!
  const button = view.getByRole('button', { name: '↑ 返回轨道视图' })
  expect(section.style.opacity).toBe('1')
  fireEvent.click(button)
  expect(back).toHaveBeenCalledOnce()
  view.rerender(scene(0.96))
  expect(Number(section.style.opacity)).toBeCloseTo(0.5)
  expect(button.tabIndex).toBe(-1)
  view.rerender(scene(0))
  expect(section.style.visibility).toBe('hidden')
  expect(section.getAttribute('aria-hidden')).toBe('true')
  view.rerender(scene(1))
  expect(section.style.opacity).toBe('1')
  expect(button.tabIndex).toBe(0)
  view.unmount()
  expect(gsap.globalTimeline.getChildren().length).toBe(before)
})
