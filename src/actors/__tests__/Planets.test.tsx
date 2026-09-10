import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extend, useFrame } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Line, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { FocusAnimationProvider, useFocusAnimation } from '../../r3f/FocusAnimationContext'
import { StrictMode } from 'react'
import Act3ContentPhase from '../../acts/Act3ContentPhase'
import type { FocusChannels } from '../../behaviors/useFocusTimeline'
import Planets, { _mainPlanetIndices, _planetWorldPositions } from '../Planets'
import { useScrollStore } from '../../stores/scrollStore'
import { useRealtimeStore } from '../../stores/realtimeStore'
import { ORBIT_RADII, SCENE_CENTER_Z } from '../../r3f/ScrollRig'
import { PLANET_BASE_RADIUS } from '../assets/planet'
import { SATELLITE } from '../assets/satellitePlanet'
import { createPlanetCommandHandler } from '../../terminal/planetCommands'
import { PLANET_LINKS } from '../../types'

extend({ ThreeLine: Line })

const initialScroll = useScrollStore.getState()
const initialRealtime = useRealtimeStore.getState()

beforeEach(() => {
  useScrollStore.setState({ scrollProgress: 0, hoveredIdx: -1, focusedPlanetIdx: -1 })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) as unknown as CanvasRenderingContext2D)
  // 固定非顺序的粒子选择，防止同形模型掩盖资产与轨道索引错配。
  let seed = 42
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  useScrollStore.setState(initialScroll, true)
  useRealtimeStore.setState(initialRealtime, true)
})

// test-renderer 手动推进帧不会推进 Three.Clock，按调用方真实时钟契约供时。
function TestClock() {
  useFrame((state, delta) => { state.clock.elapsedTime += delta }, -100)
  return null
}

