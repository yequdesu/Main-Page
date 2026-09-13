import { Vector3 } from 'three'
import { createArcBundle } from './stellarArcConstraint'
import { clamp01, redrawEase, traceFront, REDRAW } from './stellarRedraw'
import { createMagneticLifecycle, MAGNETIC_LIFETIME, type MagneticTiming } from './stellarLifecycle'
import type { ProminenceFamily } from './stellarMorphology'
import { createShortRecoil } from './stellarRecoil'
import { createShortLoopPlans, createShortLoopMotion, shortLoopCollapse, shortLoopProfile, shortLoopDeflection, shortLoopRestShape, SHORT_LOOP_ERASE, type ShortLoopPlan } from './stellarShortLoop'

const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
export const LOCAL_RECONNECTION = { approach: 0.30, exchange: 0.65, settle: 0.28, strandInterval: SHORT_LOOP_ERASE.interval, collapse: SHORT_LOOP_ERASE.duration, centralHold: 0.12, centralLower: 0.40, centralErase: 0.40, centralInterval: 0.12, corridorGap: 0.009 } as const
/** 分离随机流，调整时序不改变静态构型。所有概率均为展示参数，不是观测统计。 */
const random = (seed: number, salt: number) => {
  let n = ((seed * 0xffffffff) >>> 0) ^ Math.imul(salt, 0x9e3779b9)
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad)
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296
}
export interface FamilyEvolution {
  seed: number
  strands: number
  timing: MagneticTiming
  probability: number
  draw: number
  background: number
  reorganizes: boolean
  approach: number
  contact: number
  finish: number
  sides: [ShortLoopPlan, ShortLoopPlan]
}

/** 中央保留较弱的解析脉冲响应；两侧改用耦合形变。 */
export function createCentralRecoil(plan: FamilyEvolution) {
  const branch = 3
  return createShortRecoil({
    start: plan.contact + LOCAL_RECONNECTION.exchange + 0.40 + 0.035 * random(plan.seed, 80 + branch),
    period: (0.44 + 0.10 * random(plan.seed, 90 + branch)) * 0.82,
    decay: (1.5 + 0.25 * random(plan.seed, 100 + branch)) * 1.5,
    amplitude: (0.12 + 0.03 * random(plan.seed, 110 + branch)) * 0.45,
    skewSign: random(plan.seed, 120 + branch) < 0.5 ? -1 : 1,
  })
}

export function createMagneticEvolution(families: readonly ProminenceFamily[], duration = MAGNETIC_LIFETIME): FamilyEvolution[] {
  const dominant = families.reduce((best, f, i) => f.width > families[best].width ? i : best, 0)
  const anchors = new Set(families.map(f => f.sourceKind).map(kind => families.findIndex(f => f.sourceKind === kind)))
  return families.map((family, i) => {
    // 每种组成的首环使用完整的自然生命周期；若重组则允许提前完成退场。
    const anchor = anchors.has(i), birth = anchor ? 0 : 0.7 + 2.7 * random(family.seed, 1)
    const end = anchor ? duration : duration - 1.2 - 3 * random(family.seed, 2)
    const grown = birth + 4.8 + 1.6 * random(family.seed, 3)
    const decay = end - (12 + 3.6 * random(family.seed, 4))
    const timing = { birth, grown, settled: grown + 1.6, decay, end }
    const background = random(family.seed, 5), draw = random(family.seed, 6)
    const probability = i === dominant ? 0.72 * ease((family.width * 2 - 0.7) / 1.7) * (0.35 + 0.65 * background) : 0
    const contact = decay + (end - decay) * (0.55 + 0.07 * random(family.seed, 7))
    const sides = createShortLoopPlans(family.seed, contact + LOCAL_RECONNECTION.exchange, family.strands, contact, end - 0.05)
    return { seed: family.seed, strands: family.strands, timing, background, probability, draw, reorganizes: draw < probability,
      approach: contact - LOCAL_RECONNECTION.approach, contact, sides,
      finish: Math.max(...sides.map(side => side.finish)) }
  })
}

