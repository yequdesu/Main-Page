import { Vector3 } from 'three'
import { magneticFormationDrive, type MagneticLifecycle } from './stellarLifecycle'

export const MAGNETIC = { strands: 12, dip: 0.24, cut: 0.22, contact: 0.45, samples: 113, modes: 5 } as const
export type MagneticBranch = 0 | 1 | 2 // 原连接 / 上方局部闭合磁通 / 下方足点拱廊
const TAU = Math.PI * 2
const fract = (v: number) => v - Math.floor(v)
const clamp = (v: number) => Math.max(0, Math.min(1, v))
export const magneticEase = (v: number) => { const t = clamp(v); return t * t * t * (10 + t * (-15 + 6 * t)) }

/** 不同磁通通道依次进入重联层，避免整束同时切换。仅为拓扑展示进度，不是重联率。 */
export function magneticStage(radius: number, strand: number, seed: number) {
  return clamp((radius - (1.48 + 0.32 * fract(strand * 0.618 + seed))) / 1.38)
}
export function magneticSourceCoordinate(s: number, branch: MagneticBranch) {
  if (branch === 1) return MAGNETIC.cut + s * (1 - 2 * MAGNETIC.cut)
  if (branch === 2) return s < 0.5 ? 2 * MAGNETIC.cut * s : 1 - 2 * MAGNETIC.cut * (1 - s)
  return s
}

/** 线性化张力的低阶模态，叠加在径向失稳参考轴上；不是完整的磁场方程求解器。 */
export function createMagneticDeformation(seed: number, lifecycle?: MagneticLifecycle, handedness = 1) {
  const displacement = new Float64Array(MAGNETIC.modes * 3), velocity = new Float64Array(displacement.length)
  const force = new Float64Array(displacement.length)
  const evaluated = new Float64Array(6)
  let evaluatedS = NaN
  const neck = new Float64Array(3)
  const neckBasis = Float64Array.from({ length: MAGNETIC.modes }, (_, m) => (Math.sin((m + 1) * Math.PI * MAGNETIC.cut) + Math.sin((m + 1) * Math.PI * (1 - MAGNETIC.cut))) / 2)
  function updateNeck() {
    neck.fill(0)
    for (let m = 0; m < MAGNETIC.modes; m++) for (let axis = 0; axis < 3; axis++) neck[axis] += displacement[m * 3 + axis] * neckBasis[m]
  }
  const span = 0.72 + 0.70 * fract(seed * 3.17)
  const height = 0.76 + 0.53 * fract(seed * 7.13)
  const twist = handedness * (0.55 + 0.80 * fract(seed * 5.71))
  // 启用生命周期时，从中性轮廓出发。参考轮廓积分驱动历史，不能预先抽取最终拱顶。
  const roof = lifecycle ? [1.35, 0, 0.09, 0.5, 0.15] : [
    1.0 + 0.9 * fract(seed * 9.23), 0.65 * (fract(seed * 6.41) - 0.5),
    0.035 + 0.31 * fract(seed * 2.83), 0.34 + 0.32 * fract(seed * 8.37), 0.10 + 0.13 * fract(seed * 11.17),
  ]
  for (let m = 0; m < MAGNETIC.modes; m++) for (let axis = 0; axis < 3; axis++) {
    displacement[m * 3 + axis] = 0.028 * Math.sin((m + 1) * (axis + 2) + seed * TAU) / (m + 1)
  }
  updateNeck()
  return {
    displacement, span, height, twist, neck,
    get apexPower() { return roof[0] + (1.15 - roof[0]) * (lifecycle?.relaxation ?? 0) * 0.8 },
    get apexSkew() { return roof[1] * (1 - 0.7 * (lifecycle?.relaxation ?? 0)) },
    get dipDepth() { return roof[2] * (1 - 0.9 * (lifecycle?.relaxation ?? 0)) },
    get dipCenter() { return roof[3] },
    get dipWidth() { return roof[4] },
    component(s: number, axis: number, derivative = false) {
      if (s !== evaluatedS) {
        evaluatedS = s; evaluated.fill(0)
        for (let m = 0; m < MAGNETIC.modes; m++) {
          const k = (m + 1) * Math.PI, sin = Math.sin(k * s), derivativeCos = k * Math.cos(k * s)
          for (let dimension = 0; dimension < 3; dimension++) {
            evaluated[dimension] += displacement[m * 3 + dimension] * sin
            evaluated[dimension + 3] += displacement[m * 3 + dimension] * derivativeCos
          }
        }
      }
      return evaluated[axis + (derivative ? 3 : 0)]
    },
    step(dt: number, radius: number, position: Float64Array, temperature: Float64Array, branches: Uint8Array, first = 0, end = position.length) {
      evaluatedS = NaN
      force.fill(0)
      // 热压非均匀驱动和外部磁约束不对称；只驱动横向形变，不重复求径向 hoop 力。
      for (let m = 0; m < MAGNETIC.modes; m++) {
        const k = m + 1, phase = seed * TAU + k * 1.7
        force[m * 3] = 0.09 * Math.sin(phase) * (1 + 0.15 * Math.log(radius)) / k
        force[m * 3 + 2] = 0.065 * Math.cos(phase) / k
      }
      for (let i = first; i < end; i++) {
        if (branches[i] !== 0) continue // 重联后两支不再把质量加载到原来的轴。
        for (let m = 0; m < MAGNETIC.modes; m++) {
          const weight = 2 * Math.sin((m + 1) * Math.PI * position[i]) / (end - first)
          force[m * 3 + 1] += weight * (0.10 * temperature[i] - 0.20 * (1 - temperature[i]))
        }
      }
      if (lifecycle) {
        const { age, drive, relaxation } = lifecycle
        // 热负载和时变外部应力共同留下形态记忆；驱动消失后保留积分结果。
        const load = force[1]
        roof[0] = Math.max(1.02, Math.min(2.15, roof[0] + dt * drive * (0.22 * magneticFormationDrive(age, seed, 0, 0) - 0.18 * load)))
        roof[1] = Math.max(-0.43, Math.min(0.43, roof[1] + dt * drive * 0.18 * magneticFormationDrive(age, seed, 1, 1)))
        roof[2] = Math.max(0.015, Math.min(0.36, roof[2] + dt * drive * (0.075 * magneticFormationDrive(age, seed, 2, 2) - 0.32 * load)))
        roof[3] = Math.max(0.32, Math.min(0.68, roof[3] + dt * drive * 0.055 * magneticFormationDrive(age, seed, 1, 0)))
        roof[4] = Math.max(0.10, Math.min(0.23, roof[4] + dt * drive * 0.025 * magneticFormationDrive(age, seed, 0, 2)))
        for (let m = 0; m < MAGNETIC.modes; m++) for (let axis = 0; axis < 3; axis++) {
          const i = m * 3 + axis
          force[i] = force[i] * (1 - 0.96 * relaxation)
            + drive * 0.42 * magneticFormationDrive(age, seed, m, axis) / (m + 1) ** 1.3
        }
      }
      for (let m = 0; m < MAGNETIC.modes; m++) {
        const omega2 = 0.14 * ((m + 1) * Math.PI / span) ** 2
        const damping = lifecycle ? 0.8 + 0.9 * (1 - lifecycle.drive) + lifecycle.relaxation * (1 + m * 0.4) : 0.65
        for (let axis = 0; axis < 3; axis++) {
          const i = m * 3 + axis
          velocity[i] += (force[i] - omega2 * displacement[i] - damping * velocity[i]) * dt
          displacement[i] += velocity[i] * dt
        }
      }
      updateNeck()
    },
  }
}
export type MagneticDeformation = ReturnType<typeof createMagneticDeformation>

