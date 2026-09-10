import { PerspectiveCamera, Vector3 } from 'three'
import type { ParticleData } from '../types'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { createFocusPoseCalculator, focusFieldOfView } from './focusPose'

const PHASE_STEPS = 180
const TAU = Math.PI * 2
const COMMON_SPEED = -0.015
const DRIFT_AMPLITUDE = 0.025
const DRIFT_FREQUENCY = 0.12
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

/** 只改变 orbitAngle；半径、轨道平面、模型缩放与相机跟随关系保持原有职责。 */
export function createFocusOrbitController(geometry: FocusGeometry) {
  const speeds = [0, 0, 0]
  let initialized = false
  let returning = false
  let active = -1
  let aspect = 0
  let startedAt = 0
  let phases = [0, 0, 0]
  return {
    speeds,
    step(data: ParticleData[], focused: number, camera: PerspectiveCamera, time: number, delta: number, envelopes: readonly number[], distanceScale: number, baseFov = 40) {
      const dt = clamp(delta, 0, 0.1)
      if (!initialized) {
        data.forEach((d, i) => { speeds[i] = d._baseSpeed * (1 - d.hoverFactor * 0.8) })
        initialized = true
      }
      if (focused !== active || (focused >= 0 && Math.abs(aspect - camera.aspect) > 0.02)) {
        returning = focused < 0 && active >= 0
        active = focused
        aspect = camera.aspect
        startedAt = time
        if (active >= 0) phases = chooseFocusPhases(data, active, camera.aspect, focusFieldOfView(camera.aspect, baseFov), envelopes, distanceScale, geometry)
      }
      if (active < 0) {
        data.forEach((d, i) => {
          const natural = d._baseSpeed * (1 - d.hoverFactor * 0.8)
          speeds[i] = returning ? speeds[i] + (natural - speeds[i]) * (1 - Math.exp(-dt / 0.65)) : natural
          d.orbitAngle += speeds[i] * dt
        })
        if (returning && data.every((d, i) => Math.abs(speeds[i] - d._baseSpeed * (1 - d.hoverFactor * 0.8)) < 1e-5)) returning = false
        return
      }
      speeds[active] += (COMMON_SPEED - speeds[active]) * (1 - Math.exp(-dt / 0.65))
      data[active].orbitAngle += speeds[active] * dt
      data.forEach((d, i) => {
        if (i === active) return
        const wave = (time - startedAt) * DRIFT_FREQUENCY + i * 2.1
        const drift = DRIFT_AMPLITUDE * Math.sin(wave)
        const driftSpeed = DRIFT_AMPLITUDE * DRIFT_FREQUENCY * Math.cos(wave)
        const error = shortest(data[active].orbitAngle + phases[i] + drift - d.orbitAngle)
        const desired = speeds[active] + driftSpeed + clamp(error * 2.8, -1.8, 1.8)
        speeds[i] += (desired - speeds[i]) * (1 - Math.exp(-dt / 0.12))
        d.orbitAngle += speeds[i] * dt
      })
    },
  }
}
