import { gsap } from 'gsap'
import { selectProminenceMorphology, type ProminenceMorphology } from './stellarMorphology'
import { Vector3 } from 'three'
import { STRUCTURE_LAYOUT, type getStructureLayout } from './structureLayout'
import { MAGNETIC_LIFETIME, magneticLifecycleTiming } from './stellarLifecycle'

/** x 是可见日面切圆上的归一化弧长，范围 [-1, 1]，0 为水平中线。 */
export const CME_TRANSITION_WIDTH = 0.45
const densityGain = 0.5 / (2 - CME_TRANSITION_WIDTH)
export function cmePositionDensity(x: number) {
  if (Math.abs(x) > 1) return 0
  const t = Math.min(1, Math.abs(x) / CME_TRANSITION_WIDTH)
  return 0.25 + densityGain * t * t * (3 - 2 * t)
}
export function cmePositionCDF(x: number) {
  const v = Math.min(1, Math.abs(x)), a = CME_TRANSITION_WIDTH
  const integral = v < a ? v ** 3 / a ** 2 - 0.5 * v ** 4 / a ** 3 : v - a / 2
  return 0.5 + Math.sign(x) * (0.25 * v + densityGain * integral)
}
export function sampleCmePosition(u: number) {
  let low = -1, high = 1
  for (let i = 0; i < 36; i++) {
    const mid = (low + high) / 2
    if (cmePositionCDF(mid) < u) low = mid
    else high = mid
  }
  return (low + high) / 2
}

export function createStellarActivityChannels() {
  const channel = () => ({ position: 0, seed: 0, opacity: 0, age: 0, duration: MAGNETIC_LIFETIME, serial: 0, morphology: null as ProminenceMorphology | null })
  return { prominences: [channel(), channel()], cme: channel(), time: null as number | null }
}
export type StellarActivityChannel = ReturnType<typeof createStellarActivityChannels>['cme']
export type StellarActivityEvent = { type: 'prominence'; slot: number } | { type: 'cme' }

/** 独立事件通道；沿用聚焦时间轴的 paused Timeline + R3F delta，不使用额外 ticker/定时器。 */
export function createStellarActivityTimeline(channels: ReturnType<typeof createStellarActivityChannels>, random = Math.random) {
  const lanes: (gsap.core.Timeline | null)[] = [null, null, null]
  channels.time = 0
  let disposed = false
  function dispatch(event: StellarActivityEvent) {
    if (disposed) return
    const slot = event.type === 'cme' ? 2 : event.slot
    if (!Number.isInteger(slot) || slot < 0 || slot > 2 || (event.type === 'prominence' && slot === 2)) return
    lanes[slot]?.kill()
    const cme = event.type === 'cme'
    const channel = cme ? channels.cme : channels.prominences[slot]
    Object.assign(channel, {
      position: cme ? sampleCmePosition(random()) : random() * 2 - 1,
      seed: random(), opacity: 0, age: 0, serial: channel.serial + 1,
      morphology: cme ? null : selectProminenceMorphology(random(), channel.morphology, channels.prominences[1 - slot].morphology),
    })
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    lanes[slot] = tl
    if (cme) {
      const cycle = 18 + random() * 12
      tl.addLabel('cme:charge', 0)
        .to(channel, { opacity: 1, duration: 2.5, ease: 'sine.inOut' }, 0)
        .addLabel('cme:observe', 2.5)
        .addLabel('cme:fade', 8)
        .to(channel, { opacity: 0, duration: 5, ease: 'sine.in' }, 'cme:fade')
        .to(channel, { age: cycle, duration: cycle }, 0)
        .addLabel('cme:next', cycle)
    } else {
      const life = 30 + random() * 8
      channel.duration = life
      channel.opacity = 1 // 几何与末段可见度由 age 对应的共享生命周期求值。
      const timing = magneticLifecycleTiming(life, channel.seed)
      tl.addLabel('prominence:form', 0)
        .addLabel('prominence:settle', timing.grown)
        .addLabel('prominence:stable', timing.settled)
        .addLabel('prominence:relax', timing.decay)
        .addLabel('prominence:retreat', timing.decay + 1.8)
        .to(channel, { age: life, duration: life }, 0)
    }
  }
  dispatch({ type: 'prominence', slot: 0 })
  dispatch({ type: 'prominence', slot: 1 })
  lanes[0]!.totalTime(4, false)
  lanes[1]!.totalTime(9, false)
  // 首次进入即有日珥，首次抛射在可见场景时间 3 秒后开始。
  lanes[2] = gsap.timeline({ paused: true }).to(channels.cme, { age: 3, duration: 3, ease: 'none' })
  return {
    dispatch,
    advance(delta: number) {
      if (disposed) return
      const step = Math.min(0.1, Math.max(0, delta))
      channels.time = (channels.time ?? 0) + step
      for (let i = 0; i < lanes.length; i++) {
        const timeline = lanes[i]!
        timeline.totalTime(timeline.totalTime() + step, false)
        if (timeline.totalProgress() >= 1) dispatch(i === 2 ? { type: 'cme' } : { type: 'prominence', slot: i })
      }
    },
    dispose() {
      disposed = true
      lanes.forEach(timeline => timeline?.kill())
    },
  }
}

/** 相机到球体的真实切圆：按其弧长随机取点，避免把均匀屏幕 y 误当成均匀弧长。 */
export function createStellarLimbFrame() {
  const center = new Vector3(), right = new Vector3(), camera = new Vector3(0, 0, STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ)
  const point = new Vector3(), sun = new Vector3()
  let radius = 1, limit = 1
  function positionAt(angle: number, target: Vector3) {
    return target.copy(center).addScaledVector(right, radius * Math.cos(angle)).addScaledVector(up, radius * Math.sin(angle))
  }
  const up = new Vector3(0, 1, 0)
  return {
    layout(layout: ReturnType<typeof getStructureLayout>) {
      sun.set(layout.sunX, 0, 0)
      const d = camera.z, distance = Math.hypot(layout.sunX, d)
      const alpha = 1 - (layout.sunRadius / distance) ** 2
      center.copy(sun).sub(camera).multiplyScalar(alpha).add(camera)
      right.set(d / distance, 0, layout.sunX / distance)
      radius = layout.sunRadius * Math.sqrt(alpha)
      let low = 0, high = Math.PI / 2
      for (let i = 0; i < 40; i++) {
        const angle = (low + high) / 2
        positionAt(angle, point)
        const scale = d / (d - point.z)
        if (point.y * scale > layout.height * 0.43 || point.x * scale < -layout.width * 0.485) high = angle
        else low = angle
      }
      limit = low
    },
    sample(x: number, anchor: Vector3, tangent: Vector3, normal: Vector3) {
      const angle = Math.max(-1, Math.min(1, x)) * limit
      positionAt(angle, anchor)
      tangent.copy(right).multiplyScalar(-Math.sin(angle)).addScaledVector(up, Math.cos(angle))
      normal.copy(anchor).sub(sun).normalize()
    },
  }
}
