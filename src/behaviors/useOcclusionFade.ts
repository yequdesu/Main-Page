import { Vector3, type PerspectiveCamera } from 'three'

// Pre-allocated
const _occCamToPlanet = new Vector3()
const _occToParticle = new Vector3()
const _occProj = new Vector3()
const _occParticleNdc = new Vector3()
const _occFocusedNdc = new Vector3()
const _occSegment = new Vector3()
const _occParticleFromStart = new Vector3()
const _occClosestOnSegment = new Vector3()
const _occCamForward = new Vector3()

const PLANET_BASE_RADIUS = 0.015
const FOCUS_OCCLUSION_RANGE_SCALE = 2
const SCREEN_OCCLUSION_MARGIN = 0.018 * FOCUS_OCCLUSION_RANGE_SCALE
const AXIS_OCCLUSION_MARGIN = 0.025 * FOCUS_OCCLUSION_RANGE_SCALE
const FOCUS_CLEAR_START = 0.08 * FOCUS_OCCLUSION_RANGE_SCALE
const FOCUS_CLEAR_END = 0.24 * FOCUS_OCCLUSION_RANGE_SCALE
const STAR_FOCUS_CORRIDOR_START = 0.16 * FOCUS_OCCLUSION_RANGE_SCALE
const STAR_FOCUS_CORRIDOR_END = 0.55 * FOCUS_OCCLUSION_RANGE_SCALE
const CAMERA_FRONT_CLEAR_START = 0.2
const CAMERA_FRONT_CLEAR_FADE_IN_END = 0.65
const CAMERA_FRONT_CLEAR_FADE_OUT_START = 2.8
const CAMERA_FRONT_CLEAR_END = 3.4
const CAMERA_FRONT_CLEAR_BASE_RADIUS = 0.72
const CAMERA_FRONT_CLEAR_RADIUS_GROWTH = 0.16

