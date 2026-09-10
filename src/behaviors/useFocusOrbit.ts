import { PerspectiveCamera, Vector3 } from 'three'
import type { ParticleData } from '../types'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { FOCUS_TIMING, type FocusChannels } from './useFocusTimeline'
import { createFocusPoseCalculator, focusFieldOfView } from './focusPose'

const PHASE_STEPS = 180
const TAU = Math.PI * 2
const COMMON_SPEED = -0.015
const DRIFT_AMPLITUDE = 0.025
const DRIFT_FREQUENCY = 0.12
const ease = (u: number) => u * u * u * (10 + u * (-15 + 6 * u))
const easeDerivative = (u: number) => 30 * u * u * (1 - u) * (1 - u)
const settleIntegral = (u: number) => u * u * u - 0.5 * u * u * u * u
interface ReturnPlan {
  initialAngle: number
  initialSpeed: number
  settleDuration: number
  gap: number
  winding: number
  duration: number
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const shortest = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
const sq = (value: number) => value * value

interface FocusGeometry { planetRadius: number; starRadius: number }

interface Projection { x: number; y: number; radius: number; front: boolean }

/** 只在进入聚焦、换目标或宽高比改变时搜索相位，逐帧不进行网格搜索。 */
export function chooseFocusPhases(data: ParticleData[], focused: number, aspect: number, fov: number, envelopes: readonly number[], distanceScale: number, geometry: FocusGeometry): number[] {
  const camera = new PerspectiveCamera(fov, aspect, 0.1, 150)
  const position = new Vector3()
  const lookAt = new Vector3()
  const point = new Vector3()
  const projected = new Vector3()
  const pose = createFocusPoseCalculator()
  const focal = new Vector3(data[focused].orbitR, -1, SCENE_CENTER_Z)
  const remaining = [0, 1, 2].filter(i => i !== focused)
  const samples = [0, 5, 10, 15, 20, 25, 30].map(elapsed => {
    pose(focal, elapsed, distanceScale, position, lookAt)
    camera.position.copy(position)
    camera.lookAt(lookAt)
    camera.updateMatrixWorld()
    const project = (track: number, phase: number): Projection => {
      point.set(Math.cos(phase) * data[track].orbitR, -1, SCENE_CENTER_Z + Math.sin(phase) * data[track].orbitR)
      const distance = point.distanceTo(camera.position)
      const depth = -projected.copy(point).applyMatrix4(camera.matrixWorldInverse).z
      projected.copy(point).project(camera)
      const d = data[track]
      const worldRadius = geometry.planetRadius * d.scale * 0.7 * d.sizeBoost * d.scaleMult * 22 / Math.max(5, distance) * envelopes[track] * 1.35
      return { x: projected.x * aspect, y: projected.y, radius: worldRadius / (depth * Math.tan(fov * Math.PI / 360)), front: depth > 0.1 }
    }
    point.set(0, -1, SCENE_CENTER_Z)
    const depth = -projected.copy(point).applyMatrix4(camera.matrixWorldInverse).z
    projected.copy(point).project(camera)
    const star = { x: projected.x * aspect, y: projected.y, radius: geometry.starRadius / (depth * Math.tan(fov * Math.PI / 360)) }
    return {
      star, main: project(focused, 0),
      candidates: remaining.map(track => Array.from({ length: PHASE_STEPS }, (_, step) => project(track, step * TAU / PHASE_STEPS + DRIFT_AMPLITUDE * Math.sin(elapsed * DRIFT_FREQUENCY + track * 2.1)))),
    }
  })
  const result = [0, 0, 0]
  let best = Infinity
  // 相邻角间隔小于 180° 并为漂移留余量，使恒星位于轨道平面的三角形内部。
  for (let a = 1; a < PHASE_STEPS; a++) for (let b = 1; b < PHASE_STEPS; b++) {
    const low = Math.min(a, b), high = Math.max(a, b)
    if (low >= PHASE_STEPS / 2 - 2 || high <= PHASE_STEPS / 2 + 2 || high - low >= PHASE_STEPS / 2 - 2) continue
    let score = 0
    for (const sample of samples) {
      const one = sample.candidates[0][a], two = sample.candidates[1][b]
      const left = one.x < two.x ? one : two
      const right = one.x < two.x ? two : one
      if (!one.front || !two.front) { score += 1e6; continue }
      for (const p of [one, two]) {
        // 视口边界与实体包络优先；主行星的原有近景尺寸不参与重新缩放。
        score += 1e6 * (sq(Math.max(0, Math.abs(p.x) + p.radius + 0.035 - aspect)) + sq(Math.max(0, Math.abs(p.y) + p.radius + 0.035 - 1)))
        score += 800 * sq(Math.max(0, sample.star.radius + p.radius + 0.04 - Math.hypot(p.x - sample.star.x, p.y - sample.star.y)))
        score += 500 * sq(Math.max(0, sample.main.radius + p.radius + 0.04 - Math.hypot(p.x - sample.main.x, p.y - sample.main.y)))
      }
      score += 1000 * (sq(Math.max(0, left.x + left.radius + 0.05 - sample.star.x)) + sq(Math.max(0, sample.star.x + right.radius + 0.05 - right.x)))
      score += 600 * sq(Math.max(0, one.radius + two.radius + 0.12 - Math.hypot(one.x - two.x, one.y - two.y)))
      // 留出自然的不对称，鼓励两侧都有间距且三角形不是扁平细线。
      score += sq(left.x - sample.star.x + 0.35) + sq(right.x - sample.star.x - 0.35)
      score += 2 * (sq(left.y - sample.star.y - 0.12) + sq(right.y - sample.star.y - 0.12))
    }
    if (score < best) {
      best = score
      result[remaining[0]] = a * TAU / PHASE_STEPS
      result[remaining[1]] = b * TAU / PHASE_STEPS
    }
  }
  return result
}

/** 仅写入运动参数和角度，阶段计时与进度由聚焦时间轴提供。 */
export function createFocusOrbitController(geometry: FocusGeometry) {
  const speeds = [0, 0, 0]
  const references = [0, 0, 0]
  const starts = [0, 0, 0]
  const initialSpeeds = [0, 0, 0]
  const offsets = [0, 0, 0]
  const windings = [0, 0, 0]
  const returns: (ReturnPlan | null)[] = [null, null, null]
  let initialized = false
  let active = -1
  let phases = [0, 0, 0]
  const initialize = (data: ParticleData[]) => {
    if (initialized) return
    data.forEach((d, i) => {
      references[i] = d.orbitAngle
      speeds[i] = d._baseSpeed * (1 - d.hoverFactor * 0.8)
    })
    initialized = true
  }
  return {
    speeds,
    focus(data: ParticleData[], track: number, camera: PerspectiveCamera, envelopes: readonly number[], distanceScale: number, baseFov = 40) {
      initialize(data)
      active = track
      returns.fill(null)
      phases = chooseFocusPhases(data, track, camera.aspect, focusFieldOfView(camera.aspect, baseFov), envelopes, distanceScale, geometry)
      data.forEach((d, i) => {
        starts[i] = d.orbitAngle
        initialSpeeds[i] = speeds[i]
        const target = data[track].orbitAngle + phases[i] + DRIFT_AMPLITUDE * Math.sin(i * 2.1)
        offsets[i] = shortest(d.orbitAngle - target)
        windings[i] = d.orbitAngle - target - offsets[i]
      })
    },
    exit(data: ParticleData[], settleDuration: number) {
      initialize(data)
      active = -1
      return data.map((d, i) => {
        // 预估制动结束的位置，使时间轴在退出事件发生时即可排好各轨道回位时长。
        const natural = d._baseSpeed
        const direction = Math.sign(natural) || -1
        const settledAngle = d.orbitAngle + (speeds[i] + natural) * settleDuration / 2
        const reference = references[i] + natural * settleDuration
        const difference = reference - settledAngle
        const gap = Math.abs(shortest(difference)) < 1e-8 ? 0 : ((direction * difference) % TAU + TAU) % TAU
        const duration = Math.max(FOCUS_TIMING.returnMin, 1.875 * gap / FOCUS_TIMING.returnExtraSpeed)
        returns[i] = { initialAngle: d.orbitAngle, initialSpeed: speeds[i], settleDuration,
          gap, winding: settledAngle + direction * gap - reference, duration }
        return duration
      })
    },
    step(data: ParticleData[], delta: number, channels: FocusChannels) {
      initialize(data)
      const dt = clamp(delta, 0, 0.1)
      data.forEach((d, i) => {
        references[i] += (channels.mode === 'focus' || returns[i] ? d._baseSpeed : d._baseSpeed * (1 - d.hoverFactor * 0.8)) * dt
      })
      if (channels.mode === 'focus' && active >= 0) {
        const elapsed = channels.elapsed
        const speedU = Math.min(1, elapsed / FOCUS_TIMING.speed)
        const v0 = initialSpeeds[active]
        const speedEase = speedU * speedU * (3 - 2 * speedU)
        speeds[active] = v0 + (COMMON_SPEED - v0) * speedEase
        data[active].orbitAngle = starts[active] + v0 * Math.min(elapsed, FOCUS_TIMING.speed)
          + (COMMON_SPEED - v0) * FOCUS_TIMING.speed * settleIntegral(speedU)
          + COMMON_SPEED * Math.max(0, elapsed - FOCUS_TIMING.speed)
        const u = channels.align
        data.forEach((d, i) => {
          if (i === active) return
          const wave = elapsed * DRIFT_FREQUENCY + i * 2.1
          const drift = DRIFT_AMPLITUDE * Math.sin(wave)
          const driftSpeed = DRIFT_AMPLITUDE * DRIFT_FREQUENCY * Math.cos(wave)
          const relativeSpeed = initialSpeeds[i] - v0 - DRIFT_AMPLITUDE * DRIFT_FREQUENCY * Math.cos(i * 2.1)
          // Hermite 速度项保留打断瞬间的速度，起终点位置由原轨道相位决定。
          const h = u * (1 - u) ** 3
          const hPrime = (1 - u) ** 2 * (1 - 4 * u)
          d.orbitAngle = data[active].orbitAngle + phases[i] + drift + windings[i]
            + offsets[i] * (1 - ease(u)) + relativeSpeed * FOCUS_TIMING.align * h
          speeds[i] = speeds[active] + driftSpeed - offsets[i] * easeDerivative(u) / FOCUS_TIMING.align + relativeSpeed * hPrime
        })
        return
      }
      data.forEach((d, i) => {
        const plan = returns[i]
        if (!plan) {
          speeds[i] = d._baseSpeed * (1 - d.hoverFactor * 0.8)
          d.orbitAngle += speeds[i] * dt
          return
        }
        const natural = d._baseSpeed
        const direction = Math.sign(natural) || -1
        if (channels.settle < 1) {
          const u = channels.settle
          d.orbitAngle = plan.initialAngle + plan.initialSpeed * plan.settleDuration * u
            + (natural - plan.initialSpeed) * plan.settleDuration * settleIntegral(u)
          speeds[i] = plan.initialSpeed + (natural - plan.initialSpeed) * u * u * (3 - 2 * u)
        } else {
          const u = channels.returns[i]
          d.orbitAngle = references[i] + plan.winding - direction * plan.gap * (1 - ease(u))
          speeds[i] = natural + direction * plan.gap / plan.duration * easeDerivative(u)
          if (u === 1) returns[i] = null
        }
      })
    },
  }
}
