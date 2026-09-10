import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFocusPoseCalculator, focusFieldOfView } from '../focusPose'
import { createCameraFocusController } from '../useCameraFocus'
import { createFocusChannels, createFocusTimeline } from '../useFocusTimeline'
import { SCENE_CENTER_Z } from '../../r3f/ScrollRig'

const globalPosition = new Vector3(0, 0.25, 8)
const globalLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const planets = [new Vector3(4, -1, SCENE_CENTER_Z), new Vector3(-5, -1, SCENE_CENTER_Z)]

describe('时间轴驱动相机聚焦', () => {
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
