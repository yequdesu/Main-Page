import { Vector3 } from 'three'
import { createCmeDissolution } from './stellarEjection'
import { createMagneticLifecycle, MAGNETIC_LIFETIME, CME_ARCADE_RETREAT_DURATION } from './stellarLifecycle'
import { createProminenceStructure, type ProminenceFamily, type ProminenceMorphology } from './stellarMorphology'
import { createLocalReconnection, createMagneticEvolution, reorganizationRedraw, reorganizationSource } from './stellarReorganization'
import { createFilamentRenewal } from './stellarRedraw'
import { MAGNETIC, createMagneticDeformation, magneticEase, magneticFluxRadius, magneticStage, sampleMagneticStrand, type MagneticBranch } from './stellarMagnetism'

/** Kliem & Török (2006), Eq. 4, c=c0：自相似细电流环的无量纲径向加速度。 */
export const TORUS_INDUCTANCE = Math.log(80) - 1.75 // R0/b0=10, li=1/2
export const TORUS_CRITICAL_INDEX = 1.5 - 1 / (4 * TORUS_INDUCTANCE)
export function torusAcceleration(radius: number, decayIndex: number) {
  const q = 2 - decayIndex
  const logRadius = Math.log(Math.max(0.2, radius))
  // n→2 的可去奇点使用 log(R/R0) 极限。
  const fluxIntegral = Math.abs(q) < 1e-6 ? logRadius : Math.expm1(q * logRadius) / q
  const current = 1 + (TORUS_INDUCTANCE + 0.5) / (2 * TORUS_INDUCTANCE) * fluxIntegral
  return current * (current - Math.exp(q * logRadius)) / (radius * radius)
}
export interface TorusState { radius: number; velocity: number }
export function stepTorus(state: TorusState, delta: number, decayIndex: number) {
  const r = state.radius, v = state.velocity
  const a1 = torusAcceleration(r, decayIndex)
  const v2 = v + a1 * delta / 2, a2 = torusAcceleration(r + v * delta / 2, decayIndex)
  const v3 = v + a2 * delta / 2, a3 = torusAcceleration(r + v2 * delta / 2, decayIndex)
  const v4 = v + a3 * delta, a4 = torusAcceleration(r + v3 * delta, decayIndex)
  state.radius += delta * (v + 2 * v2 + 2 * v3 + v4) / 6
  state.velocity += delta * (a1 + 2 * a2 + 2 * a3 + a4) / 6
}

export const PLASMA = { strands: MAGNETIC.strands, parcelsPerStrand: 8, step: 1 / 120 } as const
export type PlasmaBranch = MagneticBranch | 3
export const PLASMA_COUNT = PLASMA.strands * PLASMA.parcelsPerStrand
const fract = (v: number) => v - Math.floor(v)

