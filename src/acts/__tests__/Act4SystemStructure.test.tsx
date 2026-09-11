import { afterEach, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useFrame } from '@react-three/fiber'
import { Mesh, Vector3, type Material, type Points, type BufferGeometry, type ShaderMaterial } from 'three'
import Act4SystemStructure from '../Act4SystemStructure'
import { PLANET_RING } from '../../actors/assets/ringedPlanet'
import { useScrollStore } from '../../stores/scrollStore'

const initial = useScrollStore.getState()
afterEach(() => { useScrollStore.setState(initial, true); vi.restoreAllMocks() })

function TestClock() {
  useFrame((state, delta) => { state.clock.elapsedTime += delta }, -100)
  return null
}

it('结构图只显示自身图层，主体固定排列，卫星继续公转，显隐不重建，卸载释放资源', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) as unknown as CanvasRenderingContext2D)
  useScrollStore.getState().setPageProgress(1.22)
  const scene = (visible: boolean) => <><TestClock /><Act4SystemStructure visible={visible} /></>
  const renderer = await ReactThreeTestRenderer.create(scene(true))
  const root = renderer.scene.children[0].instance
  const planets = [0, 1, 2].map(i => root.getObjectByName(`planet_${i}`) as Mesh)
  const moon = root.getObjectByName('卫星_1') as Mesh
  const star = root.getObjectByName('恒星核心') as Mesh
  const radiation = root.getObjectByName('日面背景逸散微光') as Points<BufferGeometry, ShaderMaterial>
  const disposeRadiation = vi.spyOn(radiation.geometry, 'dispose')
  const disposeRadiationMaterial = vi.spyOn(radiation.material, 'dispose')
  const seeds = radiation.geometry.getAttribute('position').array
  expect(radiation.material.depthWrite).toBe(false)
  expect(radiation.material.depthTest).toBe(true)
  expect(star.geometry.type).toBe('SphereGeometry')
  for (const name of ['内层光晕', '近场柔光', '远场柔光']) expect(root.getObjectByName(name)).toBeDefined()
  const disposeStar = vi.spyOn(star.geometry, 'dispose')
  const dispose = vi.spyOn(moon.geometry, 'dispose')
  const disposeMaterial = vi.spyOn(moon.material as Material, 'dispose')
  const centers = planets.map(planet => planet.parent!.position.clone())
  root.traverse(object => expect(object.layers.mask).toBe(2))
  expect(centers[0].x).toBeLessThan(centers[1].x)
  expect(centers[1].x).toBeLessThan(centers[2].x)
  try {
    // TestRenderer 不自动推进 elapsedTime，TestClock 按帧间隔供时。
    await renderer.advanceFrames(1, 0.016)
    const start = moon.position.clone()
    const ringedRotation = planets[2].quaternion.clone()
    const ring = root.getObjectByName('行星环_2') as Mesh
    const tilt = PLANET_RING.tiltDegrees * Math.PI / 180
    const normal = new Vector3(Math.sin(tilt), Math.cos(tilt), 0)
    const previousNormal = normal.clone().applyQuaternion(ring.quaternion)
    const radiationTime = radiation.material.uniforms.uTime.value
    await renderer.advanceFrames(1, 4)
    expect(radiation.material.uniforms.uTime.value - radiationTime).toBeCloseTo(4)
    expect(radiation.geometry.getAttribute('position').array).toBe(seeds)
    expect(moon.position.distanceTo(start)).toBeGreaterThan(0.1)
    expect(planets[2].quaternion.angleTo(ringedRotation)).toBeCloseTo(4 * 0.07 / 0.7)
    expect(normal.clone().applyQuaternion(ring.quaternion).distanceTo(previousNormal)).toBeGreaterThan(0.1)
    planets.forEach((planet, i) => expect(planet.parent!.position.equals(centers[i])).toBe(true))
    await renderer.update(scene(false))
    expect(renderer.scene.children[0].instance).toBe(root)
    expect(root.visible).toBe(false)
    expect(dispose).not.toHaveBeenCalled()
    await renderer.update(scene(true))
    expect(root.visible).toBe(true)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
  } finally { await renderer.unmount() }
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(disposeMaterial).toHaveBeenCalledTimes(1)
  expect(disposeStar).toHaveBeenCalledTimes(1)
  expect(disposeRadiation).toHaveBeenCalledTimes(1)
  expect(disposeRadiationMaterial).toHaveBeenCalledTimes(1)
})
