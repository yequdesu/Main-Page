import { gsap } from 'gsap'
import { selectProminenceMorphology, type ProminenceMorphology } from './stellarMorphology'
import { MAGNETIC_LIFETIME, magneticLifecycleTiming } from './stellarLifecycle'

export { createStellarLimbFrame } from './stellarLimb'
export { cmePositionDensity, cmePositionCDF, sampleCmePosition } from './stellarCmeDistribution'

export function createStellarActivityChannels() {
  // position 保留一次均匀随机分位数 [-1, 1]；资产按出生布局映射为环周相位。
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
      position: random() * 2 - 1,
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
  // 首次靠近时已有正在蓄能的磁通绳；跨 Act 不重启这些事件。
  dispatch({ type: 'cme' })
  lanes[2]!.totalTime(2.5, false)
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