/** Φ=B·πa²：局部场强随高度及活动区左右位置变化，截面不再按统一 ρ 缩放。 */
export function magneticFieldStrength(s: number, height: number, seed: number) {
  const asymmetry = 1 + (seed - 0.5) * 0.5 * (2 * s - 1)
  return asymmetry * (0.12 + 0.88 / (1 + Math.max(0, height) / (0.8 + seed * 0.7)) ** (1.2 + seed * 0.6))
}
export function magneticFluxRadius(s: number, height: number, seed: number) {
  return (0.075 + 0.065 * fract(seed * 4.31)) / Math.sqrt(magneticFieldStrength(s, height, seed))
}

function connected(s: number, strand: number, radius: number, seed: number, pinch: number, target: Vector3, shape?: MagneticDeformation) {
  const arch = Math.max(0, Math.sin(Math.PI * s)), cosine = Math.cos(Math.PI * s), signed = 2 * s - 1
  const jitter = fract(strand * 0.618 + seed)
  const foot = 0.94 + 0.12 * jitter, shear = 0.16 * (seed - 0.5) + 0.018 * (strand - 5.5)
  const skew = 0.16 * (seed - 0.5), tilt = shape?.apexSkew ?? 0.10 * (seed - 0.5)
  const power = shape?.apexPower ?? 1, depth = shape?.dipDepth ?? MAGNETIC.dip
  const dipCenter = shape?.dipCenter ?? 0.5, dipWidth = shape?.dipWidth ?? 0.16
  const dip = Math.exp(-(((s - dipCenter) / dipWidth) ** 2))
  const roof = arch ** power
  const roofDerivative = power * arch ** (power - 1) * Math.PI * cosine
  const dipDerivative = 2 * arch * Math.PI * cosine * dip - arch * arch * dip * 2 * (s - dipCenter) / (dipWidth * dipWidth)
  const width = foot + 0.18 * (radius - 1) * arch * arch
  const x = (signed * width + skew * arch * arch) * (shape?.span ?? 1) + (shape?.component(s, 0) ?? 0)
  const y = (radius * roof * (1 + tilt * signed) - depth * arch * arch * dip) * (shape?.height ?? 1) + (shape?.component(s, 1) ?? 0)
  const z = shear * signed + 0.11 * Math.sin(TAU * s) * arch * arch + (shape?.component(s, 2) ?? 0)
  const dx = (2 * width + signed * 0.36 * (radius - 1) * arch * Math.PI * cosine + 2 * skew * arch * Math.PI * cosine) * (shape?.span ?? 1) + (shape?.component(s, 0, true) ?? 0)
  const dy = (radius * roofDerivative * (1 + tilt * signed) + 2 * tilt * radius * roof - depth * dipDerivative) * (shape?.height ?? 1) + (shape?.component(s, 1, true) ?? 0)
  const dz = 2 * shear + 0.11 * (TAU * Math.cos(TAU * s) * arch * arch + Math.sin(TAU * s) * 2 * arch * Math.PI * cosine) + (shape?.component(s, 2, true) ?? 0)
  const xy = Math.max(1e-6, Math.hypot(dx, dy)), length = Math.max(1e-6, Math.hypot(dx, dy, dz))
  const phase = TAU * ((shape?.twist ?? 0.9) * s + 0.065 * Math.sin(TAU * s) + strand / MAGNETIC.strands + seed)
  const tube = magneticFluxRadius(s, y, seed) * arch * arch * (0.55 + 0.45 * jitter)
  const cn = tube * Math.cos(phase), bn = tube * Math.sin(phase)
  target.set(x - dy / xy * cn - dz * dx / (length * xy) * bn,
    y + dx / xy * cn - dz * dy / (length * xy) * bn, z + xy / length * bn)
  const distance = Math.abs(s - 0.5) - (0.5 - MAGNETIC.cut)
  const neck = pinch * Math.exp(-((distance / 0.105) ** 4))
  const neckY = (radius * 0.50 + seed * 0.06) * (shape?.height ?? 1) + (shape?.neck[1] ?? 0)
  const neckX = shape?.neck[0] ?? 0
  const neckZ = shear * 0.25 + (shape?.neck[2] ?? 0)
  // 接触点仍有非零的沿场切向速度；不能将整个一阶导数一起压至零。
  target.x += (neckX - target.x) * neck
  target.y += (neckY - distance * 2.8 - target.y) * neck
  target.z += (neckZ - target.z) * neck
  return target
}