describe('主页行星类型', () => {
  it('业务事件驱动同一会话：同目标重入、切换、超时、场景退出及卸载清理', async () => {
    useScrollStore.setState({ scrollProgress: 1 })
    let channels!: FocusChannels
    function Observe() { channels = useFocusAnimation(); return null }
    const renderer = await ReactThreeTestRenderer.create(<StrictMode><FocusAnimationProvider>
      <TestClock /><Observe /><Planets /><Act3ContentPhase visible />
    </FocusAnimationProvider></StrictMode>)
    const frames = async (count: number) => {
      for (let f = 0; f < count; f++) await renderer.advanceFrames(1, 1 / 60)
    }
    try {
      await frames(1)
      const store = useScrollStore.getState()
      store.setFocusedPlanet(_mainPlanetIndices[1])
      await frames(60)
      expect(channels.mode).toBe('focus')
      expect(channels.track).toBe(1)
      expect(channels.camera).toBeGreaterThan(0)
      expect(channels.orbitFocus).toBeGreaterThan(0)
      const firstRevision = channels.revision
      store.setFocusedPlanet(_mainPlanetIndices[1])
      await frames(1)
      expect(channels.revision).toBeGreaterThan(firstRevision)
      expect(channels.elapsed).toBeLessThan(0.1)
      store.setFocusedPlanet(_mainPlanetIndices[2])
      await frames(1799)
      expect(useScrollStore.getState().focusedPlanetIdx).toBe(_mainPlanetIndices[2])
      await frames(2)
      expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
      expect(useScrollStore.getState().focusEvent).toEqual({ type: 'exit', reason: 'timeout' })
      expect(channels.mode).toBe('exit')
      await frames(330)
      expect(channels.mode).toBe('idle')
      store.setFocusedPlanet(_mainPlanetIndices[0])
      await frames(20)
      store.clearFocus()
      await frames(55)
      store.setFocusedPlanet(_mainPlanetIndices[1])
      await frames(10)
      expect(channels.mode).toBe('focus')
      expect(channels.track).toBe(1)
      useScrollStore.setState({ scrollProgress: 0.5 })
      await frames(1)
      expect(useScrollStore.getState().focusEvent).toEqual({ type: 'exit', reason: 'scene' })
      useScrollStore.setState({ scrollProgress: 1 })
      store.setFocusedPlanet(999)
      await frames(1)
      expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
    } finally { await renderer.unmount() }
    const revision = channels.revision
    useScrollStore.getState().setFocusedPlanet(_mainPlanetIndices[0])
    expect(channels.revision).toBe(revision)
  })

  it('随机粒子索引下仍按内、中、外轨道对应普通、卫星、带环模型及导航', async () => {
    const renderer = await ReactThreeTestRenderer.create(<FocusAnimationProvider><TestClock /><Planets /></FocusAnimationProvider>)
    try {
      const roots = renderer.scene.children[0].instance.children
      expect(roots.map(root => root.name)).toEqual(['行星 1', '带卫星行星 2', '带环行星 3'])
      expect(_mainPlanetIndices).not.toEqual([..._mainPlanetIndices].sort((a, b) => a - b))
      expect(roots.every(root => !root.visible)).toBe(true)
      await renderer.advanceFrames(1, 0.1)
      expect(roots.every(root => !root.visible)).toBe(true)
      useScrollStore.setState({ scrollProgress: 1 })
      await renderer.advanceFrames(1, 0.1)
      for (let track = 0; track < 3; track++) {
        const core = roots[track].getObjectByName(`planet_${track}`) as Mesh
        expect(roots[track].visible).toBe(true)
        expect(Math.hypot(core.position.x, core.position.z - SCENE_CENTER_Z)).toBeCloseTo(ORBIT_RADII[track])
        expect(core.position.distanceTo(_planetWorldPositions[track]!)).toBe(0)
        createPlanetCommandHandler(track, PLANET_LINKS[track])('focus')
        expect(useScrollStore.getState().focusedPlanetIdx).toBe(_mainPlanetIndices[track])
      }
      expect(roots[0].getObjectByName('卫星_0')).toBeUndefined()
      expect(roots[1].getObjectByName('卫星_1')).toBeDefined()
      expect(roots[2].getObjectByName('最外层淡环_2')).toBeDefined()
      useScrollStore.setState({ scrollProgress: 0.3 })
      await renderer.advanceFrames(1, 0.1)
      expect(roots.every(root => !root.visible)).toBe(true)
    } finally { await renderer.unmount() }
  })

  it('卫星随主体移动缩放且持续公转，环层跟随主体并随资产释放', async () => {
    useScrollStore.setState({ scrollProgress: 1 })
    const renderer = await ReactThreeTestRenderer.create(<FocusAnimationProvider><TestClock /><Planets /></FocusAnimationProvider>)
    const roots = renderer.scene.children[0].instance.children
    const core = roots[1].getObjectByName('planet_1') as Mesh
    const moon = roots[1].getObjectByName('卫星_1') as Mesh
    const ringCore = roots[2].getObjectByName('planet_2') as Mesh
    const rings = roots[2].children.filter(node => node.name.includes('环_2')) as Mesh[]
    const disposals = [moon, ...rings].flatMap(mesh => [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material as MeshStandardMaterial, 'dispose')])
    try {
      await renderer.advanceFrames(1, 0.1)
      const start = moon.position.clone().sub(core.position).normalize()
      const previousCore = core.position.clone()
      await renderer.advanceFrames(1, SATELLITE.period / 4)
      const offset = new Vector3().subVectors(moon.position, core.position)
      expect(core.position.distanceTo(previousCore)).toBeGreaterThan(0)
      expect(offset.length()).toBeCloseTo(PLANET_BASE_RADIUS * core.scale.x * SATELLITE.orbitRadius)
      expect(offset.normalize().dot(start)).toBeCloseTo(0)
      expect(moon.scale.x).toBe(core.scale.x)
      expect((moon.material as MeshStandardMaterial).opacity).toBe((core.material as MeshStandardMaterial).opacity)
      expect(rings).toHaveLength(4)
      for (const ring of rings) {
        expect(ring.position.equals(ringCore.position)).toBe(true)
        expect(ring.scale.equals(ringCore.scale)).toBe(true)
        expect((ring.material as MeshStandardMaterial).opacity).toBeGreaterThan(0)
        expect((ring.material as MeshStandardMaterial).opacity).toBeLessThanOrEqual(0.5)
      }
      useScrollStore.setState({ scrollProgress: 0.75 })
      await renderer.advanceFrames(1, 0.1)
      expect(moon.position.distanceTo(core.position)).toBeCloseTo(PLANET_BASE_RADIUS * core.scale.x * SATELLITE.orbitRadius)
      for (const ring of rings) expect(ring.position.equals(ringCore.position)).toBe(true)
    } finally { await renderer.unmount() }
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1)
  })
})
