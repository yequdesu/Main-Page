import { Vector3 } from 'three'
import { MAGNETIC, magneticEase, magneticStage } from './stellarMagnetism'
import { CME_DISSIPATION, CME_TAIL, cmeBackgroundParticleBudget } from './stellarParticleDensity'

/** 艺术化的显示/外流参数，时间以 CME 事件的场景秒计，不代表真实太阳时间。 */
export const CME_DISSOLUTION = {
  // 共享运动样本保持稳定；颗粒与雾片分别抽样，稀释颗粒不会减少雾。
  perStrand: 48, count: MAGNETIC.strands * 48, particleStride: 3, fogStride: 6,
  delay: 0.04, propagation: 0.26, conversion: 0.55,
  release: 0.52, releaseSpread: 0.25,
  particleFadeStart: 2.2, particleEnd: 4.3, mistEnd: 5.2,
} as const
export const CME_DISTRIBUTION = {
  arcSegments: 224, bottomRetention: 0.4, bottomHeight: 0.28,
  separationRadius: 0.18, separationSpeed: 0.24, separationDuration: 1.4,
} as const
const fract = (x: number) => x - Math.floor(x)
/** 按出生时的几何高度减量；只影响可见颗粒，连续过渡至侧面正常生成率。 */
export function cmeParticleRetention(height: number) {
  return CME_DISTRIBUTION.bottomRetention + (1 - CME_DISTRIBUTION.bottomRetention) * magneticEase(height / CME_DISTRIBUTION.bottomHeight)
}
export function cmeConversion(elapsed: number, s: number) {
  return magneticEase((elapsed - CME_DISSOLUTION.delay - CME_DISSOLUTION.propagation * Math.sin(Math.PI * s) ** 2) / CME_DISSOLUTION.conversion)
}
export function cmeReleaseTime(s: number) {
  return CME_DISSOLUTION.release + CME_DISSOLUTION.releaseSpread * Math.sin(Math.PI * s) ** 2
}
/** 每颗粒子在自身释放后错峰淡出；尾迹样本仍使用原有的较长寿命。 */
export function cmeParticleVisibility(elapsed: number, s: number, index: number, tail: boolean) {
  if (elapsed < 0) return 0
  if (tail) return 1
  const order = fract(index * 0.75487766625 + s * 17.13)
  const start = CME_DISSIPATION.delay + CME_DISSIPATION.stagger * order
  return 1 - magneticEase((elapsed - cmeReleaseTime(s) - start) / CME_DISSIPATION.fade)
}
/** 同一空间速度场平流粒子和雾，邻近团块共享卷动方向。 */
export function cmeWind(x: number, y: number, z: number, time: number, seed: number, out: Vector3) {
  const phase = seed * Math.PI * 2 + time * 0.35
  return out.set(0.12 * x + 0.24 * Math.sin(0.85 * y + phase) - 0.15 * z,
    0.65 + 0.10 * Math.max(0, y) + 0.10 * Math.sin(0.7 * x + phase),
    0.10 * z + 0.15 * x + 0.18 * Math.cos(0.85 * y + phase))
}
export type UpperPathSampler = (s: number, strand: number, out: Vector3) => Vector3