/**
 * 遮挡淡化 �?处于相机与聚焦行星之间的粒子透明度降低�?
 *
 * �?animateDust() 中完整遮挡检测逻辑，逐字保留�?
 * 纯函�?�?Three.js 依赖仅限�?Vector3 运算�?
 *
 * 援引：原版投�?垂直距离检测（LighthouseScene.vue:750-763�?
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

  // Camera-to-planet direction
  _occCamToPlanet.subVectors(focusedPlanetPos, camera.position).normalize()

  // Particle projection distance along camera→planet axis
  _occToParticle.subVectors(particlePos, camera.position)
  const projDist = _occToParticle.dot(_occCamToPlanet)

  const fpDist = focusedPlanetPos.distanceTo(camera.position)
  const particleDist = particlePos.distanceTo(camera.position)
  if (!Number.isFinite(fpDist) || !Number.isFinite(particleDist) || fpDist <= 0.001 || particleDist <= 0.001) {
    return 1
  }

  // Use projected planet discs so nearby planets cannot remain visible over the focus target.
  _occParticleNdc.copy(particlePos).project(camera)
  _occFocusedNdc.copy(focusedPlanetPos).project(camera)
  const aspect = Math.max(camera.aspect, 0.1)
  // Measure an isotropic distance in screen space. The x axis needs to be
  // expanded by the viewport aspect ratio to match the y axis.
  const screenDistance = Math.hypot(
    (_occParticleNdc.x - _occFocusedNdc.x) * aspect,
    _occParticleNdc.y - _occFocusedNdc.y,
  )
  const tanHalfFov = Math.max(Math.tan((camera.fov * Math.PI) / 360), 0.001)
  const focusedScreenRadius = (PLANET_BASE_RADIUS * Math.max(focusedScale, 0.001)) / (fpDist * tanHalfFov)
  const particleScreenRadius = (PLANET_BASE_RADIUS * Math.max(particleScale, 0.001)) / (particleDist * tanHalfFov)
  const combinedScreenRadius = focusedScreenRadius + particleScreenRadius + SCREEN_OCCLUSION_MARGIN
  const overlap = 1 - screenDistance / Math.max(combinedScreenRadius, 0.001)

  let factor = 1
  if (overlap >= 0.35) {
    factor = 0
  } else if (overlap > 0) {
    factor = 1 - smoothstepNumber(0, 0.35, overlap)
  }

  // Keep a deliberate clear zone around the focus target. Exact disc overlap
  // is too small during the camera move, so nearby planets fade before they
  // can cross the target and block the HUD or the focused planet.
  factor = Math.min(
    factor,
    smoothstepNumber(FOCUS_CLEAR_START, FOCUS_CLEAR_END, screenDistance),
  )

  // Treat the star-to-focus path as a spatial corridor. A planet inside this
  // segment can cross the focus view even when its projected disc is separate.
  if (starPos) {
    _occSegment.subVectors(focusedPlanetPos, starPos)
    const segmentLengthSq = _occSegment.lengthSq()
    if (segmentLengthSq > 0.0001) {
      _occParticleFromStart.subVectors(particlePos, starPos)
      const segmentT = Math.max(0, Math.min(1, _occParticleFromStart.dot(_occSegment) / segmentLengthSq))
      _occClosestOnSegment.copy(starPos).addScaledVector(_occSegment, segmentT)
      const corridorDistance = particlePos.distanceTo(_occClosestOnSegment)
      factor = Math.min(
        factor,
        smoothstepNumber(STAR_FOCUS_CORRIDOR_START, STAR_FOCUS_CORRIDOR_END, corridorDistance),
      )
    }
  }

  // Clear a finite near-camera view corridor as well. This catches foreground
  // planets that are not close to the focus axis but still cross the lens.
  camera.getWorldDirection(_occCamForward)
  const cameraFrontDepth = _occToParticle.dot(_occCamForward)
  if (cameraFrontDepth > CAMERA_FRONT_CLEAR_START && cameraFrontDepth < CAMERA_FRONT_CLEAR_END) {
    _occProj.copy(camera.position).addScaledVector(_occCamForward, cameraFrontDepth)
    const lateralDistance = particlePos.distanceTo(_occProj)
    const clearRadius = CAMERA_FRONT_CLEAR_BASE_RADIUS + cameraFrontDepth * CAMERA_FRONT_CLEAR_RADIUS_GROWTH
    const lateralFactor = smoothstepNumber(clearRadius * 0.48, clearRadius, lateralDistance)
    const fadeIn = smoothstepNumber(
      CAMERA_FRONT_CLEAR_START,
      CAMERA_FRONT_CLEAR_FADE_IN_END,
      cameraFrontDepth,
    )
    const fadeOut = 1 - smoothstepNumber(
      CAMERA_FRONT_CLEAR_FADE_OUT_START,
      CAMERA_FRONT_CLEAR_END,
      cameraFrontDepth,
    )
    const clearPresence = Math.min(fadeIn, fadeOut)
    factor = Math.min(factor, 1 - clearPresence * (1 - lateralFactor))
  }

  // Keep the direct camera-axis case for a planet between camera and focus.
  if (projDist > 0.1 && projDist < fpDist + PLANET_BASE_RADIUS * particleScale) {
    _occProj.copy(camera.position).addScaledVector(_occCamToPlanet, projDist)
    const perpDist = particlePos.distanceTo(_occProj)
    const axisRadius = PLANET_BASE_RADIUS * (
      Math.max(particleScale, 0.001) + Math.max(focusedScale, 0.001)
    ) + AXIS_OCCLUSION_MARGIN
    if (perpDist < axisRadius) {
      factor = Math.min(factor, smoothstepNumber(axisRadius * 0.45, axisRadius, perpDist))
    }
  }

  return Math.max(0, Math.min(1, factor))
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.0001)))
  return t * t * (3 - 2 * t)
}
