/** 展示用生命周期，不把高度/可见度包络解释为磁能或辐射转移方程。 */
export const MAGNETIC_LIFETIME = 36
export const MAGNETIC_DECAY_DURATION = 14
export const CME_ARCADE_RETREAT_DURATION = 4.4
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (10 + t * (-15 + 6 * t))
}

export function magneticLifecycleTiming(duration = MAGNETIC_LIFETIME, seed = 0.47, eruptive = false) {
  const grown = eruptive ? 2.5 : 5.8 + 0.6 * seed
  return { grown, settled: grown + (eruptive ? 1 : 1.6), decay: duration - MAGNETIC_DECAY_DURATION, end: duration }
}

/** 时间由现有事件播放头提供；固定步积分与文档 seek 使用同一个包络。 */
export function createMagneticLifecycle(duration = MAGNETIC_LIFETIME, seed = 0.47, eruptive = false) {
  const timing = magneticLifecycleTiming(duration, seed, eruptive)
  const state = {
    age: 0, height: 0.045, drive: 0, relaxation: 0, opacity: 0,
    phase: '初生' as '初生' | '生长' | '稳定' | '松弛' | '回缩' | '结束',
    timing,
    advanceTo(age: number) {
      state.age = Math.max(0, age)
      const growth = smooth(age / timing.grown)
      state.drive = smooth(age / 0.7) * (1 - smooth((age - timing.grown + 1.8) / (timing.settled - timing.grown + 1.8)))
      state.relaxation = eruptive ? 0 : smooth((age - timing.decay) / 6.4)
      const retreat = eruptive ? 0 : smooth((age - timing.decay - 1.8) / 12.2)
      state.height = (0.045 + 0.955 * growth) * (1 - 0.965 * retreat)
      state.opacity = smooth(age / 0.3) * (eruptive ? 1 : 1 - smooth((age - duration + 1.15) / 1.15))
      state.phase = age < 0.8 ? '初生' : age < timing.settled ? '生长' : eruptive || age < timing.decay ? '稳定' : age < timing.decay + 2.4 ? '松弛' : age < duration ? '回缩' : '结束'
      return state
    },
  }
  return state
}
export type MagneticLifecycle = ReturnType<typeof createMagneticLifecycle>

/** 时间相关、可复现的平滑驱动；相邻模态共享低频分量，避免逐顶点白噪声。 */
export function magneticFormationDrive(age: number, seed: number, mode: number, axis: number) {
  const phase = seed * Math.PI * 2
  return 0.62 * Math.sin(age * 0.73 + phase + axis * 1.9)
    + 0.38 * Math.sin(age * (1.13 + mode * 0.21) + phase * 1.7 + mode * 1.37 + axis * 0.8)
}