/** 由物理求解器每个固定步驱动：记录闭合事件，继承路径运动，再转入三维外流。 */
export function createCmeDissolution(seed: number) {
  const { count, perStrand } = CME_DISSOLUTION
  const closureTimes = new Float32Array(MAGNETIC.strands).fill(-1)
  const coordinates = new Float32Array(count), positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3), ages = new Float32Array(count).fill(-1)
  const released = new Uint8Array(count)
  const particleEnabled = new Uint8Array(count)
  const particleTail = new Uint8Array(count)
  const releaseTimes = new Float32Array(count).fill(-1), tailTransferTimes = new Float32Array(count).fill(-1)
  const tailPositions = new Float32Array(count * 3), tailVelocities = new Float32Array(count * 3)
  let tailSelected = false
  const arcLengths = new Float64Array(CME_DISTRIBUTION.arcSegments + 1)
  const snapshot = new Float32Array(count * 3), spreading = new Float32Array(count * 3)
  const point = new Vector3(), previous = new Vector3(), wind = new Vector3()

  function selectTail() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    let first = -1, firstRank = Infinity
    for (let i = 0; i < count; i += CME_DISSOLUTION.particleStride) {
      if (!particleEnabled[i]) continue
      const k = i * 3
      minX = Math.min(minX, positions[k]); maxX = Math.max(maxX, positions[k])
      minY = Math.min(minY, positions[k + 1]); maxY = Math.max(maxY, positions[k + 1])
      const rank = fract(Math.sin((i + 1) * 39.346 + seed * 73.156) * 47453.5453)
      if (rank < firstRank) { first = i; firstRank = rank }
    }
    if (first < 0) return
    const budget = cmeBackgroundParticleBudget(maxX - minX, maxY - minY, seed)
    particleTail[first] = 1
    // 最远点抽样保留分散的尾迹，避免剩下的少数光点再次聚在底部。
    for (let n = 1; n < budget; n++) {
      let best = -1, bestDistance = -1
      for (let i = 0; i < count; i += CME_DISSOLUTION.particleStride) {
        if (!particleEnabled[i] || particleTail[i]) continue
        let nearest = Infinity
        for (let j = 0; j < count; j += CME_DISSOLUTION.particleStride) {
          if (!particleTail[j]) continue
          const k = i * 3, other = j * 3
          const distance = (positions[k] - positions[other]) ** 2 + (positions[k + 1] - positions[other + 1]) ** 2 + (positions[k + 2] - positions[other + 2]) ** 2
          nearest = Math.min(nearest, distance)
        }
        if (nearest > bestDistance) { best = i; bestDistance = nearest }
      }
      if (best < 0) break
      particleTail[best] = 1
    }
  }

  function birth(strand: number, sample: UpperPathSampler) {
    const segments = CME_DISTRIBUTION.arcSegments
    sample(0, strand, previous)
    let minY = previous.y, maxY = previous.y
    arcLengths[0] = 0
    for (let n = 1; n <= segments; n++) {
      sample(n / segments, strand, point)
      arcLengths[n] = arcLengths[n - 1] + point.distanceTo(previous)
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
      previous.copy(point)
    }
    // 在一个可见粒子间距内错开各磁丝；保持循环次序，供雾核读取相邻样本。
    const phase = CME_DISSOLUTION.particleStride * fract(seed * 7.13 + strand * 0.61803398875)
    for (let j = 0; j < perStrand; j++) {
      const i = strand * perStrand + j
      const u = fract((j + phase + 0.15 * fract(i * 0.754877 + seed)) / perStrand)
      const distance = u * arcLengths[segments]
      let low = 0, high: number = segments
      while (high - low > 1) {
        const mid = (low + high) >> 1
        if (arcLengths[mid] <= distance) low = mid; else high = mid
      }
      const fraction = (distance - arcLengths[low]) / Math.max(1e-9, arcLengths[high] - arcLengths[low])
      coordinates[i] = (low + fraction) / segments
      sample(coordinates[i], strand, point).toArray(positions, i * 3)
      if (i % CME_DISSOLUTION.particleStride === 0) {
        const height = (point.y - minY) / Math.max(1e-6, maxY - minY)
        const selection = fract(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453)
        particleEnabled[i] = selection < cmeParticleRetention(height) ? 1 : 0
      }
    }
  }

  // 只在释放事件估算一次邻域拥挤方向，不在每帧做全体粒子的成对求解。
  // 使用固定步开始时的快照，避免遍历顺序影响结果；雾与颗粒共用此运动。
  function prepareSpreading(i: number) {
    const k = i * 3, radius = CME_DISTRIBUTION.separationRadius
    let x = 0, y = 0, z = 0, weight = 0
    for (let j = 0; j < count; j++) {
      if (j === i || closureTimes[Math.floor(j / perStrand)] < 0) continue
      const n = j * 3
      const dx = snapshot[k] - snapshot[n], dy = snapshot[k + 1] - snapshot[n + 1], dz = snapshot[k + 2] - snapshot[n + 2]
      const d = Math.hypot(dx, dy, dz)
      if (d >= radius || d < 1e-6) continue
      const w = (1 - d / radius) ** 2
      const scale = w / Math.max(0.02, d)
      x += dx * scale; y += dy * scale; z += dz * scale; weight += w
    }
    const scale = CME_DISTRIBUTION.separationSpeed / Math.max(1, weight)
    spreading[k] = x * scale; spreading[k + 1] = y * scale; spreading[k + 2] = z * scale
  }
  return {
    closureTimes, coordinates, positions, velocities, ages, released, particleEnabled, particleTail,
    releaseTimes, tailTransferTimes, tailPositions, tailVelocities,
    step(dt: number, time: number, radius: number, sample: UpperPathSampler) {
      const relaxation = 1 - Math.exp(-0.85 * dt)
      for (let strand = 0; strand < MAGNETIC.strands; strand++) {
        if (closureTimes[strand] < 0) {
          if (magneticStage(radius, strand, seed) < MAGNETIC.contact) continue
          closureTimes[strand] = time
          birth(strand, sample)
        }
      }
      snapshot.set(positions)
      for (let strand = 0; strand < MAGNETIC.strands; strand++) {
        if (closureTimes[strand] < 0) continue
        const elapsed = Math.max(0, time - closureTimes[strand])
        for (let j = 0; j < perStrand; j++) {
          const i = strand * perStrand + j, offset = i * 3, s = coordinates[i]
          ages[i] = elapsed
          if (elapsed > CME_DISSOLUTION.mistEnd) continue
          previous.fromArray(positions, offset)
          if (!released[i]) {
            sample(s, strand, point)
            if (elapsed > dt * 0.5) {
              wind.copy(point).sub(previous).divideScalar(dt)
              wind.toArray(velocities, offset)
            }
            point.toArray(positions, offset)
            if (elapsed >= cmeReleaseTime(s)) { released[i] = 1; releaseTimes[i] = time; prepareSpreading(i) }
          } else {
            cmeWind(previous.x, previous.y, previous.z, time, seed, wind)
            const sinceRelease = elapsed - cmeReleaseTime(s)
            const pulse = Math.sin(Math.PI * Math.min(1, sinceRelease / CME_DISTRIBUTION.separationDuration)) ** 2
            for (let axis = 0; axis < 3; axis++) {
              const k = offset + axis
              velocities[k] += (wind.getComponent(axis) + spreading[k] * pulse - velocities[k]) * relaxation
              positions[k] += velocities[k] * dt
            }
          }
        }
      }
      // 各磁丝均闭合后、首次快速淡出前选定尾迹，使用同一固定步的几何快照。
      if (!tailSelected && closureTimes.every(t => t >= 0)) { selectTail(); tailSelected = true }
      for (let i = 0; i < count; i += CME_DISSOLUTION.particleStride) {
        if (!particleTail[i] || tailTransferTimes[i] >= 0 || releaseTimes[i] < 0 || time - releaseTimes[i] < CME_TAIL.transferDelay) continue
        tailTransferTimes[i] = time
        for (let axis = 0; axis < 3; axis++) {
          tailPositions[i * 3 + axis] = positions[i * 3 + axis]
          tailVelocities[i * 3 + axis] = velocities[i * 3 + axis]
        }
      }
    },
  }
}
