import type { Vector3 } from 'three'
import { magneticEase, type MagneticDeformation } from './stellarMagnetism'

const fract = (v: number) => v - Math.floor(v)

/** 展示用拱顶旋转方案，非观测概率分布；一次生成，逐帧不抽样。 */
export function cmeRotationPlan(seed: number) {
  const random = (salt: number) => fract(Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453)
  const amplitude = random(1)
  return {
    handedness: random(2) < 0.5 ? -1 : 1,
    // 主旋扭上限 75°：50% 为 15–40°，30% 为 40–60°，20% 为 60–75°。
    degrees: amplitude < 0.5 ? 15 + 25 * amplitude / 0.5
      : amplitude < 0.8 ? 40 + 20 * (amplitude - 0.5) / 0.3
        : 60 + 15 * (amplitude - 0.8) / 0.2,
    startRadius: 1.50 + 0.12 * random(3),
    settleRadius: 2.16 + 0.12 * random(4),
    profile: 0.95 + 0.50 * random(5),
    followThrough: 0.06 + 0.06 * random(6),
  }
}
export function cmeRotationAngle(radius: number, plan: ReturnType<typeof cmeRotationPlan>) {
  const approach = magneticEase((radius - plan.startRadius) / (plan.settleRadius - plan.startRadius))
  const release = magneticEase((radius - plan.settleRadius) / 0.8)
  return plan.handedness * plan.degrees * Math.PI / 180 * (approach + plan.followThrough * release)
}

/** 绕局部日面法线的连续空间扭转。同一高度使用同一角度，保持接点/闭环连续。 */
export function createCmeRotation(seed: number, enabled = true) {
  const plan = cmeRotationPlan(seed)
  const state = {
    plan, angle: 0, neckHeight: 0, heightRange: 1, centerX: 0, centerZ: 0,
    update(radius: number, shape: MagneticDeformation) {
      state.angle = enabled ? cmeRotationAngle(radius, plan) : 0
      state.neckHeight = (radius * 0.50 + seed * 0.06) * shape.height + shape.neck[1]
      state.heightRange = radius * shape.height * 0.46
      state.centerX = shape.neck[0]; state.centerZ = shape.neck[2]
    },
    apply(point: Vector3, inverse = false) {
      const weight = magneticEase((point.y - state.neckHeight) / state.heightRange) ** plan.profile
      const angle = state.angle * weight * (inverse ? -1 : 1)
      if (angle === 0) return point
      const x = point.x - state.centerX, z = point.z - state.centerZ
      const c = Math.cos(angle), s = Math.sin(angle)
      point.x = state.centerX + c * x - s * z
      point.z = state.centerZ + s * x + c * z
      return point
    },
  }
  return state
}
