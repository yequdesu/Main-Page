import { gsap } from 'gsap'
import { SCROLL_RIG } from '../types'
import { TIMELINE, clamp01, smoothstep01 } from '../composition/timeline'

export const ASTEROID_BELT = {
  count: 320,
  legacyCount: 80,
  sizeScale: 0.5,
  formationTimeScale: 0.5,
  cruiseOpacity: 0.65,
  seed: 470,
  radius: (SCROLL_RIG.ORBIT_RADII[1] + SCROLL_RIG.ORBIT_RADII[2]) / 2,
  radialSpread: 0.14,
  outlierFraction: 0.03,
  enterAt: TIMELINE.orbitGlow.start,
  resetBelow: Math.round((TIMELINE.act3Shift.start - 0.05) * 100) / 100,
  cruiseSpeed: -0.055,
  focusSettle: 0.9,
} as const

/** 增强入场辨识度；成环后平滑回落到当前主题的巡航色与不透明度。 */
export const ASTEROID_ENTRY_VISUAL = {
  preparedHighlight: 0.55,
  peakOpacity: 0.92,
  dimStart: 1.95 * ASTEROID_BELT.formationTimeScale + 0.5,
  dimDuration: 1.5,
} as const

export interface BeltPoint { x: number; y: number; z: number }
export interface AsteroidOrbit {
  radius: number
  eccentricity: number
  inclination: number
  node: number
  periapsis: number
  speed: number
  phase: number
  outlier: boolean
  entryRadius: number
  entryHeight: number
  gatherDelay: number
  converge: number
  peak: number
  shape: readonly [number, number, number]
  spin: number
  highlightGain: number
}

export function asteroidRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** 随机性只在创建时决定；低偏心率固定轨道近似，不运行 N 体模拟。 */
export function createAsteroidOrbits(count: number = ASTEROID_BELT.count, seed: number = ASTEROID_BELT.seed): AsteroidOrbit[] {
  const random = asteroidRandom(seed)
  // 独立随机流：调整明暗不能改变已有轨道、尺寸或入场路径。
  const appearanceRandom = asteroidRandom(seed ^ 0x5bd1e995)
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(Math.PI * 2 * random())
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  let stride = Math.max(1, Math.ceil(count / 4))
  while (gcd(stride, count) !== 1) stride++
  return Array.from({ length: count }, (_, i) => {
    const outlier = i % Math.round(1 / ASTEROID_BELT.outlierFraction) === 0
    let g = gaussian()
    while (Math.abs(g) > 2.5) g = gaussian()
    const radius = ASTEROID_BELT.radius + g / 2.5 * (outlier ? 0.23 : ASTEROID_BELT.radialSpread)
    return {
      radius, outlier,
      eccentricity: (outlier ? 0.025 : 0.002) + random() * (outlier ? 0.020 : 0.004),
      inclination: (outlier ? 2 + random() * 4 : random() * 0.45) * Math.PI / 180,
      node: random() * Math.PI * 2,
      periapsis: random() * Math.PI * 2,
      speed: ASTEROID_BELT.cruiseSpeed * (ASTEROID_BELT.radius / radius) ** 1.5 * (outlier ? 1.3 + random() * 0.3 : 0.96 + random() * 0.08),
      // 交错索引，使前 80 个旧碎片也遍布全周；每个角区只取一个种子样本。
      phase: ((i * stride) % count + random()) / count * Math.PI * 2,
      entryRadius: ASTEROID_BELT.radius * (0.65 + random() * 0.95),
      entryHeight: (random() - 0.5) * 3.6,
      gatherDelay: (0.12 + random() * 0.23) * ASTEROID_BELT.formationTimeScale,
      converge: (1.1 + random() * 0.5) * ASTEROID_BELT.formationTimeScale,
      peak: -2.4 * (0.97 + random() * 0.06),
      shape: [0.75 + random() * 0.55, 0.65 + random() * 0.45, 0.8 + random() * 0.5],
      spin: (random() - 0.5) * 0.25,
      highlightGain: 0.9 + appearanceRandom() * 0.2,
    }
  })
}

export const smoother = (u: number) => u * u * u * (10 + u * (-15 + 6 * u))

/** theta 为连续的轨道平面极角，恒星位于低偏心椭圆的焦点。 */
export function sampleAsteroidOrbit(orbit: AsteroidOrbit, theta: number, out: BeltPoint): BeltPoint {
  const r = orbit.radius * (1 - orbit.eccentricity ** 2) / (1 + orbit.eccentricity * Math.cos(theta - orbit.periapsis))
  const u = theta - orbit.node
  const x = r * Math.cos(u), z = r * Math.sin(u) * Math.cos(orbit.inclination)
  out.x = x * Math.cos(orbit.node) - z * Math.sin(orbit.node)
  out.z = SCROLL_RIG.SCENE_CENTER_Z + x * Math.sin(orbit.node) + z * Math.cos(orbit.node)
  out.y = -1 + r * Math.sin(u) * Math.sin(orbit.inclination)
  return out
}

/** 进入高速段前，低速准备位置已经绕恒星覆盖完整 360°。 */
export function sampleAsteroidEntry(orbit: AsteroidOrbit, out: BeltPoint): BeltPoint {
  out.x = Math.cos(orbit.phase) * orbit.entryRadius
  out.y = -1 + orbit.entryHeight
  out.z = SCROLL_RIG.SCENE_CENTER_Z + Math.sin(orbit.phase) * orbit.entryRadius
  return out
}

type EntryChannel = { gather: number; speed: number; angle: number; radius: number; height: number }
export type BeltEvent = 'enter' | 'focus' | 'reset'

