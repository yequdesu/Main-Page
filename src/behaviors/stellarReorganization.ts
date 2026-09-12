import { Vector3 } from 'three'
import { MAGNETIC } from './stellarMagnetism'
import { createMagneticLifecycle, MAGNETIC_LIFETIME, type MagneticTiming } from './stellarLifecycle'
import type { ProminenceFamily } from './stellarMorphology'

const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
export const LOCAL_RECONNECTION = { approach: 0.7, rounding: 0.16, settle: 0.65, collapseDelay: 0.8 } as const
/** 分离随机流，调整时序不改变静态构型。所有概率均为展示参数，不是观测统计。 */
const random = (seed: number, salt: number) => {
  let n = ((seed * 0xffffffff) >>> 0) ^ Math.imul(salt, 0x9e3779b9)
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad)
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296
}
export interface FamilyEvolution {
  timing: MagneticTiming
  probability: number
  draw: number
  background: number
  reorganizes: boolean
  approach: number
  contact: number
  finish: number
}

export function createMagneticEvolution(families: readonly ProminenceFamily[], duration = MAGNETIC_LIFETIME): FamilyEvolution[] {
  const dominant = families.reduce((best, f, i) => f.width > families[best].width ? i : best, 0)
  const anchors = new Set(families.map(f => f.sourceKind).map(kind => families.findIndex(f => f.sourceKind === kind)))
  return families.map((family, i) => {
    // 每种组成至少保留一个贯穿事件的支撑环，其他环系依次生长、提前退场。
    const anchor = anchors.has(i), birth = anchor ? 0 : 0.7 + 2.7 * random(family.seed, 1)
    const end = anchor ? duration : duration - 1.2 - 3 * random(family.seed, 2)
    const grown = birth + 4.8 + 1.6 * random(family.seed, 3)
    const decay = end - (12 + 3.6 * random(family.seed, 4))
    const timing = { birth, grown, settled: grown + 1.6, decay, end }
    const background = random(family.seed, 5), draw = random(family.seed, 6)
    const probability = i === dominant ? 0.72 * ease((family.width * 2 - 0.7) / 1.7) * (0.35 + 0.65 * background) : 0
    const contact = decay + (end - decay) * (0.55 + 0.07 * random(family.seed, 7))
    return { timing, background, probability, draw, reorganizes: draw < probability,
      approach: contact - LOCAL_RECONNECTION.approach, contact, finish: end }
  })
}

export function evolutionPhase(plan: FamilyEvolution, age: number) {
  if (plan.reorganizes && age >= plan.approach && age < plan.finish) return age < plan.contact ? '局部接近' : '短环回缩'
  return createMagneticLifecycle(plan.timing.end, 0, false, plan.timing).advanceTo(age).phase
}

type Sampler = (s: number, strand: number, out: Vector3) => Vector3
/** 两个反向有根连接 A+→B−、C+→D− 接触后换接为 A+→D−、C+→B−。
 * 四个磁通区域一次初始化；冻结接触形状再松弛，不把磁通端点平移到新位置。
 * 主环完整换接为两束开放短支，不保留同一主环的旧长连接。
 */
