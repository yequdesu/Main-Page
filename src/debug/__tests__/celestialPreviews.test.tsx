import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Box3, Mesh, MeshBasicMaterial, Sprite, Vector3 } from 'three'
import CentralStar from '../../actors/CentralStar'
import { CentralStarPreview, PlanetPreview } from '../../models/CelestialPreviews'
import { createPlanetPreview, createStarPreview } from '../../models/celestialPreview'
import { useScrollStore } from '../../stores/scrollStore'
import { useRealtimeStore } from '../../stores/realtimeStore'
import { indexScene, localBounds } from '../studioModel'

beforeEach(() => {
  // JSDOM 没有 2D Canvas；只替代纹理绘制，保留真实 Three.js 几何体/材质/场景。
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) as unknown as CanvasRenderingContext2D)
})
afterEach(() => vi.restoreAllMocks())

describe('程序化资产独立预览', () => {
  it('主页恒星保留滚动显隐；预览在进度为零时完整显示且不更新主页状态', async () => {
    const previous = useScrollStore.getState().scrollProgress
    useScrollStore.setState({ scrollProgress: 0 })
    const main = await ReactThreeTestRenderer.create(<CentralStar />)
    const preview = await ReactThreeTestRenderer.create(<CentralStarPreview previewTime={() => 3} />)
    try {
      const mainRoot = main.scene.children[0].instance
      const previewRoot = preview.scene.children[0].instance
      await main.advanceFrames(1, 0.016)
      await preview.advanceFrames(1, 0.016)
      expect(mainRoot.visible).toBe(false)
      expect(previewRoot.visible).toBe(true)
      expect((previewRoot.getObjectByName('近场柔光') as Sprite).material.opacity).toBeGreaterThan(0)
      useScrollStore.setState({ scrollProgress: 1 })
      const scroll = useScrollStore.getState(), realtime = useRealtimeStore.getState()
      await main.advanceFrames(1, 0.016)
      await preview.advanceFrames(1, 0.016)
      expect(mainRoot.visible).toBe(true)
      expect(previewRoot.position.toArray()).toEqual([0, 0, 0])
      expect(useScrollStore.getState()).toBe(scroll)
      expect(useRealtimeStore.getState()).toBe(realtime)
    } finally {
      await main.unmount()
      await preview.unmount()
      useScrollStore.setState({ scrollProgress: previous })
    }
  })

  it('单颗行星组件播放、卸载均不污染主页轨道或交互 store', async () => {
    const scroll = useScrollStore.getState(), realtime = useRealtimeStore.getState()
    const preview = await ReactThreeTestRenderer.create(<PlanetPreview previewTime={() => 40} />)
    await preview.advanceFrames(3, 0.016)
    await preview.unmount()
    expect(useScrollStore.getState()).toBe(scroll)
    expect(useRealtimeStore.getState()).toBe(realtime)
  })

  it('实例挂载后报告就绪，播放时间改变不会重建节点或重复索引', async () => {
    const onAssetReady = vi.fn()
    const preview = await ReactThreeTestRenderer.create(<PlanetPreview onAssetReady={onAssetReady} previewTime={() => 0} />)
    try {
      const root = preview.scene.children[0].instance
      expect(onAssetReady).toHaveBeenCalledTimes(1)
      await preview.update(<PlanetPreview onAssetReady={onAssetReady} previewTime={() => 8} />)
      await preview.advanceFrames(1, 0.016)
      expect(preview.scene.children[0].instance).toBe(root)
      expect(onAssetReady).toHaveBeenCalledTimes(1)
    } finally { await preview.unmount() }
  })

  it('仅创建一颗完整行星，多视口拥有独立材质和显示状态', () => {
    const a = createPlanetPreview(), b = createPlanetPreview()
    try {
      a.update(2); a.update(5); a.update(10)
      b.update(10)
      expect(indexScene(a.root).tree).toEqual(indexScene(b.root).tree)
      expect(a.root.children.map(child => child.name)).toEqual(['planet_0', 'glow_0', 'atmos_0', 'halo_0'])
      const coreA = a.root.getObjectByName('planet_0') as Mesh
      const coreB = b.root.getObjectByName('planet_0') as Mesh
      expect(coreA.position.toArray()).toEqual([0, 0, 0])
      expect(coreA.geometry).not.toBe(coreB.geometry)
      expect(coreA.material).not.toBe(coreB.material)
      expect((a.root.getObjectByName('halo_0') as Sprite).material.opacity)
        .toBe((b.root.getObjectByName('halo_0') as Sprite).material.opacity)
      coreA.visible = false
      ;(coreA.material as MeshBasicMaterial).wireframe = true
      a.update(20)
      expect(coreA.visible).toBe(false)
      expect(coreB.visible).toBe(true)
      expect((coreB.material as MeshBasicMaterial).wireframe).toBe(false)
    } finally { a.dispose(); b.dispose() }
  })

  it('光晕动画不改变主体取景，恒星远场柔光不缩小主体取景', () => {
    const planet = createPlanetPreview(), star = createStarPreview()
    try {
      const bounds = localBounds(planet.root)
      for (const time of [0, 10, 50, 100, 500]) {
        planet.update(time)
        expect(bounds.containsBox(new Box3().setFromObject(planet.root))).toBe(true)
        expect(localBounds(planet.root).equals(bounds)).toBe(true)
      }
      const extent = localBounds(star.root).getSize(new Vector3())
      expect(extent.x).toBe(5.5)
      expect((star.root.getObjectByName('远场柔光') as Sprite).scale.x).toBeGreaterThan(extent.x)
    } finally { planet.dispose(); star.dispose() }
  })

  it('释放一个视口的资产时不释放另一个实例或 Three.js 共享 Sprite 几何体', () => {
    const a = createPlanetPreview(), b = createPlanetPreview()
    const coreA = a.root.getObjectByName('planet_0') as Mesh
    const coreB = b.root.getObjectByName('planet_0') as Mesh
    const haloA = a.root.getObjectByName('halo_0') as Sprite
    const haloB = b.root.getObjectByName('halo_0') as Sprite
    const ownGeometry = vi.spyOn(coreA.geometry, 'dispose')
    const ownTexture = vi.spyOn(haloA.material.map!, 'dispose')
    const otherGeometry = vi.spyOn(coreB.geometry, 'dispose')
    const otherTexture = vi.spyOn(haloB.material.map!, 'dispose')
    const spriteGeometry = vi.spyOn(haloA.geometry, 'dispose')
    a.dispose()
    expect(ownGeometry).toHaveBeenCalledTimes(1)
    expect(ownTexture).toHaveBeenCalledTimes(1)
    expect(otherGeometry).not.toHaveBeenCalled()
    expect(otherTexture).not.toHaveBeenCalled()
    expect(spriteGeometry).not.toHaveBeenCalled()
    b.dispose()
  })
})
