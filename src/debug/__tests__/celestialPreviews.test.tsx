import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Box3, Mesh, MeshStandardMaterial, Sprite, TorusGeometry, Vector3 } from 'three'
import CentralStar from '../../actors/CentralStar'
import { CentralStarPreview, PlanetPreview, RingedPlanetPreview, SatellitePlanetPreview } from '../../models/CelestialPreviews'
import { createPlanetPreview, createRingedPlanetPreview, createSatellitePlanetPreview, createStarPreview } from '../../models/celestialPreview'
import { createRingedPlanetAsset } from '../../actors/assets/ringedPlanet'
import { createSatellitePlanetAsset, SATELLITE } from '../../actors/assets/satellitePlanet'
import { createPlanetHaloTexture, PLANET_BASE_RADIUS } from '../../actors/assets/planet'
import { useScrollStore } from '../../stores/scrollStore'
import { useRealtimeStore } from '../../stores/realtimeStore'
import { indexScene, localBounds } from '../studioModel'
import { createPreviewPlayback } from '../previewPlayback'

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

  it.each([PlanetPreview, RingedPlanetPreview, SatellitePlanetPreview])('行星组件 %s 播放、卸载均不污染主页轨道或交互 store', async (Preview) => {
    const scroll = useScrollStore.getState(), realtime = useRealtimeStore.getState()
    const preview = await ReactThreeTestRenderer.create(<Preview previewTime={() => 40} />)
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

  it.each([createPlanetPreview, createRingedPlanetPreview, createSatellitePlanetPreview])('行星 %s 响应光照，跨幕变色后暗面填充同步且不重建材质', (create) => {
    const asset = create()
    try {
      const core = asset.root.getObjectByName('planet_0') as Mesh
      expect(core.material).toBeInstanceOf(MeshStandardMaterial)
      const material = core.material as MeshStandardMaterial
      expect(material.emissiveIntensity).toBeGreaterThan(0)
      expect(material.emissiveIntensity).toBeLessThan(1)
      material.color.set('#c8a090')
      asset.update(4)
      expect(material.emissive.equals(material.color)).toBe(true)
      expect(core.material).toBe(material)
    } finally { asset.dispose() }
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
      ;(coreA.material as MeshStandardMaterial).wireframe = true
      a.update(20)
      expect(coreA.visible).toBe(false)
      expect(coreB.visible).toBe(true)
      expect((coreB.material as MeshStandardMaterial).wireframe).toBe(false)
    } finally { a.dispose(); b.dispose() }
  })

  it.each([createPlanetPreview, createRingedPlanetPreview, createSatellitePlanetPreview])('预览 %s 的光晕动画不改变取景，恒星远场柔光不缩小主体取景', (create) => {
    const planet = create(), star = createStarPreview()
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

  it('卫星按固定圆轨道绕核心运行，整圈回到初态且不覆盖隐藏状态', () => {
    const texture = createPlanetHaloTexture()
    const asset = createSatellitePlanetAsset(0, texture)
    try {
      asset.core.position.set(2, 3, 4)
      const update = (time: number) => asset.updateAppearance(time, 0, 20, 1, 1, 1.5)
      update(0)
      const start = asset.moon.position.clone().sub(asset.core.position)
      expect(start.length()).toBeCloseTo(PLANET_BASE_RADIUS * 20 * SATELLITE.orbitRadius)
      update(SATELLITE.period / 4)
      const quarter = asset.moon.position.clone().sub(asset.core.position)
      expect(quarter.length()).toBeCloseTo(start.length())
      expect(quarter.dot(start)).toBeCloseTo(0)
      asset.moon.visible = false
      update(SATELLITE.period)
      expect(asset.moon.position.clone().sub(asset.core.position).distanceTo(start)).toBeLessThan(1e-10)
      expect(asset.moon.visible).toBe(false)
      expect(asset.moon.scale.x).toBe(20)
      expect(asset.moon.material.opacity).toBe(1)
      expect(asset.moon.material.depthTest).toBe(true)
      expect(asset.moon.material.depthWrite).toBe(true)
    } finally { asset.dispose(); texture.dispose() }
  })

  it('卫星预览随时钟暂停、变速和归零，多视口同相位且完整轨道不越出取景框', () => {
    let now = 0
    const playback = createPreviewPlayback(() => now)
    const a = createSatellitePlanetPreview(), b = createSatellitePlanetPreview()
    const moonA = a.root.getObjectByName('卫星_0') as Mesh
    const moonB = b.root.getObjectByName('卫星_0') as Mesh
    try {
      const start = moonA.position.clone()
      playback.configure({ clip: 'orbit', playing: true, speed: 1 })
      now = 3; a.update(playback.time())
      expect(moonA.position.distanceTo(start)).toBeGreaterThan(0.1)
      playback.configure({ clip: 'orbit', playing: false, speed: 1 })
      const paused = moonA.position.clone()
      now = 7; a.update(playback.time())
      expect(moonA.position.equals(paused)).toBe(true)
      playback.configure({ clip: 'orbit', playing: true, speed: 2 })
      now = 8; a.update(playback.time()); b.update(5)
      expect(moonA.position.equals(moonB.position)).toBe(true)
      playback.configure({ clip: '', playing: false, speed: 2 })
      a.update(playback.time())
      expect(moonA.position.equals(start)).toBe(true)
      const bounds = localBounds(a.root)
      for (let i = 0; i <= 48; i++) {
        a.update(i * SATELLITE.period / 48)
        expect(bounds.containsBox(new Box3().setFromObject(a.root))).toBe(true)
        expect(localBounds(a.root).equals(bounds)).toBe(true)
      }
    } finally { a.dispose(); b.dispose() }
  })

  it('卫星可独立索引和显示，每个视口独占并释放卫星资源', () => {
    const a = createSatellitePlanetPreview(), b = createSatellitePlanetPreview()
    const moonA = a.root.getObjectByName('卫星_0') as Mesh
    const moonB = b.root.getObjectByName('卫星_0') as Mesh
    const geometry = vi.spyOn(moonA.geometry, 'dispose')
    const material = vi.spyOn(moonA.material as MeshStandardMaterial, 'dispose')
    const otherGeometry = vi.spyOn(moonB.geometry, 'dispose')
    try {
      expect([...indexScene(a.root).objects.values()]).toContain(moonA)
      expect(moonA.geometry).not.toBe(moonB.geometry)
      expect(moonA.material).not.toBe(moonB.material)
      moonA.visible = false
      a.update(3); b.update(3)
      expect(moonA.visible).toBe(false)
      expect(moonB.visible).toBe(true)
    } finally { a.dispose() }
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
    expect(otherGeometry).not.toHaveBeenCalled()
    b.dispose()
  })

  it('圆环面包围核心且有厚度，跟随缩放和位置，播放不会覆盖隐藏状态', () => {
    const texture = createPlanetHaloTexture()
    const asset = createRingedPlanetAsset(0, texture)
    try {
      expect(asset.ring.geometry).toBeInstanceOf(TorusGeometry)
      const vertices = asset.ring.geometry.getAttribute('position')
      const vertex = new Vector3()
      for (let i = 0; i < vertices.count; i++) {
        // 倾斜/压扁后也不与核心球面相交。
        expect(vertex.fromBufferAttribute(vertices, i).length()).toBeGreaterThan(PLANET_BASE_RADIUS)
      }
      const size = new Box3().setFromObject(asset.ring).getSize(new Vector3())
      expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(0)
      asset.core.position.set(2, 3, 4)
      asset.core.scale.setScalar(20)
      asset.ring.visible = false
      asset.outerRing.visible = false
      asset.updateAppearance(10, 0, 20, 1, 1, 2.4)
      expect(asset.ring.position.equals(asset.core.position)).toBe(true)
      expect(asset.ring.scale.equals(asset.core.scale)).toBe(true)
      expect(asset.ring.visible).toBe(false)
      expect(asset.ring.material.transparent).toBe(true)
      expect(asset.ring.material.opacity).toBe(0.5)
      expect(asset.ring.material.depthWrite).toBe(false)
      expect(asset.ring.material.depthTest).toBe(true)
      expect(asset.ring.renderOrder).toBeGreaterThan(asset.core.renderOrder)
      expect(asset.outerRing.position.equals(asset.core.position)).toBe(true)
      expect(asset.outerRing.scale.equals(asset.core.scale)).toBe(true)
      expect(asset.outerRing.visible).toBe(false)
      expect(asset.outerRing.material.opacity).toBe(0.25)
      expect(asset.outerRing.material.transparent).toBe(true)
      expect(asset.outerRing.material.depthWrite).toBe(false)
      expect(asset.outerRing.material.depthTest).toBe(true)
      asset.updateAppearance(10.5, 0, 20, 0.5, 1, 2.4)
      expect(asset.ring.material.opacity).toBe(0.25)
      expect(asset.outerRing.material.opacity).toBe(0.125)
      asset.updateAppearance(11, 0, 20, 0, 1, 2.4)
      expect(asset.ring.material.opacity).toBe(0)
      expect(asset.outerRing.material.opacity).toBe(0)
      expect(asset.ring.material.depthWrite).toBe(false)
    } finally { asset.dispose(); texture.dispose() }
  })

  it('内侧切分细环与窄缝，四层互不相交，向外颜色变浅且透明度递增', () => {
    const texture = createPlanetHaloTexture()
    const asset = createRingedPlanetAsset(0, texture)
    try {
      asset.updateAppearance(0, 0, 1, 1, 1, 1)
      const vertex = new Vector3()
      const rings = [asset.innerRing, asset.ring, asset.outerRing, asset.outermostRing]
      const bands = rings.map(ring => {
        const positions = ring.geometry.getAttribute('position')
        let min = Infinity, max = 0
        for (let i = 0; i < positions.count; i++) {
          const radius = vertex.fromBufferAttribute(positions, i).length()
          min = Math.min(min, radius)
          max = Math.max(max, radius)
        }
        return { min, max }
      })
      expect(bands[0].min).toBeGreaterThan(PLANET_BASE_RADIUS)
      // 切分前后保留原环带的内外边界。
      expect(bands[0].min / PLANET_BASE_RADIUS).toBeCloseTo(1.42)
      expect(bands[1].max / PLANET_BASE_RADIUS).toBeCloseTo(1.98)
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].min).toBeGreaterThan(bands[i - 1].max)
      }
      expect(bands[0].max - bands[0].min).toBeLessThan(bands[1].max - bands[1].min)
      expect(bands[1].min - bands[0].max).toBeLessThan(bands[2].min - bands[1].max)
      for (let i = 2; i < rings.length; i++) {
        expect(rings[i].material.opacity).toBeLessThan(rings[i - 1].material.opacity)
        const innerColor = rings[i - 1].material.color, outerColor = rings[i].material.color
        expect(outerColor.r).toBeGreaterThan(innerColor.r)
        expect(outerColor.g).toBeGreaterThan(innerColor.g)
        expect(outerColor.b).toBeGreaterThan(innerColor.b)
      }
      asset.innerRing.visible = false
      asset.outermostRing.visible = false
      asset.core.position.set(2, 3, 4)
      asset.updateAppearance(10, 0, 20, 0.5, 1, 2.4)
      expect(asset.innerRing.material.opacity).toBe(0.25)
      expect(asset.outermostRing.material.opacity).toBe(0.06)
      for (const ring of [asset.innerRing, asset.outermostRing]) {
        expect(ring.visible).toBe(false)
        expect(ring.position.equals(asset.core.position)).toBe(true)
        expect(ring.scale.x).toBe(20)
        expect(ring.material.depthWrite).toBe(false)
        expect(ring.material.depthTest).toBe(true)
        expect(ring.renderOrder).toBeGreaterThan(asset.core.renderOrder)
      }
    } finally { asset.dispose(); texture.dispose() }
  })

  it.each(['行星环_0', '外层行星环_0', '内侧细环_0', '最外层淡环_0'])('环面 %s 可独立索引，各视口独占并释放资源', (name) => {
    const a = createRingedPlanetPreview(), b = createRingedPlanetPreview()
    const ringA = a.root.getObjectByName(name) as Mesh<TorusGeometry, MeshStandardMaterial>
    const ringB = b.root.getObjectByName(name) as Mesh<TorusGeometry, MeshStandardMaterial>
    expect(indexScene(a.root).tree).toEqual(indexScene(b.root).tree)
    expect([...indexScene(a.root).objects.values()]).toContain(ringA)
    expect(ringA.geometry).not.toBe(ringB.geometry)
    expect(ringA.material).not.toBe(ringB.material)
    ringA.material.wireframe = true
    a.update(10)
    expect(ringB.material.wireframe).toBe(false)
    const ownGeometry = vi.spyOn(ringA.geometry, 'dispose')
    const ownMaterial = vi.spyOn(ringA.material, 'dispose')
    const otherGeometry = vi.spyOn(ringB.geometry, 'dispose')
    const otherMaterial = vi.spyOn(ringB.material, 'dispose')
    a.dispose()
    expect(ownGeometry).toHaveBeenCalledTimes(1)
    expect(ownMaterial).toHaveBeenCalledTimes(1)
    expect(otherGeometry).not.toHaveBeenCalled()
    expect(otherMaterial).not.toHaveBeenCalled()
    b.dispose()
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
