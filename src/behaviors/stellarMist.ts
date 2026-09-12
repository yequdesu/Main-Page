import { CME_DISSOLUTION, type createCmeDissolution } from './stellarEjection'
import { magneticEase } from './stellarMagnetism'

export const CME_MIST_KERNEL = { overlap: 0.9, falloff: 3.6 } as const

/** 从原外流位置重建相互覆盖的雾核；只计算宽度/权重，不移动采样点。 */
export function createCmeMistField(radiusScale: number) {
  const { count: samples, fogStride, perStrand } = CME_DISSOLUTION
  const count = samples / fogStride, strandCount = perStrand / fogStride
  // 每核 [横向半径, 沿流伸长率, 重叠补偿]，供实例缓冲直接使用。
  const kernels = new Float32Array(count * 3)
  const directions = new Float32Array(count * 3), births = new Float32Array(count)
  return {
    kernels,
    update(state: ReturnType<typeof createCmeDissolution>) {
      const p = state.positions, v = state.velocities
      for (let j = 0; j < count; j++) {
        const i = j * fogStride, k = i * 3, out = j * 3
        const age = Math.max(0, state.ages[i])
        births[j] = magneticEase(age / 0.55)
        const start = Math.floor(j / strandCount) * strandCount, n = j % strandCount
        const previous = (start + (n + strandCount - 1) % strandCount) * fogStride * 3
        const next = (start + (n + 1) % strandCount) * fogStride * 3
        const gap = Math.max(Math.hypot(p[k] - p[previous], p[k + 1] - p[previous + 1], p[k + 2] - p[previous + 2]),
          Math.hypot(p[k] - p[next], p[k + 1] - p[next + 1], p[k + 2] - p[next + 2]))
        kernels[out] = Math.max(radiusScale * (0.14 + 0.12 * age), CME_MIST_KERNEL.overlap * gap)
        kernels[out + 1] = Math.min(1.8, 1.15 + 0.18 * age)
        const speed = Math.hypot(v[k], v[k + 1], v[k + 2])
        directions[out] = speed > 1e-6 ? v[k] / speed : 0
        directions[out + 1] = speed > 1e-6 ? v[k + 1] / speed : 1
        directions[out + 2] = speed > 1e-6 ? v[k + 2] / speed : 0
      }
      for (let j = 0; j < count; j++) {
        const k = j * fogStride * 3, out = j * 3
        const radius2 = kernels[out] ** 2, stretch = kernels[out + 1]
        let density = 0
        for (let n = 0; n < count; n++) {
          if (births[n] <= 0) continue
          const other = n * fogStride * 3
          const dx = p[other] - p[k], dy = p[other + 1] - p[k + 1], dz = p[other + 2] - p[k + 2]
          const along = dx * directions[out] + dy * directions[out + 1] + dz * directions[out + 2]
          const q2 = Math.max(0, dx * dx + dy * dy + dz * dz - along * along * (1 - 1 / (stretch * stretch))) / radius2
          density += births[n] * Math.exp(-CME_MIST_KERNEL.falloff * q2)
        }
        kernels[out + 2] = births[j] > 0 ? 1 / Math.max(1, density) : 0
      }
    },
  }
}
