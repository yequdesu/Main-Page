import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFocusPoseCalculator, focusFieldOfView, focusOrbitPhase } from '../focusPose'
import { createCameraFocusController } from '../useCameraFocus'
import { createFocusChannels, createFocusTimeline } from '../useFocusTimeline'
import { SCENE_CENTER_Z } from '../../r3f/ScrollRig'

const globalPosition = new Vector3(0, 0.25, 8)
const globalLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const planets = [new Vector3(4, -1, SCENE_CENTER_Z), new Vector3(-5, -1, SCENE_CENTER_Z)]

describe('时间轴驱动相机聚焦', () => {
  it('飞行器巡航全过程从右上方朝恒星取景，主体在左下且横竖屏容纳完整包围球', () => {
    const star = new Vector3(0, -1, SCENE_CENTER_Z)
    for (const aspect of [16 / 9, 755 / 871, 390 / 844]) {
      const camera = new PerspectiveCamera(40, aspect)
      const channels = createFocusChannels()
      Object.assign(channels, { mode: 'focus', target: 'voyager', camera: 1 })
      const update = createCameraFocusController()
      const radius = 0.32
      const target = new Vector3()
      let previous: Vector3 | null = null
      for (let i = 0; i <= 60; i++) {
        const angle = i * Math.PI / 30
        target.set(12.7 * Math.cos(angle), -1 + 4.1 * Math.sin(angle), SCENE_CENTER_Z + 10.2 * Math.sin(angle))
        channels.elapsed = i / 2
        update(camera, channels, target, 1, radius)
        const forward = camera.getWorldDirection(new Vector3())
        expect(forward.dot(star.clone().sub(camera.position).normalize())).toBeCloseTo(1, 8)
        expect(camera.position.clone().sub(target).dot(target.clone().sub(star))).toBeGreaterThan(0)
        const inward = star.clone().sub(target).normalize()
        const right = new Vector3().crossVectors(inward, new Vector3(0, 1, 0)).normalize()
        const up = new Vector3().crossVectors(right, inward).normalize()
        expect(camera.position.clone().sub(target).dot(right)).toBeGreaterThan(0)
        expect(camera.position.clone().sub(target).dot(up)).toBeGreaterThan(0)
        camera.updateMatrixWorld()
        const screen = target.clone().project(camera)
        expect(screen.x).toBeLessThan(-0.1)
        expect(screen.y).toBeLessThan(-0.1)
        const angularRadius = Math.asin(radius / camera.position.distanceTo(target))
        const centerAngle = forward.angleTo(target.clone().sub(camera.position))
        const limitingHalfFov = Math.min(20 * Math.PI / 180, Math.atan(Math.tan(20 * Math.PI / 180) * aspect))
        expect(centerAngle + angularRadius).toBeLessThan(limitingHalfFov)
        if (previous) expect(camera.position.distanceTo(previous)).toBeGreaterThan(0.1)
        previous = camera.position.clone()
      }
    }
  })

  it('飞行器入焦和出焦从当前镜头连续衔接，入焦完成后锁定恒星', () => {
    const camera = new PerspectiveCamera(40, 16 / 9)
    camera.position.copy(globalPosition); camera.lookAt(globalLookAt)
    const target = new Vector3(-10, 2, SCENE_CENTER_Z)
    const channels = createFocusChannels()
    const update = createCameraFocusController()
    const timeline = createFocusTimeline(channels, { focus() {}, exit: () => [2, 3, 4], timeout() {} })
    const frame = (delta: number) => { timeline.advance(delta); update(camera, channels, target, 1, 0.32) }
    try {
      const initialDirection = camera.getWorldDirection(new Vector3())
      timeline.dispatch({ type: 'voyager' }); frame(0)
      expect(camera.position.distanceTo(globalPosition)).toBeLessThan(1e-9)
      expect(camera.getWorldDirection(new Vector3()).distanceTo(initialDirection)).toBeLessThan(1e-9)
      for (let f = 0; f < 120; f++) frame(1 / 60)
      expect(camera.getWorldDirection(new Vector3()).dot(new Vector3(0, -1, SCENE_CENTER_Z).sub(camera.position).normalize())).toBeCloseTo(1, 8)
      const beforeExit = camera.position.clone(), beforeDirection = camera.getWorldDirection(new Vector3())
      timeline.dispatch({ type: 'exit', reason: 'manual' }); frame(0)
      expect(camera.position.distanceTo(beforeExit)).toBeLessThan(1e-9)
      expect(camera.getWorldDirection(new Vector3()).distanceTo(beforeDirection)).toBeLessThan(1e-9)
      for (let f = 0; f < 360; f++) frame(1 / 60)
      expect(camera.position.distanceTo(globalPosition)).toBeLessThan(1e-9)
    } finally { timeline.dispose() }
  })

  it('前三秒从低速平滑加速，随后持续匀速环绕，阶段交界处速度连续', () => {
    const h = 1e-4
    const speed = (t: number) => (focusOrbitPhase(t + h) - focusOrbitPhase(t)) / h
    expect(focusOrbitPhase(0)).toBe(0.9)
    expect(speed(0)).toBeCloseTo(0.006, 6)
    expect(speed(1.5)).toBeCloseTo(0.009, 6)
    expect(speed(3 - h)).toBeCloseTo(speed(3), 8)
    for (const t of [3, 10, 20, 29]) expect(speed(t)).toBeCloseTo(0.012, 6)
    expect(focusOrbitPhase(30) - focusOrbitPhase(0)).toBeCloseTo(0.351, 6)
  })

  it('从抬高位置开始缓慢抬升，保留相对行星的距离与 1.25 倍距离比例', () => {
    const pose = createFocusPoseCalculator()
    const position = new Vector3(), lookAt = new Vector3()
    for (const scale of [1, 1.25]) {
      pose(planets[0], 0, scale, position, lookAt)
      const initialHeight = position.y
      expect(initialHeight).toBeGreaterThan(0.5)
      expect(position.distanceTo(planets[0])).toBeCloseTo(Math.hypot(2.5, 2.2) * scale, 10)
      pose(planets[0], 30, scale, position, lookAt)
      expect(position.y - initialHeight).toBeGreaterThan(0.35)
      expect(position.y - initialHeight).toBeLessThan(0.5)
    }
  })

  it('入焦、切换与退出由时间轴进度驱动，接管首帧连续，窄屏 FOV 最终恢复', () => {
    const channels = createFocusChannels()
    const camera = new PerspectiveCamera(40, 390 / 844)
    camera.position.copy(globalPosition); camera.lookAt(globalLookAt)
    const update = createCameraFocusController()
    const timeline = createFocusTimeline(channels, { focus() {}, exit: () => [2, 3, 4], timeout() {} })
    const frame = (delta: number) => {
      timeline.advance(delta)
      update(camera, channels, planets[channels.track] ?? null, 1.25)
    }
    try {
      timeline.dispatch({ type: 'focus', planetIdx: 0 }, 0)
      frame(0)
      expect(camera.position.distanceTo(globalPosition)).toBe(0)
      for (let f = 0; f < 240; f++) frame(1 / 60)
      expect(camera.fov).toBeCloseTo(focusFieldOfView(camera.aspect, 40), 5)
      const atHold = camera.position.clone()
      const holdFov = camera.fov
      for (let f = 0; f < 900; f++) frame(1 / 60)
      expect(channels.camera).toBe(1)
      expect(camera.position.distanceTo(atHold)).toBeGreaterThan(0.45)
      expect(camera.position.distanceTo(planets[0])).toBeCloseTo(Math.hypot(2.5, 2.2) * 1.25, 8)
      expect(camera.fov).toBe(holdFov)
      const before = camera.position.clone()
      const direction = camera.getWorldDirection(new Vector3())
      timeline.dispatch({ type: 'focus', planetIdx: 1 }, 1)
      frame(0)
      expect(camera.position.distanceTo(before)).toBeLessThan(1e-9)
      expect(camera.getWorldDirection(new Vector3()).distanceTo(direction)).toBeLessThan(1e-9)
      for (let f = 0; f < 240; f++) frame(1 / 60)
      const beforeExit = camera.position.clone()
      timeline.dispatch({ type: 'exit', reason: 'manual' })
      frame(0)
      expect(camera.position.distanceTo(beforeExit)).toBeLessThan(1e-9)
      for (let f = 0; f < 360; f++) frame(1 / 60)
      expect(camera.position.distanceTo(globalPosition)).toBeLessThan(1e-9)
      expect(camera.fov).toBe(40)
      expect(camera.getWorldDirection(new Vector3()).distanceTo(globalLookAt.clone().sub(globalPosition).normalize())).toBeLessThan(1e-9)
    } finally { timeline.dispose() }
  })
})
