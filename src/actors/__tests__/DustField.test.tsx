import { afterEach, describe, expect, it } from 'vitest'
import { StrictMode } from 'react'
import { useFrame } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Color, Matrix4, Vector3 } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import DustField from '../DustField'
import { getThemeBlend, setThemeBlend } from '../../r3f/ScrollRig'
import { themeColor } from '../../theme/colors'
import { ASTEROID_BELT } from '../../behaviors/asteroidBelt'
import { FocusAnimationProvider } from '../../r3f/FocusAnimationContext'
import { useScrollStore } from '../../stores/scrollStore'
import { useRealtimeStore } from '../../stores/realtimeStore'

const initialThemeBlend = getThemeBlend()
const initialScroll = useScrollStore.getState(), initialRealtime = useRealtimeStore.getState()
afterEach(() => { setThemeBlend(initialThemeBlend); useScrollStore.setState(initialScroll, true); useRealtimeStore.setState(initialRealtime, true) })
function Clock() { useFrame((state, delta) => { state.clock.elapsedTime += delta }, -100); return null }

describe('DustField 场景接入', () => {
  it.each([0, 1])('主题混合 %i：入场增强对比且亮点稳定，巡航恢复巡航色并维持 92% 不透明度', async theme => {
    setThemeBlend(theme)
    useScrollStore.setState({ scrollProgress: 1 })
    const renderer = await ReactThreeTestRenderer.create(<FocusAnimationProvider><Clock /><DustField /></FocusAnimationProvider>)
    const mesh = renderer.scene.children[0].instance as InstancedMesh2
    const frames = async (n: number) => { for (let i = 0; i < n; i++) await renderer.advanceFrames(1, 1 / 60) }
    const luminance = (c: Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
    const baseline = new Color(themeColor('asteroidCruise', theme === 0 ? 'night' : 'day'))
    try {
      await frames(36)
      const high = Array.from({ length: 24 }, (_, i) => mesh.getColorAt(i).clone())
      for (const c of high) {
        if (theme === 0) expect(luminance(c)).toBeGreaterThan(luminance(baseline) * 2)
        else expect(luminance(c)).toBeLessThan(luminance(baseline) * 0.6)
      }
      expect(new Set(high.map(c => c.r)).size).toBeGreaterThan(12)
      expect(mesh.getOpacityAt(1)).toBeCloseTo(0.92, 5)
      await frames(36)
      high.forEach((c, i) => expect(mesh.getColorAt(i).equals(c)).toBe(true))
      // 跟随共享主题渐变，途中颜色处于两个端点之间，不新建主题时钟。
      setThemeBlend(0.5)
      await frames(1)
      const middle = mesh.getColorAt(1).clone()
      const night = new Color(themeColor('asteroidEntry', 'night'))
      const day = new Color(themeColor('asteroidEntry', 'day'))
      expect(luminance(middle)).toBeGreaterThan(luminance(day) * 1.1)
      expect(luminance(middle)).toBeLessThan(luminance(night) * 0.9)
      setThemeBlend(theme)
      await frames(180)
      for (let i = 0; i < 24; i++) {
        const c = mesh.getColorAt(i)
        expect(c.r).toBeCloseTo(baseline.r, 6)
        expect(c.g).toBeCloseTo(baseline.g, 6)
        expect(c.b).toBeCloseTo(baseline.b, 6)
      }
      expect(mesh.getOpacityAt(1)).toBeCloseTo(0.92, 5)
    } finally { await renderer.unmount() }
  })

  it('停止滚动后仍完成入场，全部实例进入环带，前幕与 Menu 往返保留正确阶段', async () => {
    useScrollStore.setState({ scrollProgress: 0.8 })
    const renderer = await ReactThreeTestRenderer.create(<StrictMode><FocusAnimationProvider><Clock /><DustField /></FocusAnimationProvider></StrictMode>)
    const mesh = renderer.scene.children[0].instance as InstancedMesh2
    const matrix = new Matrix4(), p = new Vector3()
    const frames = async (n: number) => { for (let i = 0; i < n; i++) await renderer.advanceFrames(1, 1 / 60) }
    const radii = () => Array.from({ length: ASTEROID_BELT.count }, (_, i) => {
      mesh.getMatrixAt(i, matrix)
      p.setFromMatrixPosition(matrix)
      return Math.hypot(p.x, p.z + 16)
    })
    try {
      await frames(1)
      expect(useRealtimeStore.getState().debrisCount).toBe(ASTEROID_BELT.legacyCount)
      expect(mesh.getOpacityAt(ASTEROID_BELT.legacyCount)).toBe(0)
      // 滚动准备阶段先遍布全周，随后高速段接入时位置连续。
      useScrollStore.setState({ scrollProgress: 0.939999 })
      await frames(1)
      const previous = mesh.getMatrixAt(0, matrix).clone()
      const quadrants = [0, 0, 0, 0]
      for (let i = 0; i < ASTEROID_BELT.count; i++) {
        p.setFromMatrixPosition(mesh.getMatrixAt(i, matrix))
        quadrants[(p.x > 0 ? 1 : 0) + (p.z > -16 ? 2 : 0)]++
      }
      expect(Math.min(...quadrants)).toBeGreaterThan(65)
      useScrollStore.setState({ scrollProgress: 1 })
      await frames(1)
      p.setFromMatrixPosition(mesh.getMatrixAt(0, matrix))
      expect(p.distanceTo(new Vector3().setFromMatrixPosition(previous))).toBeLessThan(0.1)
      expect(mesh.getOpacityAt(ASTEROID_BELT.legacyCount)).toBeGreaterThan(0)
      await frames(300)
      for (const r of radii()) { expect(r).toBeGreaterThan(6.6); expect(r).toBeLessThan(7.8) }
      expect(useRealtimeStore.getState().debrisCount).toBe(ASTEROID_BELT.count)
      useScrollStore.getState().setPageProgress(1.42)
      await frames(60)
      useScrollStore.getState().setPageProgress(1)
      await frames(1)
      for (const r of radii()) { expect(r).toBeGreaterThan(6.6); expect(r).toBeLessThan(7.8) }
      useScrollStore.setState({ scrollProgress: 0.75 })
      await frames(1)
      expect(radii().some(r => r > 9)).toBe(true)
      expect(mesh.getOpacityAt(ASTEROID_BELT.legacyCount)).toBe(0)
      useScrollStore.setState({ scrollProgress: 1 })
      await frames(300)
      for (const r of radii()) { expect(r).toBeGreaterThan(6.6); expect(r).toBeLessThan(7.8) }
    } finally { await renderer.unmount() }
  })
})