/** 以同一条原始流线分裂得到两条新连接；接触瞬间位置一致，随后张力回缩。 */
export function sampleMagneticStrand(s: number, strand: number, radius: number, seed: number, branch: MagneticBranch, target: Vector3, shape?: MagneticDeformation) {
  const stage = magneticStage(radius, strand, seed)
  const pinch = magneticEase(stage / MAGNETIC.contact)
  if (branch === 0) return connected(s, strand, radius, seed, pinch, target, shape)
  const originalS = magneticSourceCoordinate(s, branch)
  connected(originalS, strand, radius, seed, 1, target, shape)
  const release = magneticEase((stage - MAGNETIC.contact) / (1 - MAGNETIC.contact))
  const jitter = fract(strand * 0.618 + seed)
  const shear = 0.16 * (seed - 0.5) + 0.018 * (strand - 5.5)
  if (branch === 1) {
    const angle = TAU * s, envelope = Math.sin(Math.PI * s) ** 2
    const bottom = 0.5 * radius + seed * 0.06 + 0.22 * Math.max(0, radius - 1.8) + 0.045 * radius * jitter
    const top = radius + 0.15 - 0.06 * radius * jitter
    const width = (0.68 + 0.24 * Math.max(0, radius - 2)) * (0.86 + 0.26 * jitter)
    const filament = 0.045 * radius * envelope
    const phase = TAU * (Math.sign(shape?.twist ?? 1) * 2 * s + strand / MAGNETIC.strands + seed)
    const x = (-width * Math.sin(angle) * (1 + 0.13 * Math.cos(angle + seed * TAU)) + 0.08 * (seed - 0.5) * (1 - Math.cos(angle)) + filament * Math.cos(phase)) * (shape?.span ?? 1) + (shape?.component(0.5, 0) ?? 0)
    const y = (bottom + (top - bottom) * (1 - Math.cos(angle)) / 2 + filament * Math.sin(phase)) * (shape?.height ?? 1) + (shape?.component(0.5, 1) ?? 0)
    const z = shear * 0.25 + 0.15 * radius * Math.sin(angle) + filament * Math.sin(phase + 0.8) + (shape?.component(0.5, 2) ?? 0)
    target.set(target.x + (x - target.x) * release, target.y + (y - target.y) * release, target.z + (z - target.z) * release)
  } else {
    const foot = 0.94 + 0.12 * jitter
    const x = (2 * s - 1) * foot * (shape?.span ?? 1) + 0.25 * (shape?.component(s, 0) ?? 0)
    const y = (0.43 + strand * 0.022 + 0.08 * seed) * Math.sin(Math.PI * s) ** (shape?.apexPower ?? 1) * (1 + (shape?.apexSkew ?? 0) * (2 * s - 1)) * (shape?.height ?? 1) + 0.25 * (shape?.component(s, 1) ?? 0)
    const z = shear * (2 * s - 1) + 0.08 * Math.sin(TAU * s) * Math.sin(Math.PI * s) ** 2
    target.set(target.x + (x - target.x) * release, target.y + (y - target.y) * release, target.z + (z - target.z) * release)
  }
  return target
}
