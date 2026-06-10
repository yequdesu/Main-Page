/**
 * 遮挡淡化 — 处于相机与聚焦行星之间的粒子透明度降低。
 *
 * 原 animateDust() 中遮挡淡化逻辑。
 * 纯函数 — 无 Three.js 依赖，可直接单测。
 *
 * 援引：L1 测试覆盖 — 纯函数计算
 */

/**
 * 计算遮挡淡化因子。
 *
 * @param particleDistToCamera  粒子到相机距离
 * @param focusedPlanetDist     聚焦行星到相机距离
 * @param baseOpacity           粒子基础透明度
 * @returns 调整后的透明度（遮挡粒子降至 baseOpacity * 0.12）
 */
export function calcOcclusionFade(
  particleDistToCamera: number,
  focusedPlanetDist: number | null,
  baseOpacity: number,
): number {
  if (focusedPlanetDist === null) return baseOpacity

  // 粒子在聚焦行星前方（离相机更近）→ 遮挡，降低透明度
  if (particleDistToCamera < focusedPlanetDist) {
    return baseOpacity * 0.12
  }

  return baseOpacity
}
