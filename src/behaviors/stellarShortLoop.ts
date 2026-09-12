import { redrawEase } from './stellarRedraw'

export const SHORT_LOOP_ERASE = { interval: 0.18, duration: 0.38 } as const
/** 常规完整退场间隔；事件剩余时间不足时缩短延后量，不截断擦除队列。 */
export const SHORT_LOOP_RETIREMENT = { gap: 1.0, gapSpread: 0.55 } as const
/** 单位质量下相对于原横向弹簧的刚度；激发强度独立，避免降 k 时推力也同步减弱。 */
export const SHORT_LOOP_TRANSVERSE = { stiffnessScale: 0.25, driveGain: 2.40, maxDisplacement: 0.46 } as const

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
  transverse: { start: number; duration: number; period: number; damping: number; kick: number; lag: number;
    legLag: [number, number]; legGain: [number, number]; stiffnessScale: number; driveGain: number; maxDisplacement: number }
}

const random = (seed: number, salt: number) => {
  let n = ((seed * 0xffffffff) >>> 0) ^ Math.imul(salt, 0x9e3779b9)
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad)
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296
}

export function createShortLoopPlans(seed: number, start: number, strands: number, contact = start, end = Infinity): [ShortLoopPlan, ShortLoopPlan] {
  const first = random(seed, 201) < 0.5 ? 0 : 1
  const firstFall = start + 0.72 + 0.12 * random(seed, 203)
  const initialGap = 0.28 + 0.20 * random(seed, 204)
  const eraseBudget = (strands - 1) * SHORT_LOOP_ERASE.interval + SHORT_LOOP_ERASE.duration
  const fallDurationFor = (side: number) => side === first
    ? 0.50 + 0.08 * random(seed, 220 + side * 30 + 1)
    : 0.95 + 0.25 * random(seed, 220 + side * 30 + 1)
  const finishAfter = (side: number) => Math.max(eraseBudget, fallDurationFor(side) + 0.25)
  const earlyFinish = firstFall + finishAfter(first)
  const lateBaseFinish = firstFall + initialGap + finishAfter(1 - first)
  const desiredGap = SHORT_LOOP_RETIREMENT.gap + SHORT_LOOP_RETIREMENT.gapSpread * random(seed, 205)
  const delay = Math.max(0, Math.min(earlyFinish + desiredGap - lateBaseFinish, end - lateBaseFinish))
  const gap = initialGap + delay
  return [0, 1].map(side => {
    const r = (salt: number) => random(seed, 220 + side * 30 + salt)
    const fallStart = firstFall + (side === first ? 0 : gap)
    const fallDuration = fallDurationFor(side)
    const eraseStart = fallStart + Math.max(0, fallDuration + 0.25 - eraseBudget)
    const count = 3 + Math.floor(r(12) * 3)
    const fastLeg = r(21) < 0.5 ? 0 : 1
    const fastLag = 0.035 + 0.020 * r(22), slowLag = 0.11 + 0.05 * r(23)
    const pulses = Array.from({ length: count }, (_, i) => {
      const p = (salt: number) => random(seed, 400 + side * 100 + i * 10 + salt)
      return { start: start + 0.03 + (i + 0.65 * p(0)) / count * (fallStart - start + fallDuration * 0.2),
        duration: 0.24 + 0.18 * p(1), force: (p(2) < 0.5 ? -1 : 1) * (0.045 + 0.075 * p(3)), tuning: 2 * p(4) - 1 }
    })
    return { start, riseStart: start + 0.24 + 0.10 * r(2), fallStart, fallDuration, eraseStart,
      finish: eraseStart + eraseBudget, lift: 0.40 + 0.30 * r(3),
      period: 0.72 + 0.24 * r(4), damping: 0.38 + 0.12 * r(5), kick: (r(13) < 0.5 ? -1 : 1) * (0.08 + 0.08 * r(6)),
      phase: 2 * Math.PI * r(7), secondaryPhase: 2 * Math.PI * r(8),
      shoulderLag: 0.66 + 0.20 * r(9), shapeBias: (r(10) - 0.5) * 0.22, layerBias: r(11) * Math.PI * 2, pulses,
      transverse: { ...SHORT_LOOP_TRANSVERSE, start: contact + 0.08 + 0.08 * r(14), duration: 0.20 + 0.08 * r(15),
        period: 1.10 + 0.40 * r(16), damping: 0.16 + 0.07 * r(17),
        kick: (side === 0 ? -1 : 1) * (0.20 + 0.08 * r(19)), lag: 0.55 + 0.20 * r(20),
        legLag: fastLeg === 0 ? [fastLag, slowLag] : [slowLag, fastLag],
        legGain: [0.95 + 0.20 * r(24), 0.95 + 0.20 * r(25)] } }
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

export interface ShortLoopShape { height: number; spread: number; skew: number; shoulder: number; sway: number; shear: number; legLeft: number; legRight: number }

/** 弧长相对参考曲线的容差；不是拱顶位移/弧长。长度使用足点间距归一化。 */
export interface ShortLoopArcDiagnostic { length: number; reference: number; maxStrain: number; projection: number }

export const SHORT_LOOP_ARC = { strainLimit: 0.20, stiffness: 95, samples: 40 } as const

export function shortLoopRestHeight(plan: ShortLoopPlan, age: number) {
  // 整束几何随消退趋近弦线；不把末尾 3% 高度留下作为永久振荡支架。
  return shortLoopTarget(plan, age) * (1 - redrawEase((age - plan.fallStart - plan.fallDuration) / (plan.finish - plan.fallStart - plan.fallDuration)))
}

export function shortLoopRestShape(plan: ShortLoopPlan, age: number): ShortLoopShape {
  return { height: shortLoopRestHeight(plan, age), spread: 0, skew: 0, shoulder: 0, sway: 0, shear: 0, legLeft: 0, legRight: 0 }
}

/** 用实际轮廓（含两肩、环腿、纵深）测量归一化弧长；只在预计算/诊断中使用。 */
export function shortLoopArcLength(plan: ShortLoopPlan, shape: ShortLoopShape, aspect = 0.45, rank = 0.5) {
  const point = { x: 0, y: 0, z: 0 }, previous = { ...point }
  let length = 0
  for (let i = 0; i <= SHORT_LOOP_ARC.samples; i++) {
    shortLoopProfile(i / SHORT_LOOP_ARC.samples, rank, plan, shape, point)
    point.y *= aspect * (1 - 0.22 * rank); point.z *= aspect * (1 - 0.22 * rank)
    if (i) length += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z)
    Object.assign(previous, point)
  }
  return length
}

/** 横摆、对数高度和两肩在同一时间网格中求解，共享弧长势能的梯度。
 * 表由 CPU 工厂拥有，播放按事件年龄读取；足点固定，不增加 RAF 或逐帧随机数。
 */
export function createShortLoopMotion(plan: ShortLoopPlan, aspect = 0.45) {
  const step = 1 / 120, start = Math.min(plan.start, plan.transverse.start)
  const count = Math.ceil((plan.finish - start) / step) + 1
  const table = new Float64Array(count * 8), q = new Float64Array(8), velocity = new Float64Array(6)
  const omega = 2 * Math.PI / plan.period, p = plan.transverse
  const baseOmega = 2 * Math.PI / p.period, horizontal = baseOmega * Math.sqrt(p.stiffnessScale)
  const rates = [omega, omega * plan.shoulderLag * 1.5, omega * 0.79, omega * 0.61, horizontal, horizontal * p.lag]
  const damping = [plan.damping, 0.34, 0.30, 0.38, p.damping, 0.65]
  const targets = new Float64Array(6), forces = new Float64Array(6), gradient = new Float64Array(6)
  const activeModes = [0, 1, 4] // 高度、两肩展开、横摆共同承担张力。
  const scratch: ShortLoopShape = shortLoopRestShape(plan, start)
  function shapeFrom(values: Float64Array, age: number, out: ShortLoopShape) {
    const collapse = shortLoopCollapse(plan, age)
    const remaining = Math.max(0, 1 - collapse)
    const retire = 1 - redrawEase((age - plan.fallStart - plan.fallDuration) / (plan.finish - plan.fallStart - plan.fallDuration))
    // 剩余拱起空间收紧可用横摆范围；从参考弧长趋近弦长的同一进度派生。
    const envelope = Math.sqrt(remaining) * retire
    out.height = Math.exp(values[0]) * retire
    out.spread = 0.75 * Math.tanh(values[1] / 0.75) * retire
    out.skew = 0.35 * Math.tanh(values[2] / 0.35) * envelope
    out.shoulder = 0.65 * Math.tanh(values[3] / 0.65) * retire
    out.sway = p.maxDisplacement * Math.tanh(values[4] / p.maxDisplacement) * envelope
    out.shear = 0.045 * Math.tanh((values[4] - values[5]) / 0.12) * envelope
    out.legLeft = p.maxDisplacement * Math.tanh(p.legGain[0] * values[6] / p.maxDisplacement) * envelope
    out.legRight = p.maxDisplacement * Math.tanh(p.legGain[1] * values[7] / p.maxDisplacement) * envelope
    return out
  }
  const measure = (age: number) => shortLoopArcLength(plan, shapeFrom(q, age, scratch), aspect)
  for (let i = 1; i < count; i++) {
    const age = Math.min(plan.finish, start + i * step), t = Math.max(0, age - plan.start)
    const gate = redrawEase(t / 0.24) * (1 - redrawEase((age - plan.fallStart) / plan.fallDuration))
    const fall = redrawEase((age - plan.fallStart) / 0.30)
    let impulse = 0, tuning = 0
    for (const pulse of plan.pulses) {
      const u = (age - pulse.start) / pulse.duration
      if (u <= 0 || u >= 1) continue
      const weight = Math.sin(Math.PI * u) ** 2
      impulse += pulse.force * weight; tuning += pulse.tuning * weight
    }
    targets[0] = Math.log(shortLoopTarget(plan, age))
    targets[1] = 0.62 * Math.tanh(-0.75 * q[0] - 0.10 * velocity[0])
    targets[2] = gate * (plan.shapeBias + 0.24 * Math.sin(omega * 0.72 * t + plan.secondaryPhase)) + 0.05 * velocity[1]
    targets[3] = 0.72 * q[1] + gate * 0.18 * Math.sin(omega * 0.91 * t + plan.phase)
    targets[4] = 0; targets[5] = q[4]
    const pulseAge = (age - p.start) / p.duration
    forces.fill(0)
    forces[0] = omega ** 2 * (-plan.kick * redrawEase(t / 0.16) * Math.exp(-t / 0.24) + gate * impulse)
    forces[4] = pulseAge > 0 && pulseAge < 1 ? baseOmega ** 2 * p.kick * p.driveGain * Math.sin(Math.PI * pulseAge) ** 2 : 0
    const rest = shortLoopArcLength(plan, shortLoopRestShape(plan, age), aspect)
    const length = measure(age), strain = (length - rest) / rest
    // 二次势能叠加六次项，接近 20% 时渐进增强；不切换两个独立的 k。
    const tension = SHORT_LOOP_ARC.stiffness * (length - rest) * (1 + 5 * (Math.abs(strain) / SHORT_LOOP_ARC.strainLimit) ** 4)
    for (const k of activeModes) {
      const original = q[k], epsilon = 0.0005
      q[k] = original + epsilon; const plus = measure(age)
      q[k] = original - epsilon; const minus = measure(age)
      q[k] = original
      gradient[k] = (plus - minus) / (2 * epsilon)
      forces[k] -= tension * gradient[k]
    }
    for (let k = 0; k < 6; k++) {
      if (age < plan.start && k < 4 && k !== 0 && k !== 1) continue
      const rate = k === 0 ? (omega + (14 - omega) * fall) * (1 + 0.07 * Math.tanh(tuning)) : rates[k]
      const drag = damping[k] + (k >= 4 ? 0.60 * fall : 0.18 * fall)
      const acceleration = rate ** 2 * (targets[k] - q[k]) - 2 * drag * rate * velocity[k] + forces[k]
      velocity[k] += acceleration * step; q[k] += velocity[k] * step
    }
    for (let leg = 0; leg < 2; leg++) q[6 + leg] += (q[4] - q[6 + leg]) * (1 - Math.exp(-step / p.legLag[leg]))
    // 只修正超出弧长容差的状态，并去除继续向约束外走的速度，避免下一步反复撞限。
    for (let iteration = 0; iteration < 4; iteration++) {
      const actual = measure(age), error = actual - Math.max(1, Math.min(rest * 1.199, Math.max(rest * 0.801, actual)))
      if (Math.abs(error) < 1e-6) break
      let norm = 0
      for (const k of activeModes) { norm += gradient[k] ** 2 }
      if (norm < 1e-9) break
      let outward = 0
      for (const k of activeModes) { q[k] -= error * gradient[k] / norm; outward += velocity[k] * gradient[k] }
      if (outward * error > 0) for (const k of activeModes) velocity[k] -= outward * gradient[k] / norm
    }
    table.set(q, i * 8)
  }
  const state = shortLoopRestShape(plan, start), values = new Float64Array(8)
  const diagnostic = { length: 1, reference: 1, strain: 0, aspect }
  let sampledAge = NaN
  return { plan, aspect, sample(age: number) {
    if (sampledAge !== age) {
      sampledAge = age
      const cell = Math.max(0, Math.min(count - 1, (age - start) / step))
      const lo = Math.min(count - 2, Math.floor(cell)), f = cell - lo
      for (let k = 0; k < 8; k++) values[k] = table[lo * 8 + k] * (1 - f) + table[(lo + 1) * 8 + k] * f
      shapeFrom(values, age, state)
    }
    return state
  }, arc(age: number) {
    diagnostic.length = shortLoopArcLength(plan, this.sample(age), aspect)
    diagnostic.reference = shortLoopArcLength(plan, shortLoopRestShape(plan, age), aspect)
    diagnostic.strain = diagnostic.length / diagnostic.reference - 1
    return diagnostic
  } }
}

/** 端点固定的柔性拱形。所有丝线共用模态，仅附加沿层次连续的小幅偏差。 */
export function shortLoopProfile(s: number, rank: number, plan: ShortLoopPlan, shape: ShortLoopShape, out: { x: number; y: number; z: number }, transverse = true) {
  const sin = Math.sin(Math.PI * s), cos = Math.cos(Math.PI * s), window = sin * sin
  const layer = 0.018 * (2 * rank - 1) * Math.sin(plan.layerBias + Math.PI * s)
  out.x = s + (1 - 2 * Math.abs(shape.sway)) * (-0.13 * shape.spread * Math.sin(2 * Math.PI * s) * sin + 0.10 * shape.skew * window)
  out.y = shape.height * sin * (1 + shape.spread * cos * cos + window * (shape.skew * cos + shape.shoulder * (cos * cos - 0.25) + layer))
  out.z = window * (0.055 * shape.skew * cos + 0.025 * shape.shoulder * Math.sin(2 * Math.PI * s))
  if (transverse) {
    const x = out.x, y = out.y, z = out.z
    shortLoopDeflection(s, shape, out)
    out.x += x; out.y *= y; out.z += z
  }
  return out
}

/** x 为跨度比例、y 为相对弦线高度倍率、z 为高度比例；足点位置固定，允许根部切向转动。 */
export function shortLoopDeflection(s: number, shape: ShortLoopShape, out: { x: number; y: number; z: number }) {
  const sin = Math.sin(Math.PI * s), cos = Math.cos(Math.PI * s), window = sin * sin
  // 根部窗口线性离开足点，在拱顶归零；增强环腿不会继续放大拱顶。
  const root = sin * (1 - sin), leftWeight = (1 + cos) / 2
  const leg = leftWeight * shape.legLeft + (1 - leftWeight) * shape.legRight
  const bias = 2 * Math.atanh(2 * shape.sway) + 2 * root * (leg - shape.sway) + shape.shear * sin * cos
  const warped = s / (s + (1 - s) * Math.exp(-bias))
  out.x = warped - s
  out.y = 1 + 1.5 * shape.shear * window * cos
  out.z = 0.10 * shape.shear * window * Math.sin(2 * Math.PI * s) + 0.12 * root * (shape.legLeft - shape.legRight)
  return out
}
