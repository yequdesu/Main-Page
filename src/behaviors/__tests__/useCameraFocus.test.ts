import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFocusPoseCalculator, focusFieldOfView, focusOrbitPhase, focusFollowLag, FOCUS_FOLLOW } from '../focusPose'
import { createCameraFocusController } from '../useCameraFocus'
import { createFocusChannels, createFocusTimeline } from '../useFocusTimeline'
import { SCROLL_RIG } from '../../types'
import { SCENE_CENTER_Z } from '../../r3f/ScrollRig'
import { createStellarTransitionPose, createStellarTransitionState, sampleStellarTransition } from '../stellarTransition'
import { CENTRAL_STAR_CORE_RADIUS } from '../../actors/assets/centralStar'

const globalPosition = new Vector3(0, 0.25, 8)
const globalLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const planets = [new Vector3(4, -1, SCENE_CENTER_Z), new Vector3(-5, -1, SCENE_CENTER_Z)]

describe('时间轴驱动相机聚焦', () => {
  it('扩大后的 Act 3 全景平滑展开，聚焦退出与 Menu 返回抵达同一全景', () => {
    const camera = new PerspectiveCamera(40, 16 / 9)
    camera.position.copy(globalPosition); camera.lookAt(globalLookAt)
    const channels = createFocusChannels(), transition = createStellarTransitionState()
    const update = createCameraFocusController()
    const timeline = createFocusTimeline(channels, { focus() {}, exit: () => [2, 3, 4], timeout() {} })
    const star = new Vector3(0, -1, SCENE_CENTER_Z)
    const expanded = globalPosition.clone().sub(star).multiplyScalar(SCROLL_RIG.OUTER_ORBIT_RADII[2] / 11).add(star)
    const frame = (delta = 0, sp = 1) => { timeline.advance(delta); update(camera, channels, planets[0], 1, 0, transition, sp) }
    try {
      frame(0, 0.8)
      expect(camera.position.distanceTo(globalPosition)).toBeLessThan(1e-9)
      let previous = camera.position.z
      for (let step = 0; step <= 100; step++) {
        frame(0, 0.85 + step * 0.0015)
        expect(camera.position.z).toBeGreaterThanOrEqual(previous - 1e-9)
        previous = camera.position.z
      }
      expect(camera.position.distanceTo(expanded)).toBeLessThan(1e-9)
      timeline.dispatch({ type: 'focus', planetIdx: 0 }, 0); frame()
      expect(camera.position.distanceTo(expanded)).toBeLessThan(1e-9)
      for (let i = 0; i < 120; i++) frame(1 / 60)
      timeline.dispatch({ type: 'exit', reason: 'manual' })
      for (let i = 0; i < 360; i++) frame(1 / 60)
      expect(camera.position.distanceTo(expanded)).toBeLessThan(1e-9)
      sampleStellarTransition(1, transition); frame()
      sampleStellarTransition(0, transition); frame()
      expect(camera.position.distanceTo(expanded)).toBeLessThan(1e-9)
    } finally { timeline.dispose() }
  })

  it('Menu 衔接任意方位的 Voyager 近景，单调拉近、不穿星，完成后返回普通全景', () => {
    const star = new Vector3(0, -1, SCENE_CENTER_Z)
    for (const aspect of [16 / 9, 390 / 844]) for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const camera = new PerspectiveCamera(40, aspect)
      camera.position.copy(globalPosition); camera.lookAt(globalLookAt)
      const target = new Vector3(Math.cos(angle) * 12, 2, SCENE_CENTER_Z + Math.sin(angle) * 12)
      const channels = createFocusChannels(), transition = createStellarTransitionState()
      const update = createCameraFocusController(), pose = createStellarTransitionPose()
      const timeline = createFocusTimeline(channels, { focus() {}, exit: () => [2, 3, 4], timeout() { throw Error('旧聚焦超时仍存活') } })
      const frame = (delta: number, p: number) => {
        timeline.advance(delta)
        sampleStellarTransition(p, transition)
        update(camera, channels, target, 1, 0.32, transition)
      }
      try {
        timeline.dispatch({ type: 'voyager' })
        for (let f = 0; f < 120; f++) frame(1 / 60, 0)
        const before = camera.position.clone(), forward = camera.getWorldDirection(new Vector3())
        timeline.dispatch({ type: 'exit', reason: 'menu' }); frame(0, 0)
        expect(camera.position.distanceTo(before)).toBeLessThan(1e-9)
        expect(camera.getWorldDirection(new Vector3()).distanceTo(forward)).toBeLessThan(1e-9)
        // 页面尚未到 Act 4 或暂停时，出焦的轨道清理不能把相机拖回全景。
        for (let f = 0; f < 360; f++) frame(1 / 60, 0)
        expect(channels.mode).toBe('idle')
        expect(camera.position.distanceTo(before)).toBeLessThan(1e-9)
        let lastDistance = camera.position.distanceTo(star)
        for (let i = 1; i <= 100; i++) {
          frame(1 / 60, 0.42 * i / 100)
          const distance = camera.position.distanceTo(star)
          expect(distance).toBeLessThan(lastDistance)
          expect(distance).toBeGreaterThan(CENTRAL_STAR_CORE_RADIUS + camera.near)
          expect(camera.getWorldDirection(new Vector3()).dot(star.clone().sub(camera.position).normalize())).toBeCloseTo(1, 8)
          lastDistance = distance
        }
        expect(camera.position.distanceTo(pose(transition, aspect).camera)).toBeLessThan(1e-9)
        frame(1 / 60, 1)
        expect(camera.position.distanceTo(pose(transition, aspect).camera)).toBeLessThan(1e-9)
        for (let i = 100; i >= 0; i--) frame(1 / 60, i / 100)
        expect(camera.position.distanceTo(globalPosition)).toBeLessThan(1e-9)
      } finally { timeline.dispose() }
    }
  })

  it('Menu 中途反向取消及尚在入焦时交接，均保留首帧姿态和 FOV', () => {
    const camera = new PerspectiveCamera(40, 390 / 844)
    camera.position.copy(globalPosition); camera.lookAt(globalLookAt)
    const channels = createFocusChannels(), transition = createStellarTransitionState()
    const update = createCameraFocusController()
    const timeline = createFocusTimeline(channels, { focus() {}, exit: () => [2, 3, 4], timeout() {} })
    const frame = (delta: number, p = 0) => {
      timeline.advance(delta); sampleStellarTransition(p, transition)
      update(camera, channels, planets[0], 1, 0, transition)
    }
    try {
      timeline.dispatch({ type: 'focus', planetIdx: 0 }, 0)
      for (let i = 0; i < 60; i++) frame(1 / 60)
      const before = camera.position.clone(), forward = camera.getWorldDirection(new Vector3()), fov = camera.fov
      timeline.dispatch({ type: 'exit', reason: 'menu' }); frame(0)
      expect(camera.position.distanceTo(before)).toBeLessThan(1e-9)
      expect(camera.getWorldDirection(new Vector3()).distanceTo(forward)).toBeLessThan(1e-9)
      expect(camera.fov).toBe(fov)
      for (let i = 0; i < 360; i++) frame(1 / 60, 0.1)
      expect(channels.mode).toBe('idle')
      const interrupted = camera.position.clone()
      timeline.dispatch({ type: 'exit', reason: 'scene' }); frame(0)
      expect(camera.position.distanceTo(interrupted)).toBeLessThan(1e-9)
      for (let i = 0; i < 360; i++) frame(1 / 60)
      expect(camera.position.distanceTo(globalPosition)).toBeLessThan(1e-9)
      expect(camera.fov).toBe(40)
    } finally { timeline.dispose() }
  })

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

  it.each([3.6, 5.4, 9])('轨道半径 %s：抬升与跟随共同计算后，相机沿公转方向稍慢，差速渐入且累计差角平滑有界', radius => {
    const pose = createFocusPoseCalculator()
    const p = new Vector3(), c = new Vector3(), look = new Vector3()
    const angle = (t: number) => {
      p.set(radius * Math.cos(-0.015 * t), -1, SCENE_CENTER_Z + radius * Math.sin(-0.015 * t))
      pose(p, t, radius === 3.6 ? 1 : 1.25, c, look)
      return Math.atan2(c.z - SCENE_CENTER_Z, c.x)
    }
    expect(focusFollowLag(0)).toBe(0)
    expect(focusFollowLag(0.001) / 0.001).toBeLessThan(1e-8)
    for (const t of [3, 10, 20, 29]) {
      const speed = (angle(t + 0.001) - angle(t)) / 0.001
      expect(speed).toBeGreaterThan(-0.015)
      expect(speed).toBeLessThan(-0.0127)
    }
    expect(focusFollowLag(30)).toBeGreaterThan(0.04)
    expect(focusFollowLag(30)).toBeLessThan(0.06)
    expect(focusFollowLag(300)).toBeLessThanOrEqual(FOCUS_FOLLOW.maxLag)
    // 姿态只取决于时间轴播放头；直接定位、乱序取样不会留下积分历史。
    pose(p, 18, 1.25, c, look)
    const direct = c.clone()
    for (const t of [4, 29, 0, 18]) pose(p, t, 1.25, c, look)
    expect(c.distanceTo(direct)).toBeLessThan(1e-12)
  })

  it.each([3.6, 5.4, 9])('半径 %i：行星在聚焦画面继续前移，保持近景尺寸与画面余量', radius => {
    const pose = createFocusPoseCalculator()
    const scale = radius === 3.6 ? 1 : 1.25
    const camera = new PerspectiveCamera(48, 16 / 9)
    const p = new Vector3(), c = new Vector3(), look = new Vector3()
    const screens: Vector3[] = []
    for (let t = 3; t <= 29; t++) {
      p.set(radius * Math.cos(-0.015 * t), -1, SCENE_CENTER_Z + radius * Math.sin(-0.015 * t))
      pose(p, t, scale, c, look)
      camera.position.copy(c); camera.lookAt(look); camera.updateMatrixWorld()
      const screen = p.clone().project(camera)
      screens.push(screen)
      expect(Math.abs(screen.x)).toBeLessThan(0.5)
      expect(Math.abs(screen.y)).toBeLessThan(0.6)
      expect(c.distanceTo(p)).toBeGreaterThan(Math.hypot(2.5, 2.2) * scale * 0.9)
      expect(c.distanceTo(p)).toBeLessThan(Math.hypot(2.5, 2.2) * scale * 1.1)
    }
    // 原完全锁定跟随几乎抵消水平公转；新模式提供可辨识的相对位移。
    expect(screens[screens.length - 1].x - screens[0].x).toBeGreaterThan(0.05)
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
      expect(camera.position.distanceTo(atHold)).toBeGreaterThan(0.25)
      const star = new Vector3(0, -1, SCENE_CENTER_Z)
      const predicted = new Vector3(), look = new Vector3()
      createFocusPoseCalculator()(planets[0], channels.elapsed, 1.25, predicted, look)
      expect(camera.position.distanceTo(predicted)).toBeLessThan(1e-9)
      const followPoint = look.clone().sub(star).setLength(planets[0].distanceTo(star)).add(star)
      expect(camera.position.distanceTo(followPoint)).toBeCloseTo(Math.hypot(2.5, 2.2) * 1.25, 8)
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