export function evolutionPhase(plan: FamilyEvolution, age: number) {
  if (plan.reorganizes && age >= plan.approach) {
    if (age >= plan.finish) return '重组已结束'
    if (age < plan.contact) return '短环预生长'
    if (age < plan.contact + LOCAL_RECONNECTION.exchange) return '整束交接'
    if (age < plan.contact + LOCAL_RECONNECTION.exchange + LOCAL_RECONNECTION.settle) return '短环定形'
    if (age < Math.min(...plan.sides.map(side => side.fallStart))) return '两侧柔性鼓胀'
    if (age < Math.max(...plan.sides.map(side => side.fallStart + side.fallDuration))) return '左右错峰回落'
    return '低拱整体收拢与擦除'
  }
  return createMagneticLifecycle(plan.timing.end, 0, false, plan.timing).advanceTo(age).phase
}

export const SHORT_JOIN = { mainLeft: 0.42, mainRight: 0.58, left: 0.62, right: 0.38 } as const
export const shortRetirementStart = (plan: FamilyEvolution, branch: 1 | 2 = 1) => plan.sides[branch - 1].eraseStart
/** 逐条排队仅用于发光擦除，各侧队列跟随各自的回落时序。 */
export const shortStrandErase = (plan: FamilyEvolution, age: number, rank: number, branch: 1 | 2) => {
  const retire = (age - shortRetirementStart(plan, branch) - rank * (plan.strands - 1) * LOCAL_RECONNECTION.strandInterval) / LOCAL_RECONNECTION.collapse
  return clamp01((retire - 0.35) / 0.65)
}
/** 中央只保留交错的一半层次；两侧仍保留完整丝线预算。 */
export const centralStrandCount = (plan: FamilyEvolution) => Math.ceil(plan.strands / 2)
const centralLayer = (plan: FamilyEvolution, rank: number) => Math.round(clamp01(rank) * (plan.strands - 1))
export const centralStrandRetained = (plan: FamilyEvolution, rank: number) => centralLayer(plan, rank) % 2 === 0
/** 保留的中央丝线按外到内排队；回落与沿线擦除读取同一个错峰起点。 */
export const centralStrandStart = (plan: FamilyEvolution, rank: number) => plan.contact + LOCAL_RECONNECTION.exchange + LOCAL_RECONNECTION.centralHold + Math.floor(centralLayer(plan, rank) / 2) * LOCAL_RECONNECTION.centralInterval
export const centralStrandErase = (plan: FamilyEvolution, age: number, rank: number) => clamp01((age - centralStrandStart(plan, rank) - LOCAL_RECONNECTION.centralLower) / LOCAL_RECONNECTION.centralErase)
export function reorganizationProgress(plan: FamilyEvolution, age: number) {
  const exchanged = plan.contact + LOCAL_RECONNECTION.exchange
  return {
    grow: clamp01((age - plan.approach) / LOCAL_RECONNECTION.approach),
    exchange: clamp01((age - plan.contact) / LOCAL_RECONNECTION.exchange),
    settle: clamp01((age - exchanged) / LOCAL_RECONNECTION.settle),
    collapse: (shortLoopCollapse(plan.sides[0], age) + shortLoopCollapse(plan.sides[1], age)) / 2,
  }
}

