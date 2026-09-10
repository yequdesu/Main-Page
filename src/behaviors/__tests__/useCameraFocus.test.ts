import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFocusPoseCalculator, focusFieldOfView } from '../focusPose'
import { createCameraFocusController } from '../useCameraFocus'
import { useScrollStore } from '../../stores/scrollStore'
import { SCENE_CENTER_Z } from '../../r3f/ScrollRig'

const initialStore = useScrollStore.getState()
const globalPosition = new Vector3(0, 0.25, 8)
const globalLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const planets = [new Vector3(4, -1, SCENE_CENTER_Z), new Vector3(-5, -1, SCENE_CENTER_Z)]
const getPlanet = (idx: number) => planets[idx] ?? null
const resetCamera = (camera: PerspectiveCamera) => {
  camera.position.copy(globalPosition)
  camera.lookAt(globalLookAt)
}

beforeEach(() => useScrollStore.getState().clearFocus())
afterEach(() => useScrollStore.setState(initialStore, true))

describe('相机聚焦会话', () => {
  it('从抬高位置开始缓慢抬升，保留相对行星的距离与 1.25 倍距离比例', () => {
    const pose = createFocusPoseCalculator()
    const position = new Vector3(), lookAt = new Vector3()
    for (const scale of [1, 1.25]) {
      pose(planets[0], 0, scale, position, lookAt)
      const initialHeight = position.y
      expect(initialHeight).toBeGreaterThan(0.5)
      expect(position.distanceTo(planets[0])).toBeCloseTo(Math.hypot(2.5, 2.2) * scale, 10)
      pose(planets[0], 30, scale, position, lookAt)
      expect(position.y - initialHeight).toBeGreaterThan(0)
      expect(position.y - initialHeight).toBeLessThan(0.3)
    }
  })

  it('窄屏聚焦调整视野，退出后恢复原始视野', () => {
    const update = createCameraFocusController()
    const camera = new PerspectiveCamera(40, 390 / 844)
    resetCamera(camera)
    useScrollStore.getState().setFocusedPlanet(0)
    for (let f = 0; f < 600; f++) update(camera, 1, f / 60, getPlanet)
    expect(camera.fov).toBeCloseTo(focusFieldOfView(camera.aspect, 40), 5)
    useScrollStore.getState().clearFocus()
    for (let f = 600; f < 1200; f++) update(camera, 1, f / 60, getPlanet)
    expect(camera.fov).toBeCloseTo(40, 5)
  })

  it('R3F 时间为零时也能开始计时，满 30 秒退出并平滑回到全局姿态', () => {
    const update = createCameraFocusController()
    const camera = new PerspectiveCamera()
    resetCamera(camera)
    useScrollStore.getState().setFocusedPlanet(0)
    expect(useScrollStore.getState().focusStartTime).toBeNull()
    update(camera, 1, 0, getPlanet)
    expect(useScrollStore.getState().focusStartTime).toBe(0)
    for (let frame = 1; frame <= 1799; frame++) update(camera, 1, frame / 60, getPlanet)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(0)
    expect(camera.position.distanceTo(globalPosition)).toBeGreaterThan(5)
    const beforeReturn = camera.position.clone()
    update(camera, 1, 30, getPlanet)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
    expect(useScrollStore.getState().focusStartTime).toBeNull()
    expect(camera.position.distanceTo(beforeReturn)).toBeLessThan(0.1)
    for (let frame = 1801; frame <= 2400; frame++) update(camera, 1, frame / 60, getPlanet)
    expect(camera.position.distanceTo(globalPosition)).toBeLessThan(1e-6)
    const direction = camera.getWorldDirection(new Vector3())
    expect(direction.distanceTo(globalLookAt.clone().sub(globalPosition).normalize())).toBeLessThan(1e-6)
  })

  it('上一轮的环绕相位不会泄漏到再次聚焦同一行星', () => {
    const reused = createCameraFocusController()
    const camera = new PerspectiveCamera()
    resetCamera(camera)
    useScrollStore.getState().setFocusedPlanet(0)
    for (let frame = 0; frame <= 900; frame++) reused(camera, 1, frame / 60, getPlanet)
    expect(Math.abs(camera.position.y + 1)).toBeGreaterThan(0.1)
    // 在下一轮之前退回全局；恢复同一初始姿态比较轨迹，检验相位和缓存是否归零。
    useScrollStore.getState().clearFocus()
    reused(camera, 1, 60 - 1 / 60, getPlanet)
    const path = (update: ReturnType<typeof createCameraFocusController>, start: number) => {
      resetCamera(camera)
      useScrollStore.getState().setFocusedPlanet(0)
      const positions: Vector3[] = []
      for (let frame = 0; frame <= 120; frame++) {
        update(camera, 1, start + frame / 60, getPlanet)
        positions.push(camera.position.clone())
      }
      expect(useScrollStore.getState().focusStartTime).toBe(start)
      return positions
    }
    const repeated = path(reused, 60)
    const first = path(createCameraFocusController(), 0)
    first.forEach((position, i) => expect(position.distanceTo(repeated[i])).toBeLessThan(1e-9))
  })

  it('同目标新请求、切换目标都重置计时，退出场景或目标失效立即取消', () => {
    const update = createCameraFocusController()
    const camera = new PerspectiveCamera()
    resetCamera(camera)
    const store = useScrollStore.getState()
    store.setFocusedPlanet(0)
    update(camera, 1, 10, getPlanet)
    update(camera, 1, 35, getPlanet)
    store.setFocusedPlanet(0)
    update(camera, 1, 36, getPlanet)
    expect(useScrollStore.getState().focusStartTime).toBe(36)
    store.setFocusedPlanet(1)
    update(camera, 1, 39, getPlanet)
    update(camera, 1, 66, getPlanet)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(1)
    expect(useScrollStore.getState().focusStartTime).toBe(39)
    update(camera, 1, 69, getPlanet)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
    store.setFocusedPlanet(1)
    update(camera, 1, 70, getPlanet)
    update(camera, 0.5, 71, getPlanet)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
    store.setFocusedPlanet(99)
    update(camera, 1, 72, getPlanet)
    expect(useScrollStore.getState().focusedPlanetIdx).toBe(-1)
  })
})
