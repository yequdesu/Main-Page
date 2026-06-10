import type { ParticleData } from '../types'

/**
 * 粒子外观计算结果。
 * scale / opacity 供 mesh 直接使用，颜色计算留在调用方（涉及 Three.js Color）。
 */
export interface AppearanceResult {
  scale: number
  opacity: number
  /** 白化过渡因子 [0,1] — 用于 lerp(baseColor, grayColor, wofFactor) */
  wofFactor: number
  /** Act 3 过渡因子 [0,1] — 用于 lerp(grayColor, act3Color, act3Factor) */
  act3Factor: number
}

/**
 * 计算单个粒子的缩放、透明度、颜色过渡因子。
 *
 * 原 animateDust() 中 per-particle 外观计算逻辑，逐字保留。
 * 纯函数 — 无 Three.js 依赖，可直接单测。
 *
 * 援引：L1 测试覆盖 — 纯函数计算，不涉及 Three.js 渲染
 */
export function calcAppearance(
  d: ParticleData,
  sp: number,
  wof: number,        // white-out factor [0,1]
  smooth3: number,     // Act 3 progress [0,1]
  cameraDistance: number,
  beamFactor: number,  // 光束照射因子 [0,1]
): AppearanceResult {
  const ds = 22 / Math.max(5, cameraDistance)

  // Scale
  const scaleAct1 = d.scale * (0.4 + beamFactor * 2) * ds
  const scaleAct2 = d.scale * 0.7 * d.sizeBoost * ds
  const scaleAct3 = scaleAct2 * d.scaleMult
  let s = scaleAct1 + (scaleAct2 - scaleAct1) * wof
  s = s + (scaleAct3 - s) * smooth3
  s *= (1.0 + d.hoverFactor * 0.35)

  // Opacity
  let opacityAct1 = (0.14 + beamFactor * 0.76) * (0.35 + sp * 0.65)
  if (cameraDistance < 7) opacityAct1 *= Math.max(0, (cameraDistance - 2.5) / 4.5)
  if (cameraDistance > 42) opacityAct1 *= Math.max(0, 1 - (cameraDistance - 42) / 10)
  const opacityAct2 = 0.4
  const opacityAct3 = d.isMainPlanet ? 1.0 : 0.55
  let opacity = opacityAct1 + (opacityAct2 - opacityAct1) * wof
  opacity = opacity + (opacityAct3 - opacity) * smooth3

  return { scale: s, opacity, wofFactor: wof, act3Factor: smooth3 }
}
