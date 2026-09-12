import { redrawEase } from './stellarRedraw'

export const SHORT_LOOP_ERASE = { interval: 0.18, duration: 0.38 } as const

/** 左右短环的展示参数；创建时取样，播放时不使用逐帧随机数。 */
export interface ShortLoopPlan {
  start: number
  riseStart: number
  fallStart: number
  fallDuration: number
  eraseStart: number
  finish: number
  lift: number
  period: number
  damping: number
  kick: number
  phase: number
  secondaryPhase: number
  shoulderLag: number
  shapeBias: number
  layerBias: number
  pulses: Array<{ start: number; duration: number; force: number; tuning: number }>
}

const random = (seed: number, salt: number) => {
  let n = ((seed * 0xffffffff) >>> 0) ^ Math.imul(salt, 0x9e3779b9)
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad)
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296
}

export function createShortLoopPlans(seed: number, start: number, strands: number): [ShortLoopPlan, ShortLoopPlan] {
  const first = random(seed, 201) < 0.5 ? 0 : 1
  const slower = random(seed, 202) < 0.5 ? 0 : 1
  const firstFall = start + 0.72 + 0.12 * random(seed, 203)
  const gap = 0.28 + 0.20 * random(seed, 204)
  const eraseBudget = (strands - 1) * SHORT_LOOP_ERASE.interval + SHORT_LOOP_ERASE.duration
  return [0, 1].map(side => {
    const r = (salt: number) => random(seed, 220 + side * 30 + salt)
    const fallStart = firstFall + (side === first ? 0 : gap)
    const fallDuration = side === slower ? 0.70 + 0.12 * r(1) : 0.50 + 0.08 * r(1)
    const eraseStart = fallStart + Math.max(0, fallDuration + 0.25 - eraseBudget)
    const count = 3 + Math.floor(r(12) * 3)
    const pulses = Array.from({ length: count }, (_, i) => {
      const p = (salt: number) => random(seed, 400 + side * 100 + i * 10 + salt)
      return { start: start + 0.03 + (i + 0.65 * p(0)) / count * (fallStart - start + fallDuration * 0.2),
        duration: 0.24 + 0.18 * p(1), force: (p(2) < 0.5 ? -1 : 1) * (0.045 + 0.075 * p(3)), tuning: 2 * p(4) - 1 }
    })
    return { start, riseStart: start + 0.24 + 0.10 * r(2), fallStart, fallDuration, eraseStart,
      finish: eraseStart + eraseBudget, lift: 0.40 + 0.30 * r(3),
      period: 0.72 + 0.24 * r(4), damping: 0.38 + 0.12 * r(5), kick: (r(13) < 0.5 ? -1 : 1) * (0.08 + 0.08 * r(6)),
      phase: 2 * Math.PI * r(7), secondaryPhase: 2 * Math.PI * r(8),
      shoulderLag: 0.66 + 0.20 * r(9), shapeBias: (r(10) - 0.5) * 0.22, layerBias: r(11) * Math.PI * 2, pulses }
  }) as [ShortLoopPlan, ShortLoopPlan]
}

export function shortLoopCollapse(plan: ShortLoopPlan, age: number) {
  const elapsed = age - plan.fallStart
  return 0.78 * redrawEase(elapsed / plan.fallDuration)
    + 0.22 * redrawEase((elapsed - plan.fallDuration) / (plan.finish - plan.fallStart - plan.fallDuration))
}

export function shortLoopTarget(plan: ShortLoopPlan, age: number) {
  const lift = plan.lift * redrawEase((age - plan.riseStart) / (plan.fallStart - plan.riseStart))
  return (1 + lift) * (1 - 0.97 * shortLoopCollapse(plan, age))
}

export interface ShortLoopShape { height: number; spread: number; skew: number; shoulder: number }

/** 小型确定性响应表：四个耦合模态以 1/120 秒积分一次，之后按事件年龄读取。
 * 表由 CPU 工厂拥有，没有额外时钟、随机帧状态或 GPU 资源。
 */
