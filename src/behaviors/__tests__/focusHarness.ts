import { afterEach } from 'vitest'
import type { PerspectiveCamera } from 'three'
import type { ParticleData } from '../../types'
import { createFocusOrbitController } from '../useFocusOrbit'
import { createFocusChannels, createFocusTimeline } from '../useFocusTimeline'

const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()) })

/** 用真实 GSAP 时间轴推进轨道测试；兼容已有测试的逐帧场景输入。 */
export function createOrbitHarness(geometry: { planetRadius: number; starRadius: number }) {
  const orbit = createFocusOrbitController(geometry)
  const channels = createFocusChannels()
  let current: { data: ParticleData[]; camera: PerspectiveCamera; envelopes: readonly number[]; distanceScale: number }
  let track = -1
  const timeline = createFocusTimeline(channels, {
    focus: i => orbit.focus(current.data, i, current.camera, current.envelopes, current.distanceScale),
    exit: settle => orbit.exit(current.data, settle),
    timeout() {}, // 超时事件由时间轴与场景集成测试覆盖；这里检查运动本身。
  })
  cleanups.push(() => timeline.dispose())
  return {
    speeds: orbit.speeds,
    step(data: ParticleData[], focused: number, camera: PerspectiveCamera, _time: number, delta: number, envelopes: readonly number[], distanceScale: number) {
      current = { data, camera, envelopes, distanceScale }
      if (focused !== track) {
        timeline.dispatch(focused < 0 ? { type: 'exit', reason: 'manual' } : { type: 'focus', planetIdx: focused }, focused)
        track = focused
      }
      timeline.advance(delta)
      orbit.step(data, delta, channels)
    },
  }
}