/** DustField 独占。GSAP 编排通道，R3F delta 推进；无 ticker / rAF / 定时器。 */
export function createAsteroidBeltController(orbits: readonly AsteroidOrbit[]) {
  const channels: EntryChannel[] = orbits.map(o => ({ gather: 0, speed: o.speed, angle: o.phase, radius: 0, height: 0 }))
  const visual: { highlight: number } = { highlight: ASTEROID_ENTRY_VISUAL.preparedHighlight }
  let timeline: gsap.core.Timeline | null = null
  let elapsed = 0, active = false, expedited = false, disposed = false
  const target = { x: 0, y: 0, z: 0 }
  const reset = () => {
    timeline?.kill()
    timeline = null
    active = false
    expedited = false
    elapsed = 0
    visual.highlight = ASTEROID_ENTRY_VISUAL.preparedHighlight
  }
  return {
    channels,
    visual,
    get active() { return active },
    get forming() { return active && timeline !== null && elapsed < timeline.duration() },
    dispatch(event: BeltEvent, starts?: readonly BeltPoint[]) {
      if (disposed) return
      if (event === 'reset') { reset(); return }
      if (event === 'enter') {
        if (active || !starts || starts.length !== orbits.length) return
        active = true
        elapsed = 0
        timeline = gsap.timeline({ paused: true })
        const scale = ASTEROID_BELT.formationTimeScale
        timeline.addLabel('belt:accelerate', 0).addLabel('belt:gather', 0.12 * scale).addLabel('belt:brake', 1.95 * scale)
        timeline.to(visual, { highlight: 1, duration: 0.3 * scale, ease: smoother }, 'belt:accelerate')
          .addLabel('belt:dim', ASTEROID_ENTRY_VISUAL.dimStart)
          .to(visual, { highlight: 0, duration: ASTEROID_ENTRY_VISUAL.dimDuration, ease: smoother }, 'belt:dim')
        channels.forEach((c, i) => {
          const p = starts[i], o = orbits[i]
          c.angle = Math.atan2(p.z - SCROLL_RIG.SCENE_CENTER_Z, p.x)
          c.radius = Math.hypot(p.x, p.z - SCROLL_RIG.SCENE_CENTER_Z)
          c.height = p.y + 1
          c.gather = 0
          c.speed = o.speed
          // 初始方位已覆盖全周；共享加速与制动，少量速度差不会形成追赶团块。
          timeline!.to(c, { speed: o.peak, duration: 0.3 * scale, ease: smoother }, 0)
            .to(c, { gather: 1, duration: o.converge, ease: smoother }, o.gatherDelay)
            .to(c, { speed: o.speed, duration: 2, ease: smoother }, 'belt:brake')
        })
        timeline.addLabel('belt:cruise', timeline.duration())
      } else if (event === 'focus' && active && !expedited && timeline && elapsed < timeline.duration()) {
        // 从现有通道接管，角度与角速度都不重置；不阻塞点击和相机聚焦。
        expedited = true
        timeline.kill()
        elapsed = 0
        timeline = gsap.timeline({ paused: true }).addLabel('belt:focus-settle', 0)
        timeline.to(visual, { highlight: 0, duration: ASTEROID_BELT.focusSettle, ease: smoother }, 0)
        channels.forEach((c, i) => {
          timeline!.to(c, { gather: 1, duration: ASTEROID_BELT.focusSettle, ease: 'power2.out' }, 0)
            .to(c, { speed: orbits[i].speed, duration: ASTEROID_BELT.focusSettle, ease: smoother }, 0)
        })
      }
    },
    advance(delta: number) {
      if (disposed || !active || !timeline) return
      // 有界子步积分速度，降低不同帧率下的角度误差，后台恢复不追赶整段动画。
      let remaining = Math.min(0.1, Math.max(0, delta))
      if (elapsed >= timeline.duration()) {
        for (const c of channels) c.angle += c.speed * remaining
        return
      }
      while (remaining > 1e-9) {
        const dt = Math.min(1 / 120, remaining)
        for (const c of channels) c.angle += c.speed * dt / 2
        elapsed += dt
        timeline.totalTime(Math.min(elapsed, timeline.duration()), false)
        for (const c of channels) c.angle += c.speed * dt / 2
        remaining -= dt
      }
    },
    sample(index: number, out: BeltPoint) {
      const c = channels[index]
      sampleAsteroidOrbit(orbits[index], c.angle, target)
      const x = Math.cos(c.angle) * c.radius
      const z = SCROLL_RIG.SCENE_CENTER_Z + Math.sin(c.angle) * c.radius
      out.x = x + (target.x - x) * c.gather
      out.y = -1 + c.height + (target.y + 1 - c.height) * c.gather
      out.z = z + (target.z - z) * c.gather
      return out
    },
    dispose() { reset(); disposed = true },
  }
}

export function updateBeltScene(controller: ReturnType<typeof createAsteroidBeltController>, sp: number, focused: boolean, positions: readonly BeltPoint[]) {
  if (sp <= ASTEROID_BELT.resetBelow) controller.dispatch('reset')
  else if (sp >= ASTEROID_BELT.enterAt) controller.dispatch('enter', positions)
  if (focused) controller.dispatch('focus')
  return controller.active ? beltSceneWeight(sp) : 0
}

/** 返回前幕时以位置混合退出；达到 resetBelow 才重置会话，避免边界反复触发。 */
export function beltSceneWeight(sp: number) {
  return smoothstep01(clamp01((sp - ASTEROID_BELT.resetBelow) / (ASTEROID_BELT.enterAt - ASTEROID_BELT.resetBelow)))
}