export function createShortLoopMotion(plan: ShortLoopPlan) {
  const step = 1 / 120, count = Math.ceil((plan.finish - plan.start) / step) + 1
  const table = new Float64Array(count * 4), q = new Float64Array(4), velocity = new Float64Array(4)
  const omega = 2 * Math.PI / plan.period
  // 高度放慢后，两肩仍需及时承接回落，避免迟迟不展开。
  const rates = [omega, omega * plan.shoulderLag * 1.5, omega * 0.79, omega * 0.61]
  const damping = [plan.damping, 0.34, 0.30, 0.38]
  const targets = new Float64Array(4)
  for (let i = 1; i < count; i++) {
    const age = plan.start + i * step, t = age - plan.start
    const gate = redrawEase(t / 0.24) * (1 - redrawEase((age - plan.fallStart) / plan.fallDuration))
    let impulse = 0, tuning = 0
    for (const pulse of plan.pulses) {
      const u = (age - pulse.start) / pulse.duration
      if (u <= 0 || u >= 1) continue
      const weight = Math.sin(Math.PI * u) ** 2
      impulse += pulse.force * weight; tuning += pulse.tuning * weight
    }
    targets[0] = Math.log(shortLoopTarget(plan, age))
    // 高度变化驱动两肩鼓胀；速度项让压扁先于宽度恢复，产生形变滞后。
    targets[1] = 0.62 * Math.tanh(-0.75 * q[0] - 0.10 * velocity[0])
    targets[2] = gate * (plan.shapeBias + 0.24 * Math.sin(omega * 0.72 * t + plan.secondaryPhase)) + 0.05 * velocity[1]
    targets[3] = 0.72 * q[1] + gate * 0.18 * Math.sin(omega * 0.91 * t + plan.phase)
    for (let k = 0; k < 4; k++) {
      const force = k === 0 ? omega * omega * (-plan.kick * redrawEase(t / 0.16) * Math.exp(-t / 0.24) + gate * impulse) : 0
      // 回弹采用更慢、阻尼更强的响应；回落时平滑接近目标，避免延长悬停。
      const fallBlend = redrawEase((age - plan.fallStart) / 0.30)
      const rate = k === 0 ? (omega + (14 - omega) * fallBlend) * (1 + 0.07 * Math.tanh(tuning)) : rates[k]
      const acceleration = rate ** 2 * (targets[k] - q[k]) - 2 * damping[k] * rate * velocity[k] + force
      velocity[k] += acceleration * step
      q[k] += velocity[k] * step
      table[i * 4 + k] = q[k]
    }
  }
  const state: ShortLoopShape = { height: 1, spread: 0, skew: 0, shoulder: 0 }, values = new Float64Array(4)
  let sampledAge = NaN
  return { plan, sample(age: number) {
    if (sampledAge !== age) {
      sampledAge = age
      const cell = Math.max(0, Math.min(count - 1, (age - plan.start) / step))
      const lo = Math.min(count - 2, Math.floor(cell)), f = cell - lo
      for (let k = 0; k < 4; k++) values[k] = table[lo * 4 + k] * (1 - f) + table[(lo + 1) * 4 + k] * f
      state.height = Math.exp(values[0])
      state.spread = 0.75 * Math.tanh(values[1] / 0.75)
      state.skew = 0.35 * Math.tanh(values[2] / 0.35)
      state.shoulder = 0.65 * Math.tanh(values[3] / 0.65)
    }
    return state
  } }
}

/** 端点固定的柔性拱形。所有丝线共用模态，仅附加沿层次连续的小幅偏差。 */
export function shortLoopProfile(s: number, rank: number, plan: ShortLoopPlan, shape: ShortLoopShape, out: { x: number; y: number; z: number }) {
  const sin = Math.sin(Math.PI * s), cos = Math.cos(Math.PI * s), window = sin * sin
  const layer = 0.018 * (2 * rank - 1) * Math.sin(plan.layerBias + Math.PI * s)
  out.x = s - 0.13 * shape.spread * Math.sin(2 * Math.PI * s) * sin + 0.10 * shape.skew * window
  out.y = shape.height * sin * (1 + shape.spread * cos * cos + window * (shape.skew * cos + shape.shoulder * (cos * cos - 0.25) + layer))
  out.z = window * (0.055 * shape.skew * cos + 0.025 * shape.shoulder * Math.sin(2 * Math.PI * s))
  return out
}
