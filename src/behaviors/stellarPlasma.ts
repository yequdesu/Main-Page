import { Vector3 } from 'three'
import { createCmeDissolution } from './stellarEjection'
import { createProminenceStructure, type ProminenceMorphology } from './stellarMorphology'
import { MAGNETIC, createMagneticDeformation, magneticFluxRadius, magneticStage, sampleMagneticStrand, type MagneticBranch } from './stellarMagnetism'

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
export const PLASMA_COUNT = PLASMA.strands * PLASMA.parcelsPerStrand
const fract = (v: number) => v - Math.floor(v)

/** 沿动态磁结构输运；原连接、上升闭合支和日面拱廊各自拥有密度与边界条件。 */
export function createFluxRopeSimulation(seed: number, eruptive: boolean, morphology?: ProminenceMorphology | null) {
  const torus: TorusState = { radius: 1, velocity: 0.005 }
  const shape = createMagneticDeformation(seed)
  const structure = eruptive
    ? { kind: 'eruption' as const, companion: null, families: [{ seed, sourceKind: 'eruption' as const, width: shape.span, height: shape.height, offsetX: 0, offsetZ: 0, yaw: 0, strands: MAGNETIC.strands }] }
    : createProminenceStructure(seed, morphology)
  let parcelOffset = 0
  const groups = structure.families.map(family => {
    const deformation = eruptive ? shape : createMagneticDeformation(family.seed)
    const first = parcelOffset
    parcelOffset += family.strands * PLASMA.parcelsPerStrand
    return { family, deformation, first, end: parcelOffset, scaleX: family.width / deformation.span, scaleY: family.height / deformation.height }
  })
  const decayIndex = eruptive ? 2.2 + seed * 0.45 : 1.1
  const position = new Float64Array(PLASMA_COUNT), velocity = new Float64Array(PLASMA_COUNT)
  const branches = new Uint8Array(PLASMA_COUNT)
  const temperature = new Float64Array(PLASMA_COUNT), density = new Float32Array(PLASMA_COUNT)
  const centers = new Float32Array(PLASMA_COUNT * 3), tangents = new Float32Array(PLASMA_COUNT * 3)
  // RGBA = 三维位置 + 局部弧丝宽度；CPU 和 GPU 读取同一份路径表。
  const curveData = new Float32Array(MAGNETIC.samples * MAGNETIC.strands * 3 * 4)
  const bins = 32, occupancy = new Float64Array(PLASMA.strands * bins * 3)
  const families = new Uint8Array(PLASMA.strands)
  const thicknessScale = new Float64Array(PLASMA.strands)
  const p = new Vector3(), before = new Vector3(), after = new Vector3()
  let time = 0
  groups.forEach((group, index) => {
    for (let strand = group.first / PLASMA.parcelsPerStrand; strand < group.end / PLASMA.parcelsPerStrand; strand++) {
      families[strand] = index
      thicknessScale[strand] = Math.sqrt(group.scaleX * group.scaleY)
    }
  })
  for (let i = 0; i < PLASMA_COUNT; i++) {
    const strand = Math.floor(i / PLASMA.parcelsPerStrand)
    position[i] = 0.05 + 0.9 * fract((i % PLASMA.parcelsPerStrand) / PLASMA.parcelsPerStrand + seed + strand * 0.073)
    velocity[i] = (strand % 2 ? -1 : 1) * (0.12 + fract(i * 0.7548 + seed) * 0.28)
    temperature[i] = Math.abs(position[i] - 0.5) < 0.18 ? 0.22 : 0.95
  }
  function sample(s: number, strand: number, branch: MagneticBranch, target: Vector3) {
    const group = groups[families[strand]], { family, deformation, scaleX, scaleY } = group
    sampleMagneticStrand(s, strand, torus.radius, family.seed, branch, target, deformation)
    target.x *= scaleX; target.y *= scaleY; target.z *= Math.sqrt(scaleX * scaleY)
    const x = target.x, z = target.z, angle = family.yaw
    target.x = x * Math.cos(angle) - z * Math.sin(angle) + family.offsetX
    target.z = x * Math.sin(angle) + z * Math.cos(angle) + family.offsetZ
    return target
  }
  function gridIndex(strand: number, branch: number, bin: number) {
    const cell = branch === 1 ? (bin + bins) % bins : Math.max(0, Math.min(bins - 1, bin))
    return (strand * 3 + branch) * bins + cell
  }
  function fillDensity() {
    occupancy.fill(0)
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), branch = branches[i]
      const cell = position[i] * (branch === 1 ? bins : bins - 1), lo = Math.floor(cell), f = cell - lo
      occupancy[gridIndex(strand, branch, lo)] += 1 - f
      occupancy[gridIndex(strand, branch, lo + 1)] += f
    }
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), branch = branches[i]
      const bin = Math.round(position[i] * (branch === 1 ? bins : bins - 1))
      const local = occupancy[gridIndex(strand, branch, bin - 1)] + 2 * occupancy[gridIndex(strand, branch, bin)] + occupancy[gridIndex(strand, branch, bin + 1)]
      density[i] = Math.max(0.05, local / (branch === 2 ? 1 : torus.radius ** 3))
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
  function tangent(s: number, strand: number, branch: MagneticBranch) {
    const low = branch === 1 ? fract(s - 0.001) : Math.max(0, s - 0.001)
    const high = branch === 1 ? fract(s + 0.001) : Math.min(1, s + 0.001)
    sample(low, strand, branch, before); sample(high, strand, branch, after)
    return after.sub(before).multiplyScalar(1 / (branch === 1 ? 0.002 : high - low))
  }
  const ejection = eruptive ? createCmeDissolution(seed) : null
  const sampleUpper = (s: number, strand: number, out: Vector3) => sample(s, strand, 1, out)
  function integrate() {
    const dt = PLASMA.step
    stepTorus(torus, dt * (eruptive ? 0.92 : 0.55), decayIndex)
    for (const group of groups) group.deformation.step(dt, torus.radius, position, temperature, branches, group.first, group.end)
    ejection?.step(dt, time + dt, torus.radius, sampleUpper)
    switchConnections()
    fillDensity()
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), s = position[i], branch = branches[i] as MagneticBranch
      tangent(s, strand, branch)
      const metric = Math.max(0.05, after.length()), slope = after.y / metric
      velocity[i] += (-0.42 * slope - 0.10 * velocity[i]) * dt
      position[i] += velocity[i] / metric * dt
      if (branch === 1) position[i] = fract(position[i])
      else if (position[i] <= 0.025 || position[i] >= 0.975) {
        const left = position[i] <= 0.025
        position[i] = left ? 0.027 : 0.973
        velocity[i] = (left ? 1 : -1) * (0.95 + fract(i * 0.618 + seed) * 0.2)
        temperature[i] = 1
      }
      const footHeating = branch === 1 ? 0 : 0.5 * Math.exp(-Math.min(position[i], 1 - position[i]) * 18)
      const cooling = 0.065 * density[i] / Math.sqrt(Math.max(0.08, temperature[i]))
      const heat = 0.065 + footHeating + 0.12 * (1 - temperature[i])
      temperature[i] = Math.max(0.08, Math.min(1.25, temperature[i] + (heat - cooling) * dt))
    }
    time += dt
  }
  function writePositions() {
    for (let strand = 0; strand < PLASMA.strands; strand++) {
      const split = eruptive && magneticStage(torus.radius, strand, seed) >= MAGNETIC.contact
      for (let branch = 0; branch < 3; branch++) {
        if (split ? branch === 0 : branch !== 0) continue
        for (let j = 0; j < MAGNETIC.samples; j++) {
          const s = j / (MAGNETIC.samples - 1)
          sample(s, strand, branch as MagneticBranch, p)
          const offset = ((branch * PLASMA.strands + strand) * MAGNETIC.samples + j) * 4
          p.toArray(curveData, offset)
          // 闭合支的场强坐标同样周期连续，避免首尾位置相同但带宽跳变。
          const fieldCoordinate = branch === 1 ? 0.5 - 0.5 * Math.sin(2 * Math.PI * s) : s
          curveData[offset + 3] = magneticFluxRadius(fieldCoordinate, p.y / groups[families[strand]].scaleY, groups[families[strand]].family.seed) * 0.18 * thicknessScale[strand]
        }
      }
    }
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand), s = position[i], branch = branches[i] as MagneticBranch
      // 与 GPU 一样在相邻路径样本间插值，避免渲染路径与示踪路径分离。
      const cell = s * (MAGNETIC.samples - 1), lo = Math.min(MAGNETIC.samples - 2, Math.floor(cell)), f = cell - lo
      const offset = ((branch * PLASMA.strands + strand) * MAGNETIC.samples + lo) * 4
      p.fromArray(curveData, offset); after.fromArray(curveData, offset + 4).sub(p)
      p.addScaledVector(after, f).toArray(centers, i * 3)
      after.normalize().toArray(tangents, i * 3)
    }
  }
  fillDensity(); writePositions()
  return {
    torus, ejection, shape: groups[0].deformation, structure, decayIndex, position, velocity, branches, temperature, density, centers, tangents, curveData, sample,
    advanceTo(age: number) {
      const target = Math.min(eruptive ? 13 : 30, age)
      while (time + PLASMA.step <= target + 1e-9) integrate()
      writePositions()
    },
  }
}
