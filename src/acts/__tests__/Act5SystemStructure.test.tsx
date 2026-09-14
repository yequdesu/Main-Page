import { afterEach, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { useFrame } from '@react-three/fiber'
import { Mesh, Vector3, type Material, type Points, type BufferGeometry, type ShaderMaterial } from 'three'
import Act5SystemStructure from '../Act5SystemStructure'
import CentralStar from '../../actors/CentralStar'
import Act4StellarTransition from '../Act4StellarTransition'
import { StellarTransitionProvider } from '../../r3f/StellarTransitionContext'
import { PAGE_FLOW } from '../../types'
import { PLANET_RING } from '../../actors/assets/ringedPlanet'
import { useScrollStore } from '../../stores/scrollStore'

const initial = useScrollStore.getState()
const testCameraPosition = new Vector3()
afterEach(() => { useScrollStore.setState(initial, true); vi.restoreAllMocks() })

function TestClock() {
  useFrame((state, delta) => { state.clock.elapsedTime += delta; testCameraPosition.copy(state.camera.position) }, -100)
  return null
}

it('结构图只显示自身图层，主体固定排列，卫星继续公转，显隐不重建，卸载释放资源', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) as unknown as CanvasRenderingContext2D)
  useScrollStore.getState().setPageProgress(PAGE_FLOW.structureEnd)
  const scene = (visible: boolean) => <StellarTransitionProvider><TestClock /><Act4StellarTransition /><CentralStar /><Act5SystemStructure visible={visible} /></StellarTransitionProvider>
  const renderer = await ReactThreeTestRenderer.create(scene(true))
  await renderer.advanceFrames(1, 0.016)
  const root = renderer.scene.children.find(child => child.instance.name === 'Act 5 · Menu')!.instance
  const sharedStar = renderer.scene.children.find(child => child.instance.name === '中央恒星')!.instance
  const planets = [0, 1, 2].map(i => root.getObjectByName(`planet_${i}`) as Mesh)
  const moon = root.getObjectByName('卫星_1') as Mesh
  const star = sharedStar.getObjectByName('恒星核心') as Mesh
  expect(root.getObjectByName('恒星核心')).toBeUndefined()
  const radiation = root.getObjectByName('日面背景逸散微光') as Points<BufferGeometry, ShaderMaterial>
  const ejection = root.getObjectByName('日冕抛射弧丝') as Mesh<BufferGeometry, ShaderMaterial>
  const ejectionParticles = root.getObjectByName('日冕抛射金色粒子') as Mesh<BufferGeometry, ShaderMaterial>
  const tailParticles = root.getObjectByName('CME 长寿命尾迹') as Mesh<BufferGeometry, ShaderMaterial>
  expect(root.getObjectByName('重联后上升磁通')).toBeDefined()
  const disposePaths = vi.spyOn(ejection.material.uniforms.uCurves.value, 'dispose')
  const disposeRibbons = vi.spyOn(ejection.geometry, 'dispose')
  const disposeEjection = vi.spyOn(ejection.material, 'dispose')
  const disposeParticles = vi.spyOn(ejectionParticles.geometry, 'dispose')
  const disposeParticleMaterial = vi.spyOn(ejectionParticles.material, 'dispose')
  const disposeTail = vi.spyOn(tailParticles.geometry, 'dispose')
  const disposeTailMaterial = vi.spyOn(tailParticles.material, 'dispose')
  const disposeRadiation = vi.spyOn(radiation.geometry, 'dispose')
  const disposeRadiationMaterial = vi.spyOn(radiation.material, 'dispose')
  const seeds = radiation.geometry.getAttribute('position').array
  expect(radiation.material.depthWrite).toBe(false)
  expect(radiation.material.depthTest).toBe(true)
  expect(star.geometry.type).toBe('SphereGeometry')
  for (const name of ['内层光晕', '近场柔光', '远场柔光']) expect(sharedStar.getObjectByName(name)).toBeDefined()
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
    expect(renderer.scene.children.find(child => child.instance.name === root.name)!.instance).toBe(root)
    expect(root.visible).toBe(false)
    expect(dispose).not.toHaveBeenCalled()
    const activityAge = ejection.material.uniforms.uAge.value
    await renderer.advanceFrames(3, 0.016)
    expect(ejection.material.uniforms.uAge.value).toBe(activityAge)
    await renderer.update(scene(true))
    expect(root.visible).toBe(true)
    await renderer.advanceFrames(1, 0.016)
    expect(ejection.material.uniforms.uAge.value).toBeGreaterThan(activityAge)
    // 镜头往返只连续更新环带参考系，不换事件、不从 age=0 重播。
    const activity = root.getObjectByName('日珥与日冕抛射')!
    const u = ejection.material.uniforms, seed = u.uSeed.value, paths = u.uCurves.value
    let age = u.uAge.value
    for (const page of [1.12, 1.16, 1.20, 1.31, 1.42, 1.16]) {
      useScrollStore.getState().setPageProgress(page)
      await renderer.advanceFrames(1, 0.016)
      expect(activity.visible).toBe(true)
      expect(u.uAge.value).toBeGreaterThan(age)
      expect(u.uSeed.value).toBe(seed)
      expect(u.uCurves.value).toBe(paths)
      if (page === 1.12) {
        expect(u.uBundleResolve.value).toBeCloseTo(0)
        expect(u.uParcelGain.value).toBeCloseTo(1)
      }
      if (page === 1.16) expect(u.uBundleResolve.value).toBeCloseTo(0.5)
      if (page >= 1.20) expect(u.uBundleResolve.value).toBe(1)
      if (page === 1.12) expect(u.uRibbonMinPixels.value).toBeCloseTo(0.55)
      if (page === 1.16) expect(u.uRibbonMinPixels.value).toBeCloseTo(0.725)
      if (page >= 1.20) expect(u.uRibbonMinPixels.value).toBeCloseTo(0.90)
      // 锚点始终位于实际相机的轮廓切圆，而非日面正面。
      const worldAnchor = u.uAnchor.value.clone().multiplyScalar(root.scale.x).add(root.position)
      expect(worldAnchor.distanceTo(sharedStar.position)).toBeCloseTo(0.42 * sharedStar.scale.x, 8)
      expect(testCameraPosition.clone().sub(worldAnchor).dot(u.uNormal.value)).toBeCloseTo(0, 8)
      age = u.uAge.value
    }
    useScrollStore.getState().setPageProgress(1)
    const pausedAge = ejection.material.uniforms.uAge.value
    await renderer.advanceFrames(3, 0.016)
    expect(ejection.material.uniforms.uAge.value).toBe(pausedAge)
    expect(sharedStar.position.distanceTo(new Vector3(0, -1, -16))).toBeLessThan(1e-9)
    expect(sharedStar.scale.x).toBe(1)
    expect(sharedStar.getObjectByName('恒星核心')).toBe(star)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
  } finally { await renderer.unmount() }
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(disposeMaterial).toHaveBeenCalledTimes(1)
  expect(disposeStar).toHaveBeenCalledTimes(1)
  expect(disposeRadiation).toHaveBeenCalledTimes(1)
  expect(disposeRadiationMaterial).toHaveBeenCalledTimes(1)
  expect(disposePaths).toHaveBeenCalledTimes(1)
  expect(disposeRibbons).toHaveBeenCalledTimes(1)
  expect(disposeEjection).toHaveBeenCalledTimes(1)
  expect(disposeParticles).toHaveBeenCalledTimes(1)
  expect(disposeParticleMaterial).toHaveBeenCalledTimes(1)
  expect(disposeTail).toHaveBeenCalledTimes(1)
  expect(disposeTailMaterial).toHaveBeenCalledTimes(1)
})
