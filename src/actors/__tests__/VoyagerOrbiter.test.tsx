import { afterEach, describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, PropertyBinding } from 'three'
import { FocusAnimationProvider, useFocusAnimation } from '../../r3f/FocusAnimationContext'
import type { FocusChannels } from '../../behaviors/useFocusTimeline'
import { sampleVoyagerOrbit, VOYAGER_ORBIT } from '../../behaviors/useVoyagerOrbit'
import { useScrollStore } from '../../stores/scrollStore'
import VoyagerOrbiter from '../VoyagerOrbiter'
import { createVoyagerAsset, VOYAGER_CORE_NODES } from '../assets/voyager'
import OrbitalRing from '../OrbitalRing'

const loader = vi.hoisted(() => ({ scene: null as unknown }))
vi.mock('@react-three/drei', () => ({ useGLTF: () => ({ scene: loader.scene }) }))
const config = { radius: 11, inclination: 0.38, eccentricity: 0.5, speed: 0.06, phase: 2 * Math.PI / 3 }
const initial = useScrollStore.getState()
afterEach(() => { useScrollStore.setState(initial, true); vi.restoreAllMocks() })

describe('Voyager 最外层巡航', () => {
  it('按 GLTFLoader 保留的原名定位核心，悬杆不影响中心也不进入点击白名单', () => {
    const source = new Group(), material = new MeshStandardMaterial()
    const core = new Mesh(new BoxGeometry(4, 2, 4), material)
    core.name = PropertyBinding.sanitizeNodeName(VOYAGER_CORE_NODES[0])
    core.userData.name = VOYAGER_CORE_NODES[0]; core.position.set(1, 2, 3)
    const boom = new Mesh(new BoxGeometry(0.1, 20, 0.1), material)
    boom.name = 'magnetometer-boom'; boom.position.set(1, 12, 3)
    source.add(core, boom)
    const asset = createVoyagerAsset(source, VOYAGER_ORBIT.size)
    try {
      expect(VOYAGER_ORBIT.size).toBeCloseTo(0.55 * 0.75)
      expect(asset.sourceCenter.toArray()).toEqual([1, 2, 3])
      expect(asset.center.length()).toBe(0)
      expect(asset.hitTargets.map(mesh => mesh.userData.name)).toEqual([VOYAGER_CORE_NODES[0]])
      expect(asset.radius).toBeGreaterThan(asset.hitRadius * 4)
      expect(core.parent).toBe(source)
    } finally { asset.dispose(); core.geometry.dispose(); boom.geometry.dispose(); material.dispose() }
  })

  it('轨迹闭合，切线与实际前进方向一致', () => {
    const p = new Vector3(), tangent = new Vector3(), next = new Vector3(), unused = new Vector3()
    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
      sampleVoyagerOrbit(config, angle, p, tangent)
      sampleVoyagerOrbit(config, angle - 1e-5, next, unused)
      expect(next.sub(p).normalize().dot(tangent)).toBeGreaterThan(0.99999)
      sampleVoyagerOrbit(config, angle + Math.PI * 2, next, unused)
      expect(next.distanceTo(p)).toBeLessThan(1e-10)
    }
  })

  it('模型跟随实际轨道进动且保持等比尺寸，支持冻结、聚焦淡化与独立资源释放', async () => {
    const source = new Group()
    const material = new MeshStandardMaterial({ color: '#888888' })
    const geometry = new BoxGeometry(4, 2, 1)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(2, 1, 0)
    source.add(mesh)
    loader.scene = source
    const originalGeometryDispose = vi.spyOn(geometry, 'dispose')
    const originalMaterialDispose = vi.spyOn(material, 'dispose')
    useScrollStore.setState({ scrollProgress: 1 })
    let channels!: FocusChannels
    function Observe() { channels = useFocusAnimation(); return null }
    const scene = (speedScale: number) => <FocusAnimationProvider><Observe />
      <OrbitalRing config={config} speedScale={speedScale}>
        <VoyagerOrbiter config={config} speedScale={speedScale} />
      </OrbitalRing>
    </FocusAnimationProvider>
    const renderer = await ReactThreeTestRenderer.create(scene(1))
    const ring = renderer.scene.children[0].instance
    const line = ring.children[0].children[0]
    const ship = ring.children[1]
    const modelRoot = ship.children[0]
    const cloneMaterial = (modelRoot.children[0].children[0] as Mesh).material as MeshStandardMaterial
    const dispose = vi.spyOn(cloneMaterial, 'dispose')
    try {
      for (const delta of [0, 1, 22.5, 45]) {
        await renderer.advanceFrames(1, delta)
        const onCircle = line.worldToLocal(ship.getWorldPosition(new Vector3()))
        expect(onCircle.z).toBeCloseTo(0, 8)
        expect(Math.hypot(onCircle.x, onCircle.y)).toBeCloseTo(config.radius, 8)
        const inward = ring.getWorldPosition(new Vector3()).sub(ship.getWorldPosition(new Vector3())).normalize()
        expect(new Vector3(0, 1, 0).transformDirection(ship.matrixWorld).dot(inward)).toBeGreaterThan(0.999999)
        const right = new Vector3().crossVectors(inward, new Vector3(0, 1, 0)).normalize()
        const up = new Vector3().crossVectors(right, inward).normalize()
        const boomDirection = new Vector3(0, 0, 1).transformDirection(ship.matrixWorld)
        expect(boomDirection.dot(right)).toBeLessThan(-0.7)
        expect(boomDirection.dot(up)).toBeGreaterThan(0.7)
        expect(modelRoot.scale.toArray()).toEqual([VOYAGER_ORBIT.size / 4, VOYAGER_ORBIT.size / 4, VOYAGER_ORBIT.size / 4])
      }
      const position = ship.getWorldPosition(new Vector3())
      await renderer.update(scene(0))
      await renderer.advanceFrames(1, 10)
      expect(ship.getWorldPosition(new Vector3()).distanceTo(position)).toBeLessThan(1e-9)
      channels.orbitVisibility[3] = 0.12
      await renderer.advanceFrames(1, 0)
      expect(cloneMaterial.opacity).toBeCloseTo(0.12)
      expect(cloneMaterial.depthWrite).toBe(false)
      channels.voyagerFocus = 1
      await renderer.advanceFrames(1, 0)
      expect(cloneMaterial.opacity).toBe(1)
      expect(material.opacity).toBe(1)
      expect(material.transparent).toBe(false)
      expect(mesh.parent).toBe(source)
      useScrollStore.setState({ scrollProgress: 0.5 })
      await renderer.advanceFrames(1, 0)
      expect(ship.visible).toBe(false)
    } finally { await renderer.unmount() }
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(originalGeometryDispose).not.toHaveBeenCalled()
    expect(originalMaterialDispose).not.toHaveBeenCalled()
    geometry.dispose(); material.dispose()
  })
})