export function createLocalReconnection(plan: FamilyEvolution, strands: number[], sampleMain: Sampler) {
  const selected = new Set(strands)
  const snapshots = new Map<number, Float64Array>()
  const regions = new Map<number, Vector3[]>()
  const parentMids = new Map<number, Vector3>(), heights = new Map<number, number>()
  const left = new Vector3(), right = new Vector3(), mid = new Vector3(), center = new Vector3(), other = new Vector3()
  const bridgeA = new Vector3(), bridgeB = new Vector3(), tangentA = new Vector3(), tangentB = new Vector3()
  for (const strand of strands) {
    sampleMain(0, strand, left); sampleMain(1, strand, right)
    // 弱混合极性区域预先存在。C、D 有不同纵深，避免规则的一大两小投影。
    const c = left.clone().lerp(right, 0.64 + 0.12 * plan.background)
    const d = left.clone().lerp(right, 0.22 + 0.12 * plan.background)
    c.z += 0.08; d.z -= 0.06
    regions.set(strand, [left.clone(), right.clone(), c, d])
    snapshots.set(strand, new Float64Array(MAGNETIC.samples * 3 * 2))
    parentMids.set(strand, new Vector3())
    heights.set(strand, left.distanceTo(right) * (0.12 + 0.06 * plan.background))
  }
  let switched = false, cachedAge = NaN
  const height = (strand: number) => heights.get(strand)!
  function parents(s: number, strand: number, branch: number, age: number, out: Vector3) {
    if (cachedAge !== age) {
      for (const selectedStrand of strands) sampleMain(0.5, selectedStrand, parentMids.get(selectedStrand)!)
      cachedAge = age
    }
    const feet = regions.get(strand)!
    const roof = height(strand) * (0.65 + 0.35 * ease((age - plan.approach) / LOCAL_RECONNECTION.approach))
    if (branch === 0) sampleMain(s, strand, out)
    else {
      out.copy(feet[2]).lerp(feet[3], s)
      out.y += Math.sin(Math.PI * s) * roof
    }
    mid.copy(parentMids.get(strand)!)
    center.copy(feet[2]).lerp(feet[3], 0.5); center.y += roof
    const amount = ease((age - plan.approach) / (plan.contact - plan.approach))
    if (branch === 0) other.copy(center).sub(mid)
    else other.copy(mid).sub(center)
    // 局部拱顶靠近，同一接触点；sin² 权重使端点严格不动。
    out.addScaledVector(other, 0.5 * amount * Math.sin(Math.PI * s) ** 2)
    return out
  }
  function capture(age: number) {
    if (switched || age < plan.contact) return false
    for (const strand of strands) for (let branch = 0; branch < 2; branch++) for (let j = 0; j < MAGNETIC.samples; j++) {
      parents(j / (MAGNETIC.samples - 1), strand, branch, plan.contact, left)
      left.toArray(snapshots.get(strand)!, (branch * MAGNETIC.samples + j) * 3)
    }
    switched = true
    return true
  }
  function sample(s: number, strand: number, branch: number, age: number, out: Vector3) {
    if (!switched) return parents(s, strand, branch, age, out)
    readSnapshot(s, strand, branch, out)
    // 接触时严格继承原路径；接头邻域从零展开，随后用切向匹配的 Hermite 桥圆滑尖角。
    const half = 0.12 * ease((age - plan.contact) / LOCAL_RECONNECTION.rounding)
    if (half > 1e-8 && Math.abs(s - 0.5) < half) {
      readSnapshot(0.5 - half, strand, branch, bridgeA, tangentA)
      readSnapshot(0.5 + half, strand, branch, bridgeB, tangentB)
      const u = (s - 0.5 + half) / (2 * half), u2 = u * u, u3 = u2 * u
      out.copy(bridgeA).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(bridgeB, -2 * u3 + 3 * u2)
        .addScaledVector(tangentA, (u3 - 2 * u2 + u) * 2 * half).addScaledVector(tangentB, (u3 - u2) * 2 * half)
    }
    const feet = regions.get(strand)!, a = feet[branch === 0 ? 0 : 2], b = feet[branch === 0 ? 3 : 1]
    center.copy(a).lerp(b, s)
    center.y += Math.sin(Math.PI * s) * height(strand) * (branch === 0 ? 0.68 : 0.90)
    const relax = ease((age - plan.contact) / LOCAL_RECONNECTION.settle)
    out.lerp(center, relax)
    const collapse = ease((age - plan.contact - LOCAL_RECONNECTION.collapseDelay) / (plan.finish - plan.contact - LOCAL_RECONNECTION.collapseDelay))
    center.copy(a).lerp(b, s)
    out.sub(center).multiplyScalar(1 - 0.96 * collapse).add(center)
    return out
  }
  function readSnapshot(s: number, strand: number, branch: number, out: Vector3, derivative?: Vector3) {
    const data = snapshots.get(strand)!, sourceBranch = s <= 0.5 ? branch : 1 - branch
    const cell = s * (MAGNETIC.samples - 1), lo = Math.min(MAGNETIC.samples - 2, Math.floor(cell))
    const offset = (sourceBranch * MAGNETIC.samples + lo) * 3
    out.fromArray(data, offset); other.fromArray(data, offset + 3)
    if (derivative) derivative.copy(other).sub(out).multiplyScalar(MAGNETIC.samples - 1)
    out.lerp(other, cell - lo)
    return out
  }
  function visibility(age: number, branch: number) {
    const fade = 1 - ease((age - plan.finish + 0.65) / 0.65)
    return fade * (switched || branch === 0 ? 1 : 0.08 + 0.92 * ease((age - plan.approach) / LOCAL_RECONNECTION.approach))
  }
  return { selected, regions, plan, capture, sample, visibility, get switched() { return switched } }
}
