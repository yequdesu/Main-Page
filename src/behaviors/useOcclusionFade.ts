import { Ray, Vector3, type PerspectiveCamera } from 'three'

// Pre-allocated ray-bundle geometry.
const _occRay = new Ray()
const _occToParticle = new Vector3()
const _occClosestOnRay = new Vector3()
const _occCamForward = new Vector3()
const _occCameraTarget = new Vector3()

const PLANET_BASE_RADIUS = 0.015
const STAR_OCCLUSION_RADIUS = 0.70
const FOCUS_RAY_CLEARANCE_NDC = 0.35
const STAR_RAY_CLEARANCE_NDC = 0.12
const CAMERA_CLEAR_DEPTH = 3.4
const CAMERA_RAY_CLEARANCE_NDC = 1.65

/**
 * 遮挡淡化：聚焦期间清除摄像机到受保护目标之间的视线。
 *
 * 所有保护规则都使用同一个“摄像机射线束”模型：
 * - 摄像机 -> 聚焦行星：保证目标本身和 HUD 不被其他行星挡住；
 * - 摄像机 -> 恒星：保证恒星和两者之间的视觉轴线不被挡住；
 * - 摄像机正前方短射线束：清除靠近镜头、可能遮挡视野的行星。
 *
 * NDC clearance 是射线束的角半径，而不是独立的三维空间区域。
 */

/**
 * 计算遮挡淡化因子�?
 *
 * @param particlePos       粒子世界坐标
 * @param camera            透视相机
 * @param focusedPlanetPos  聚焦行星世界坐标（null = 无聚焦，不执行遮挡）
 * @param particleScale     粒子当前缩放（用于遮挡判定半径）
 * @param baseOpacity       粒子基础透明�?
 * @returns 调整后的透明度（遮挡粒子降至 baseOpacity * 0.12�?
 */
export function calcOcclusionFade(
  particlePos: Vector3,
  camera: PerspectiveCamera,
  focusedPlanetPos: Vector3 | null,
  particleScale: number,
  baseOpacity: number,
  focusedScale = particleScale,
  starPos: Vector3 | null = null,
): number {
  return baseOpacity * calcOcclusionFactor(
    particlePos,
    camera,
    focusedPlanetPos,
    particleScale,
    focusedScale,
    starPos,
  )
}

export function calcOcclusionFactor(
  particlePos: Vector3,
  camera: PerspectiveCamera,
  focusedPlanetPos: Vector3 | null,
  particleScale: number,
  focusedScale = particleScale,
  starPos: Vector3 | null = null,
): number {
  if (!focusedPlanetPos) return 1

  const candidateRadius = PLANET_BASE_RADIUS * Math.max(particleScale, 0.001)
  const focusRadius = PLANET_BASE_RADIUS * Math.max(focusedScale, 0.001)
  let factor = rayBundleFade(
    particlePos,
    candidateRadius,
    camera,
    focusedPlanetPos,
    focusRadius,
    FOCUS_RAY_CLEARANCE_NDC,
  )

  if (starPos) {
    factor = Math.min(
      factor,
      rayBundleFade(
        particlePos,
        candidateRadius,
        camera,
        starPos,
        STAR_OCCLUSION_RADIUS,
        STAR_RAY_CLEARANCE_NDC,
      ),
    )
  }

  // Clear only a short camera-facing ray bundle. It is a view protection
  // zone, not a world-space box or sphere, so it follows camera orientation.
  camera.getWorldDirection(_occCamForward)
  _occCameraTarget.copy(camera.position).addScaledVector(_occCamForward, CAMERA_CLEAR_DEPTH)
  factor = Math.min(
    factor,
    rayBundleFade(
      particlePos,
      candidateRadius,
      camera,
      _occCameraTarget,
      0,
      CAMERA_RAY_CLEARANCE_NDC,
    ),
  )

  return Math.max(0, Math.min(1, factor))
}

function rayBundleFade(
  candidate: Vector3,
  candidateRadius: number,
  camera: PerspectiveCamera,
  target: Vector3,
  targetRadius: number,
  clearanceNdc: number,
): number {
  _occRay.origin.copy(camera.position)
  _occRay.direction.subVectors(target, camera.position).normalize()
  const targetDistance = camera.position.distanceTo(target)
  if (!Number.isFinite(targetDistance) || targetDistance <= 0.001) return 1

  _occToParticle.subVectors(candidate, camera.position)
  const depth = _occToParticle.dot(_occRay.direction)
  if (depth <= 0 || depth >= targetDistance) return 1

  _occRay.at(depth, _occClosestOnRay)
  const lateralDistance = candidate.distanceTo(_occClosestOnRay)
  const tanHalfFov = Math.max(Math.tan((camera.fov * Math.PI) / 360), 0.001)
  const targetConeRadius = (targetRadius * depth) / targetDistance
  const angularClearance = depth * tanHalfFov * clearanceNdc
  const bundleRadius = candidateRadius + targetConeRadius + angularClearance
  const overlap = 1 - lateralDistance / Math.max(bundleRadius, 0.0001)
  if (overlap <= 0) return 1
  return 1 - smoothstepNumber(0.12, 0.82, overlap)
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.0001)))
  return t * t * (3 - 2 * t)
}