/** 中央过渡环的端点顺序为 D→C；这里只表示绘制参数，不定义磁场极性。 */
export const CENTRAL_JOIN = { left: 0.32, right: 0.68, mainLeft: 0.38, mainRight: 0.62 } as const
export function reorganizationSource(s: number, branch: number) {
  if (branch === 1) return Math.min(SHORT_JOIN.mainLeft, s * SHORT_JOIN.mainLeft / SHORT_JOIN.left)
  if (branch === 2) return Math.max(SHORT_JOIN.mainRight, SHORT_JOIN.mainRight + (s - SHORT_JOIN.right) * SHORT_JOIN.mainLeft / SHORT_JOIN.left)
  if (branch === 3) return Math.max(CENTRAL_JOIN.mainLeft, Math.min(CENTRAL_JOIN.mainRight, CENTRAL_JOIN.mainLeft + (s - CENTRAL_JOIN.left) * (CENTRAL_JOIN.mainRight - CENTRAL_JOIN.mainLeft) / (CENTRAL_JOIN.right - CENTRAL_JOIN.left)))
  return s
}
/** 重合中央与两侧外肩分配同一份亮度。分开后逐渐恢复各支独立发光。 */
function connectionShare(s: number, branch: number) {
  const q = reorganizationSource(s, branch)
  const left = 1 - redrawEase((q - CENTRAL_JOIN.mainLeft) / (SHORT_JOIN.mainLeft - CENTRAL_JOIN.mainLeft))
  const right = redrawEase((q - SHORT_JOIN.mainRight) / (CENTRAL_JOIN.mainRight - SHORT_JOIN.mainRight))
  if (branch === 1) return s <= SHORT_JOIN.left ? left : redrawEase((s - SHORT_JOIN.left) / 0.10)
  if (branch === 2) return s >= SHORT_JOIN.right ? right : redrawEase((SHORT_JOIN.right - s) / 0.10)
  return s >= CENTRAL_JOIN.left && s <= CENTRAL_JOIN.right ? 1 - left - right : redrawEase((s < CENTRAL_JOIN.left ? CENTRAL_JOIN.left - s : s - CENTRAL_JOIN.right) / 0.10)
}

/** 层次决定启动时刻，沿主环弧长的前沿负责局部交接；新旧重合区互补。 */
export function reorganizationRedraw(plan: FamilyEvolution, age: number, rank: number, branch: number, arc = 0.5, mainArc = arc, direction = 1, s = arc) {
  if (branch === 3 && !centralStrandRetained(plan, rank)) return 0
  const start = plan.contact + rank * 0.22, duration = LOCAL_RECONNECTION.exchange - 0.22
  const old = 1 - traceFront((age - start) / duration, mainArc, direction)
  const incoming = traceFront((age - start + 0.06) / duration, mainArc, direction)
  const pre = REDRAW.preEmission * traceFront((age - plan.approach) / LOCAL_RECONNECTION.approach, mainArc, direction)
  const ink = incoming + pre * (1 - incoming), denominator = Math.max(1, old + ink)
  if (branch === 0) return old / denominator
  const exchanged = plan.contact + LOCAL_RECONNECTION.exchange
  const separated = redrawEase((age - exchanged) / LOCAL_RECONNECTION.settle)
  const share = connectionShare(s, branch)
  const ownTrace = traceFront((age - plan.approach) / LOCAL_RECONNECTION.approach, arc, direction)
  const visible = ink / denominator * (share + (1 - share) * separated) * ownTrace
  if (branch === 3) {
    return visible * (1 - traceFront(centralStrandErase(plan, age, rank), arc, direction))
  }
  return visible * (1 - traceFront(shortStrandErase(plan, age, rank, branch as 1 | 2), arc, direction))
}

type Sampler = (s: number, strand: number, out: Vector3) => Vector3
/** 四条并行路径：0=旧 A—B，1=左 A—D，2=右 C—B，3=中央 D—C。
 * Hermite 候选曲线经过共享磁通走廊约束，避免独立插值的内腿互相穿过。
 * 不瞬时交换路径或平移端点；整束交接完成后旧长连接完全不可见。
 */