/** 沿动态磁结构输运；原连接、上升闭合支和日面拱廊各自拥有密度与边界条件。 */
export function createFluxRopeSimulation(seed: number, eruptive: boolean, morphology?: ProminenceMorphology | null, duration = MAGNETIC_LIFETIME) {
  const torus: TorusState = { radius: 1, velocity: 0.005 }
  const lifecycle = createMagneticLifecycle(duration, seed, eruptive)
  const shape = createMagneticDeformation(seed, lifecycle)
  const structure = eruptive
    ? { kind: 'eruption' as const, companion: null, families: [{ seed, sourceKind: 'eruption' as const, width: shape.span, height: shape.height, offsetX: 0, offsetZ: 0, yaw: 0, strands: MAGNETIC.strands }] }
    : createProminenceStructure(seed, morphology)
  const evolution = eruptive ? [] : createMagneticEvolution(structure.families as ProminenceFamily[], duration)
  let parcelOffset = 0
  const groups = structure.families.map((family, index) => {
    const life = eruptive ? lifecycle : createMagneticLifecycle(duration, family.seed, false, evolution[index].timing)
    const deformation = eruptive ? shape : createMagneticDeformation(family.seed, life)
    const first = parcelOffset
    parcelOffset += family.strands * PLASMA.parcelsPerStrand
    return { family, life, deformation, renewal: eruptive ? null : createFilamentRenewal(evolution[index].timing, family.strands, family.seed, evolution[index].reorganizes ? evolution[index].approach : undefined), first, end: parcelOffset, scaleX: family.width / deformation.span, scaleY: family.height / deformation.height }
  })
  const decayIndex = eruptive ? 2.2 + seed * 0.45 : 1.1
  const position = new Float64Array(PLASMA_COUNT), velocity = new Float64Array(PLASMA_COUNT)
  const branches = new Uint8Array(PLASMA_COUNT)
  const temperature = new Float64Array(PLASMA_COUNT), density = new Float32Array(PLASMA_COUNT)
  const centers = new Float32Array(PLASMA_COUNT * 3), tangents = new Float32Array(PLASMA_COUNT * 3)
  // RGBA = 三维位置 + 局部弧丝宽度；CPU 和 GPU 读取同一份路径表。
  const branchCount = eruptive ? 3 : 4
  const curveData = new Float32Array(MAGNETIC.samples * MAGNETIC.strands * branchCount * 4)
  const arcLengths = new Float64Array(MAGNETIC.samples * MAGNETIC.strands * branchCount)
  const curveOpacity = new Float32Array(MAGNETIC.strands * branchCount).fill(eruptive ? 1 : 0)
  // RGBA = 局部可见度 / 内外排序 / 绘制方向 / 归一化弧长；CPU 与 GPU 共用。
  const redrawData = new Float32Array(curveData.length)
  const parcelVisibility = new Float32Array(PLASMA_COUNT).fill(1)
  const strandRanks = new Float64Array(PLASMA.strands)
  const strandDirections = new Int8Array(PLASMA.strands)
  const strandGenerations = new Int32Array(PLASMA.strands).fill(-1)
  const bins = 32, occupancy = new Float64Array(PLASMA.strands * bins * branchCount)
  const families = new Uint8Array(PLASMA.strands)
  const thicknessScale = new Float64Array(PLASMA.strands)
  const tracerWeight = new Float64Array(PLASMA_COUNT).fill(1)
  const p = new Vector3(), before = new Vector3(), after = new Vector3()
  let time = 0
  groups.forEach((group, index) => {
    for (let strand = group.first / PLASMA.parcelsPerStrand; strand < group.end / PLASMA.parcelsPerStrand; strand++) {
      families[strand] = index
      thicknessScale[strand] = Math.sqrt(group.scaleX * group.scaleY)
      strandDirections[strand] = eruptive ? (strand % 2 ? -1 : 1) : group.renewal!.directions[strand - group.first / PLASMA.parcelsPerStrand]
    }
  })
  for (let i = 0; i < PLASMA_COUNT; i++) {
    const strand = Math.floor(i / PLASMA.parcelsPerStrand)
    position[i] = 0.05 + 0.9 * fract((i % PLASMA.parcelsPerStrand) / PLASMA.parcelsPerStrand + seed + strand * 0.073)
    velocity[i] = strandDirections[strand] * (0.12 + fract(i * 0.7548 + seed) * 0.28)
    temperature[i] = Math.abs(position[i] - 0.5) < 0.18 ? 0.22 : 0.95
  }
  function sampleOriginal(s: number, strand: number, branch: MagneticBranch, target: Vector3) {
    const group = groups[families[strand]], { family, deformation, scaleX, scaleY } = group
    sampleMagneticStrand(s, strand, torus.radius, family.seed, branch, target, deformation)
    // 相对足点弦线改变拱体，足点位置不参与缩放。上方脱离支从不回收。
    const signed = 2 * s - 1, jitter = fract(strand * 0.618 + family.seed)
    const footX = signed * (0.94 + 0.12 * jitter) * deformation.span
    const footZ = signed * (0.16 * (family.seed - 0.5) + 0.018 * (strand - 5.5))
    if (branch === 0) {
      target.x = footX + (target.x - footX) * group.life.height
      target.y *= group.life.height
      target.z = footZ + (target.z - footZ) * group.life.height
    } else if (branch === 2 && ejection) {
      const closedAt = ejection.closureTimes[strand]
      const elapsed = closedAt < 0 ? 0 : time - closedAt
      const relax = magneticEase((elapsed - 0.6) / 2.8)
      const retreat = magneticEase((elapsed - 1.1) / CME_ARCADE_RETREAT_DURATION)
      const smoothRoof = (0.43 + strand * 0.022 + 0.08 * seed) * Math.sin(Math.PI * s) * deformation.height
      target.y = (target.y + (smoothRoof - target.y) * relax * 0.8) * (1 - 0.9 * retreat)
      target.x = footX + (target.x - footX) * (1 - 0.9 * relax)
      target.z = footZ + (target.z - footZ) * (1 - 0.9 * relax)
    }
    target.x *= scaleX; target.y *= scaleY; target.z *= Math.sqrt(scaleX * scaleY)
    const x = target.x, z = target.z, angle = family.yaw
    target.x = x * Math.cos(angle) - z * Math.sin(angle) + family.offsetX
    target.z = x * Math.sin(angle) + z * Math.cos(angle) + family.offsetZ
    return target
  }
  const feet = Array.from({ length: PLASMA.strands }, (_, strand) => [sampleOriginal(0, strand, 0, new Vector3()).clone(), sampleOriginal(1, strand, 0, new Vector3()).clone()])
  function sampleRenewed(s: number, strand: number, target: Vector3) {
    const group = groups[families[strand]], first = group.first / PLASMA.parcelsPerStrand
    const renewal = group.renewal!, slot = strand - first, generation = Math.max(0, renewal.generations[slot])
    // 每代沿正在演化的共同轮廓生成；尺度和相位随代数持续前进，不按槽位取模。
    sampleOriginal(s, first, 0, target)
    const outer = 0.50 + 0.50 * renewal.layers[slot]
    const reference = feet[first], anchors = feet[strand]
    target.x = (target.x - reference[0].x * (1 - s) - reference[1].x * s) * outer + anchors[0].x * (1 - s) + anchors[1].x * s
    target.y *= outer
    target.z = (target.z - reference[0].z * (1 - s) - reference[1].z * s) * outer + anchors[0].z * (1 - s) + anchors[1].z * s
    const envelope = Math.sin(Math.PI * s) ** 2 * group.life.height * group.family.height
    const phase = group.family.seed * Math.PI * 2 + generation * 0.43
    const across = 0.018 * envelope * Math.sin(2 * Math.PI * s + phase)
    target.x += across * Math.cos(group.family.yaw)
    target.z += across * Math.sin(group.family.yaw) + 0.014 * envelope * Math.sin(3 * Math.PI * s + phase * 0.7)
    target.y += 0.007 * envelope * Math.sin(2 * Math.PI * s + phase)
    return target
  }
  const candidate = evolution.findIndex(plan => plan.reorganizes)
  const reorganization = candidate < 0 ? null : createLocalReconnection(evolution[candidate],
    // 同一主环的全部细丝参与整束交接；其他独立环系不受影响。
    Array.from({ length: groups[candidate].family.strands }, (_, i) => groups[candidate].first / PLASMA.parcelsPerStrand + i),
    (s, strand, out) => sampleRenewed(s, strand, out), strand => strandRanks[strand])
  if (reorganization) for (let i = 0; i < PLASMA_COUNT; i++) {
    const strand = Math.floor(i / PLASMA.parcelsPerStrand)
    if (!reorganization.selected.has(strand)) continue
    const local = i % PLASMA.parcelsPerStrand
    branches[i] = Math.floor(local / 2)
    const count = 2, first = branches[i] * 2
    position[i] = 0.05 + 0.9 * fract((local - first) / count + seed + strand * 0.073 + branches[i] * 0.13)
    temperature[i] = Math.abs(position[i] - 0.5) < 0.18 ? 0.22 : 0.95
    // 四条路径分别拥有代表性采样，权重补偿采样数；不把可见点瞬移到新路径。
    tracerWeight[i] = PLASMA.parcelsPerStrand / count
  }
  function sample(s: number, strand: number, branch: PlasmaBranch, target: Vector3) {
    return !eruptive && reorganization?.selected.has(strand)
      ? reorganization.sample(s, strand, branch, lifecycle.age, target)
      : eruptive ? sampleOriginal(s, strand, branch as MagneticBranch, target) : sampleRenewed(s, strand, target)
  }
  function gridIndex(strand: number, branch: number, bin: number) {
    const cell = eruptive && branch === 1 ? (bin + bins) % bins : Math.max(0, Math.min(bins - 1, bin))
    return (strand * branchCount + branch) * bins + cell
  }
  function fillDensity() {
    occupancy.fill(0)
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), branch = branches[i]
      const cell = position[i] * (eruptive && branch === 1 ? bins : bins - 1), lo = Math.floor(cell), f = cell - lo
      occupancy[gridIndex(strand, branch, lo)] += (1 - f) * tracerWeight[i]
      occupancy[gridIndex(strand, branch, lo + 1)] += f * tracerWeight[i]
    }
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), branch = branches[i]
      const bin = Math.round(position[i] * (eruptive && branch === 1 ? bins : bins - 1))
      const local = occupancy[gridIndex(strand, branch, bin - 1)] + 2 * occupancy[gridIndex(strand, branch, bin)] + occupancy[gridIndex(strand, branch, bin + 1)]
      density[i] = Math.max(0.05, local / (eruptive && branch === 2 ? 1 : torus.radius ** 3))
    }
  }
  function switchConnections() {
    if (!eruptive) return
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand)
      if (branches[i] || magneticStage(torus.radius, strand, seed) < MAGNETIC.contact) continue
      const s = position[i], cut = MAGNETIC.cut
      if (s >= cut && s <= 1 - cut) {
        branches[i] = 1; position[i] = (s - cut) / (1 - 2 * cut)
      } else {
        branches[i] = 2; position[i] = s < cut ? s / (2 * cut) : 1 - (1 - s) / (2 * cut)
      }
    }
  }
  function tangent(s: number, strand: number, branch: PlasmaBranch) {
    const closed = eruptive && branch === 1
    const low = closed ? fract(s - 0.001) : Math.max(0, s - 0.001)
    const high = closed ? fract(s + 0.001) : Math.min(1, s + 0.001)
    sample(low, strand, branch, before); sample(high, strand, branch, after)
    return after.sub(before).multiplyScalar(1 / (closed ? 0.002 : high - low))
  }
  const ejection = eruptive ? createCmeDissolution(seed) : null
  const sampleUpper = (s: number, strand: number, out: Vector3) => sample(s, strand, 1, out)
  function integrate() {
    const dt = PLASMA.step
    lifecycle.advanceTo(time + dt)
    if (!eruptive) for (const group of groups) {
      group.life.advanceTo(time + dt)
      group.renewal!.update(time + dt)
      for (let strand = group.first / PLASMA.parcelsPerStrand; strand < group.end / PLASMA.parcelsPerStrand; strand++) {
        const slot = strand - group.first / PLASMA.parcelsPerStrand, generation = group.renewal!.generations[slot]
        strandRanks[strand] = group.renewal!.ranks[slot]
        if (generation === strandGenerations[strand]) continue
        strandGenerations[strand] = generation
        // 槽位在零可见度时换代，示踪团块随新曲线重新取样，不沿旧路径闪跳。
        for (let local = 0; local < PLASMA.parcelsPerStrand; local++) {
          const i = strand * PLASMA.parcelsPerStrand + local
          const split = reorganization?.selected.has(strand)
          const count = split ? 2 : PLASMA.parcelsPerStrand
          const first = split ? branches[i] * 2 : 0
          position[i] = 0.05 + 0.9 * fract((local - first) / count + seed + strand * 0.073 + branches[i] * 0.13 + generation * 0.137)
          velocity[i] = strandDirections[strand] * (0.12 + fract(i * 0.7548 + seed + generation * 0.11) * 0.28)
          temperature[i] = Math.abs(position[i] - 0.5) < 0.18 ? 0.22 : 0.95
        }
      }
    }
    stepTorus(torus, dt * (eruptive ? 0.92 : 0.55), decayIndex)
    for (const group of groups) group.deformation.step(dt, torus.radius, position, temperature, branches, group.first, group.end)
    ejection?.step(dt, time + dt, torus.radius, sampleUpper)
    switchConnections()
    fillDensity()
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), s = position[i], branch = branches[i] as PlasmaBranch
      tangent(s, strand, branch)
      const metric = Math.max(0.05, after.length()), slope = after.y / metric
      velocity[i] += (-0.42 * slope - 0.10 * velocity[i]) * dt
      position[i] += velocity[i] / metric * dt
      if (eruptive && branch === 1) position[i] = fract(position[i])
      else if (position[i] <= 0.025 || position[i] >= 0.975) {
        const left = position[i] <= 0.025
        position[i] = left ? 0.027 : 0.973
        velocity[i] = (left ? 1 : -1) * (0.95 + fract(i * 0.618 + seed) * 0.2)
        temperature[i] = 1
      }
      const footHeating = eruptive && branch === 1 ? 0 : 0.5 * Math.exp(-Math.min(position[i], 1 - position[i]) * 18)
      const cooling = 0.065 * density[i] / Math.sqrt(Math.max(0.08, temperature[i]))
      const heat = 0.065 + footHeating + 0.12 * (1 - temperature[i])
      temperature[i] = Math.max(0.08, Math.min(1.25, temperature[i] + (heat - cooling) * dt))
    }
    time += dt
  }
  function arcAt(s: number, strand: number, branch = 0) {
    const cell = s * (MAGNETIC.samples - 1), lo = Math.min(MAGNETIC.samples - 2, Math.floor(cell))
    const offset = (branch * PLASMA.strands + strand) * MAGNETIC.samples + lo
    return arcLengths[offset] + (arcLengths[offset + 1] - arcLengths[offset]) * (cell - lo)
  }
  function writePositions() {
    // 先计算全部路径与弧长，再计算交接权重；短环可准确复用主环的局部弧长。
    for (let strand = 0; strand < PLASMA.strands; strand++) {
      const split = eruptive && magneticStage(torus.radius, strand, seed) >= MAGNETIC.contact
      for (let branch = 0; branch < branchCount; branch++) {
        if (eruptive ? (split ? branch === 0 : branch !== 0) : (branch !== 0 && !reorganization?.selected.has(strand))) continue
        const row = (branch * PLASMA.strands + strand) * MAGNETIC.samples
        let length = 0
        for (let j = 0; j < MAGNETIC.samples; j++) {
          const s = j / (MAGNETIC.samples - 1)
          sample(s, strand, branch as PlasmaBranch, p)
          if (j) length += p.distanceTo(before)
          before.copy(p); arcLengths[row + j] = length
          p.toArray(curveData, (row + j) * 4)
          curveData[(row + j) * 4 + 3] = magneticFluxRadius(eruptive && branch === 1 ? 0.5 - 0.5 * Math.sin(2 * Math.PI * s) : s, p.y / groups[families[strand]].scaleY, groups[families[strand]].family.seed) * 0.18 * thicknessScale[strand]
        }
        for (let j = 0; j < MAGNETIC.samples; j++) arcLengths[row + j] /= Math.max(1e-9, length)
      }
    }
    for (let strand = 0; strand < PLASMA.strands; strand++) {
      const group = groups[families[strand]], slot = strand - group.first / PLASMA.parcelsPerStrand
      const reorganizing = reorganization?.selected.has(strand)
      const split = eruptive && magneticStage(torus.radius, strand, seed) >= MAGNETIC.contact
      for (let branch = 0; branch < branchCount; branch++) {
        const row = (branch * PLASMA.strands + strand) * MAGNETIC.samples
        let maximum = 0
        for (let j = 0; j < MAGNETIC.samples; j++) {
          const s = j / (MAGNETIC.samples - 1), arc = arcLengths[row + j]
          let ink = eruptive ? Number(split ? branch !== 0 : branch === 0) : branch && !reorganizing ? 0 : group.renewal!.pointVisibility(slot, arc)
          if (!eruptive && reorganizing) ink *= reorganizationRedraw(reorganization!.plan, lifecycle.age, strandRanks[strand], branch, arc, arcAt(reorganizationSource(s, branch), strand), strandDirections[strand], s)
          redrawData[(row + j) * 4] = ink
          redrawData[(row + j) * 4 + 1] = strandRanks[strand]
          redrawData[(row + j) * 4 + 2] = strandDirections[strand]
          redrawData[(row + j) * 4 + 3] = arc
          maximum = Math.max(maximum, ink)
        }
        curveOpacity[branch * PLASMA.strands + strand] = maximum
      }
    }
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), s = position[i], branch = branches[i] as PlasmaBranch
      // 与 GPU 一样在相邻路径样本间插值，避免渲染路径与示踪路径分离。
      const cell = s * (MAGNETIC.samples - 1), lo = Math.min(MAGNETIC.samples - 2, Math.floor(cell)), f = cell - lo
      const offset = ((branch * PLASMA.strands + strand) * MAGNETIC.samples + lo) * 4
      p.fromArray(curveData, offset); after.fromArray(curveData, offset + 4).sub(p)
      p.addScaledVector(after, f).toArray(centers, i * 3)
      after.normalize().toArray(tangents, i * 3)
      parcelVisibility[i] = redrawData[offset] + (redrawData[offset + 4] - redrawData[offset]) * f
    }
  }
  fillDensity(); writePositions()
  return {
    branchCount, arcLengths, torus, ejection, lifecycle, evolution, reorganization, shape: groups[0].deformation, structure, decayIndex, position, velocity, branches, temperature, density, centers, tangents, curveData, curveOpacity, redrawData, parcelVisibility, strandRanks, strandDirections, strandGenerations, renewals: groups.map(g => g.renewal), sample,
    advanceTo(age: number) {
      const target = Math.min(eruptive ? 13 : duration, age)
      while (time + PLASMA.step <= target + 1e-9) integrate()
      writePositions()
    },
  }
}
