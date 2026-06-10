import { Vector3, type PerspectiveCamera } from 'three'

// Pre-allocated
const _occCamToPlanet = new Vector3()
const _occToParticle = new Vector3()
const _occProj = new Vector3()

/**
 * 遮挡淡化 — 处于相机与聚焦行星之间的粒子透明度降低。
 *
 * 原 animateDust() 中完整遮挡检测逻辑，逐字保留。
 * 纯函数 — Three.js 依赖仅限于 Vector3 运算。
 *
 * 援引：原版投影-垂直距离检测（LighthouseScene.vue:750-763）
 */

/**
 * 计算遮挡淡化因子。
 *
 * @param particlePos       粒子世界坐标
 * @param camera            透视相机
 * @param focusedPlanetPos  聚焦行星世界坐标（null = 无聚焦，不执行遮挡）
 * @param particleScale     粒子当前缩放（用于遮挡判定半径）
 * @param baseOpacity       粒子基础透明度
 * @returns 调整后的透明度（遮挡粒子降至 baseOpacity * 0.12）
 */
export function calcOcclusionFade(
  particlePos: Vector3,
  camera: PerspectiveCamera,
  focusedPlanetPos: Vector3 | null,
  particleScale: number,
  baseOpacity: number,
): number {
  if (!focusedPlanetPos) return baseOpacity

  // Camera-to-planet direction
  _occCamToPlanet.subVectors(focusedPlanetPos, camera.position).normalize()

  // Particle projection distance along camera→planet axis
  _occToParticle.subVectors(particlePos, camera.position)
  const projDist = _occToParticle.dot(_occCamToPlanet)

  const fpDist = focusedPlanetPos.distanceTo(camera.position)

  // Particle must be between camera and planet (with margins)
  if (projDist <= 0.5 || projDist >= fpDist - 0.3) return baseOpacity

  // Perpendicular distance from camera→planet axis
  _occProj.copy(camera.position).addScaledVector(_occCamToPlanet, projDist)
  const perpDist = particlePos.distanceTo(_occProj)

  // Occlusion radius based on particle scale
  const occRadius = particleScale * 0.6 + 0.06

  if (perpDist < occRadius) {
    return baseOpacity * 0.12
  }

  return baseOpacity
}