export function createLocalReconnection(plan: FamilyEvolution, strands: number[], sampleMain: Sampler, rankOf = (strand: number) => strands.indexOf(strand) / Math.max(1, strands.length - 1)) {
  const selected = new Set(strands), regions = new Map<number, Vector3[]>()
  const anchors = new Map<number, Vector3[]>()
  const heights = new Map<number, number>()
  const centralRecoil = createCentralRecoil(plan)
  const profile = { x: 0, y: 0, z: 0 }, sideAxis = new Vector3(), target = new Vector3()
  const left = new Vector3(), right = new Vector3(), chord = new Vector3(), tangent = new Vector3(), smooth = new Vector3()
  const origin = new Vector3(), end = new Vector3(), axis = new Vector3(), guide = new Vector3()
  for (const strand of strands) {
    origin.add(sampleMain(0, strand, left)); end.add(sampleMain(1, strand, right))
  }
  origin.divideScalar(strands.length); end.divideScalar(strands.length)
  axis.subVectors(end, origin); axis.y = 0
  const span = Math.max(1e-6, axis.length())
  axis.divideScalar(span)
  const d0 = 0.22 + 0.12 * plan.background, c0 = 0.64 + 0.12 * plan.background
  const gap = LOCAL_RECONNECTION.corridorGap
  const coordinate = (p: Vector3) => ((p.x - origin.x) * axis.x + (p.z - origin.z) * axis.z) / span
  for (const strand of strands) {
    sampleMain(0, strand, left); sampleMain(1, strand, right)
    const c = left.clone().lerp(right, 0.64 + 0.12 * plan.background)
    const d = left.clone().lerp(right, 0.22 + 0.12 * plan.background)
    c.z += 0.08; d.z -= 0.06
    // 固定的是磁通区域：邻接两支落在区域两侧的不同位置，不共用一个端点。
    c.addScaledVector(axis, (c0 - coordinate(c)) * span)
    d.addScaledVector(axis, (d0 - coordinate(d)) * span)
    regions.set(strand, [left.clone(), right.clone(), c, d])
    anchors.set(strand, [d.clone().addScaledVector(axis, -gap * span), d.clone().addScaledVector(axis, gap * span), c.clone().addScaledVector(axis, -gap * span), c.clone().addScaledVector(axis, gap * span)])
    heights.set(strand, left.distanceTo(right) * (0.12 + 0.06 * plan.background))
  }
  // 用实际足点间距与低拱高度决定张力求解尺度；每侧整束共用一份响应。
  const aspects = [1, 2].map(branch => strands.reduce((sum, strand) => {
    const feet = regions.get(strand)!, attached = anchors.get(strand)!
    const a = branch === 1 ? feet[0] : attached[3], b = branch === 1 ? attached[0] : feet[1]
    return sum + heights.get(strand)! * (branch === 1 ? 0.68 : 0.90) / a.distanceTo(b)
  }, 0) / strands.length)
  const motions = plan.sides.map((side, i) => createShortLoopMotion(side, aspects[i]))
  const restShapes = plan.sides.map(side => shortLoopRestShape(side, 0))
  let guideAge = NaN, topLeft = 0.4, topRight = 0.6, heightLeft = 1, heightRight = 1
  function updateGuides(age: number) {
    if (age === guideAge) return
    guideAge = age; topLeft = 0; topRight = 0; heightLeft = 0; heightRight = 0
    // 所有丝线、所有分支共用同一分隔面；不能随各支回缩进度独立移动。
    for (const strand of strands) {
      sampleMain(0.4, strand, guide); topLeft += coordinate(guide); heightLeft = Math.max(heightLeft, guide.y - origin.y)
      sampleMain(0.6, strand, guide); topRight += coordinate(guide); heightRight = Math.max(heightRight, guide.y - origin.y)
    }
    topLeft = Math.max(d0, Math.min(0.46, topLeft / strands.length))
    topRight = Math.min(c0, Math.max(0.54, topRight / strands.length))
    heightLeft = Math.max(0.01 * span, heightLeft); heightRight = Math.max(0.01 * span, heightRight)
  }
  // 平滑的 min/max，始终留在约束内；端点处平滑宽度为零，保持固定。
  const softMax = (value: number, bound: number, width: number) => {
    if (width < 1e-12) return Math.max(value, bound)
    const d = value - bound
    return d <= -width ? bound : d >= width ? value : bound + (d + width) ** 2 / (4 * width)
  }
  const softMin = (value: number, bound: number, width: number) => -softMax(-value, -bound, width)
  function confine(s: number, branch: number, out: Vector3) {
    const h = out.y - origin.y
    const dl = d0 + (topLeft - d0) * redrawEase(h / heightLeft)
    const cr = c0 + (topRight - c0) * redrawEase(h / heightRight)
    const u = coordinate(out), width = 0.006 * Math.sin(Math.PI * s)
    let bounded = u
    if (branch === 1) bounded = softMin(u, dl - gap, width)
    else if (branch === 2) bounded = softMax(u, cr + gap, width)
    else {
      bounded = softMax(u, dl + gap, width)
      bounded = softMin(bounded, cr - gap, width)
    }
    out.addScaledVector(axis, (bounded - u) * span)
    return out
  }
  function sampleRaw(s: number, strand: number, branch: number, age: number, out: Vector3, reference = false) {
    if (branch === 0) return sampleMain(s, strand, out)
    // 预生长之前三条短环完全不可见，不为整个自然生命周期计算空间约束。
    const confined = age >= plan.approach
    if (confined) updateGuides(age)
    const feet = regions.get(strand)!, attached = anchors.get(strand)!
    const a = branch === 1 ? feet[0] : branch === 3 ? attached[1] : attached[3]
    const b = branch === 1 ? attached[0] : branch === 3 ? attached[2] : feet[1]
    const join = branch === 1 ? SHORT_JOIN.left : SHORT_JOIN.right
    const q = branch === 1 ? SHORT_JOIN.mainLeft : SHORT_JOIN.mainRight
    const derivativeScale = SHORT_JOIN.mainLeft / SHORT_JOIN.left
    if (branch === 3) {
      const j = s < CENTRAL_JOIN.left ? CENTRAL_JOIN.left : CENTRAL_JOIN.right
      const q = s < CENTRAL_JOIN.left ? CENTRAL_JOIN.mainLeft : CENTRAL_JOIN.mainRight
      const scale = (CENTRAL_JOIN.mainRight - CENTRAL_JOIN.mainLeft) / (CENTRAL_JOIN.right - CENTRAL_JOIN.left)
      if (s >= CENTRAL_JOIN.left && s <= CENTRAL_JOIN.right) sampleMain(reorganizationSource(s, 3), strand, out)
      else {
        sampleMain(q, strand, left)
        sampleMain(q - 0.001, strand, right); sampleMain(q + 0.001, strand, tangent)
        tangent.sub(right).multiplyScalar(scale / 0.002)
        const span = CENTRAL_JOIN.left, u = s < j ? s / span : (s - j) / span
        const u2 = u * u, u3 = u2 * u
        if (s < j) {
          out.copy(a).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(left, -2 * u3 + 3 * u2).addScaledVector(tangent, (u3 - u2) * span)
          out.y += heights.get(strand)! * 2 * (u3 - 2 * u2 + u) * span
        } else {
          out.copy(left).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(b, -2 * u3 + 3 * u2).addScaledVector(tangent, (u3 - 2 * u2 + u) * span)
          out.y -= heights.get(strand)! * 2 * (u3 - u2) * span
        }
      }
    } else if (branch === 1 ? s <= join : s >= join) {
      sampleMain(branch === 1 ? s * derivativeScale : q + (s - join) * derivativeScale, strand, out)
    } else {
      sampleMain(q, strand, left)
      sampleMain(q - 0.001, strand, right); sampleMain(q + 0.001, strand, tangent)
      tangent.sub(right).multiplyScalar(derivativeScale / 0.002)
      const span = SHORT_JOIN.right, u = branch === 1 ? (s - join) / span : s / span
      const u2 = u * u, u3 = u2 * u
      // 固定磁通区域处用竖直切向；连接区处继承主环切向。
      if (branch === 1) {
        out.copy(left).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(b, -2 * u3 + 3 * u2)
          .addScaledVector(tangent, (u3 - 2 * u2 + u) * span)
        out.y -= heights.get(strand)! * 2 * (u3 - u2) * span
      } else {
        out.copy(a).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(left, -2 * u3 + 3 * u2)
          .addScaledVector(tangent, (u3 - u2) * span)
        out.y += heights.get(strand)! * 2 * (u3 - 2 * u2 + u) * span
      }
    }
    const grow = redrawEase((age - plan.approach) / LOCAL_RECONNECTION.approach)
    chord.copy(a).lerp(b, s)
    out.sub(chord).multiplyScalar(0.025 + 0.975 * grow).add(chord)
    const exchanged = plan.contact + LOCAL_RECONNECTION.exchange
    // 平滑低拱是移动的平衡轮廓；在其上叠加衰减响应，保留整束层次。
    const rank = rankOf(strand)
    const height = heights.get(strand)! * (branch === 1 ? 0.68 : branch === 3 ? 0.55 : 0.90) * (1 - 0.22 * rank)
    if (branch !== 3) {
      const motion = motions[branch - 1]
      const shape = reference ? restShapes[branch - 1] : motion.sample(age)
      shortLoopProfile(s, rank, motion.plan, shape, profile, false)
      sideAxis.subVectors(b, a); sideAxis.y = 0; sideAxis.normalize()
      target.copy(a).lerp(b, profile.x)
      target.y += height * profile.y
      target.x -= sideAxis.z * height * profile.z
      target.z += sideAxis.x * height * profile.z
      out.lerp(target, redrawEase((age - exchanged) / LOCAL_RECONNECTION.settle))
      // 横向激发直接作用于正在交接的轮廓，不被交接后的低拱定形混合再次削弱。
      shortLoopDeflection(s, shape, profile)
      target.subVectors(b, a); target.y = 0
      out.addScaledVector(target, profile.x)
      out.y = chord.y + (out.y - chord.y) * profile.y
      out.x -= sideAxis.z * height * profile.z
      out.z += sideAxis.x * height * profile.z
      return confined ? confine(s, branch, out) : out
    }
    smooth.copy(chord); smooth.y += Math.sin(Math.PI * s) * height
    const settle = (age - centralStrandStart(plan, rank)) / LOCAL_RECONNECTION.centralLower
    out.lerp(smooth, redrawEase(settle))
    if (age > exchanged) {
      // 同束共用模态，不对每根丝线加入独立随机抖动；足点的位移和切向扰动为零。
      const recoil = centralRecoil.sample(age)
      const envelope = Math.sin(Math.PI * s) ** 2 * height * redrawEase(settle)
      out.y += envelope * (recoil.height + recoil.skew * Math.cos(Math.PI * s))
      out.addScaledVector(axis, envelope * 0.65 * recoil.skew)
      out.x -= axis.z * envelope * 0.25 * recoil.skew
      out.z += axis.x * envelope * 0.25 * recoil.skew
    }
    const collapse = redrawEase(centralStrandErase(plan, age, rank) ** 2)
    out.sub(chord).multiplyScalar(1 - 0.97 * collapse).add(chord)
    return confined ? confine(s, branch, out) : out
  }
  // 最终三维曲线（包括交接与走廊）再做弧长保护。按事件年龄缓存整束投影系数，
  // 所有丝线使用相同系数，防止逐条收缩；不修改中央短环或旧主环。
  const segments = 112, rowSize = (segments + 1) * 3
  const buffers = [1, 2].map(branch => ({ age: NaN,
    ...createArcBundle(strands.length, (s, point) => confine(s, branch, point), segments) }))
  const measured = new Vector3(), referencePoint = new Vector3()
  function updateArc(branch: number, age: number) {
    const buffer = buffers[branch - 1]
    if (buffer.age === age) return buffer
    buffer.age = age
    Object.assign(restShapes[branch - 1], shortLoopRestShape(plan.sides[branch - 1], age))
    for (let i = 0; i < strands.length; i++) for (let j = 0; j <= segments; j++) {
      const offset = i * rowSize + j * 3, s = j / segments
      sampleRaw(s, strands[i], branch, age, measured).toArray(buffer.candidate, offset)
      sampleRaw(s, strands[i], branch, age, measured, true).toArray(buffer.reference, offset)
    }
    buffer.project()
    return buffer
  }
  function sample(s: number, strand: number, branch: number, age: number, out: Vector3) {
    if (branch === 0 || branch === 3 || age < plan.contact) return sampleRaw(s, strand, branch, age, out)
    const buffer = updateArc(branch, age)
    const cell = s * segments, nearest = Math.round(cell)
    if (Math.abs(cell - nearest) < 1e-8) return out.fromArray(buffer.output, strands.indexOf(strand) * rowSize + nearest * 3)
    sampleRaw(s, strand, branch, age, out)
    sampleRaw(s, strand, branch, age, referencePoint, true)
    out.lerp(referencePoint, 1 - buffer.state.blend)
    return confine(s, branch, out)
  }
  return { selected, regions, anchors, plan, sample,
    arcDiagnostics: () => buffers.map(b => b.state.diagnostic),
    sampleReference(s: number, strand: number, branch: number, age: number, out: Vector3) {
      updateArc(branch, age)
      return sampleRaw(s, strand, branch, age, out, true)
    } }

}
