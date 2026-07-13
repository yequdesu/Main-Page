import { Vector3, Quaternion, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { SCENE_CENTER_Z, FOCUS_TIMEOUT, ORBIT_RADII, clamped, smoothstep } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { touchActorFrame } from '../composition/actorRuntime'
import { readPlanetAtmosphereWorldRadius, readPlanetParticleIndex } from '../composition/coreAnchors'
import { FOCUS_EFFECT_EXIT_DURATION, focusExitDuration, inverseProportionalEase } from '../composition/focusCorridorGeometry'
import { renderFocusHudFrame } from '../actors/focusHudBridge'
import type { ScreenCircle, ScreenPoint } from '../types'

// Pre-allocated objects (from LighthouseScene.vue camera focus system)
const _defaultCamPos = new Vector3(0, 0.25, 8)
const _defaultLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const _targetCamPos = new Vector3(0, 0.25, 8)
const _targetLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const _currentLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const _camOffsetDir = new Vector3()
const _camToStar = new Vector3()
const _camLeftDir = new Vector3()
const _camUp = new Vector3(0, 1, 0)
const _starPos = new Vector3(0, -1.0, SCENE_CENTER_Z)
const _focusAxisPoint = new Vector3()
const _focusBaseOffset = new Vector3()
const _focusOrbitQuat = new Quaternion()
const _focusDepartPos = new Vector3()
const _focusDepartLookAt = new Vector3()
const _focusCandidateA = new Vector3()
const _focusCandidateB = new Vector3()
const _ssStarEdge = new Vector3()
const _ssScratch = new Vector3()
const _viewDir = new Vector3()
const _planetWorldPos = new Vector3()
const _vCamToSphere = new Vector3()
const _uRight = new Vector3()
const _uUp = new Vector3()
const _sphereTangentCenter = new Vector3()

let _focusOrbitAngle = 0
let _focusUIProgress = 0
let _lastFocusTarget = -1
let _lastFocusTime = 0
let _lastHudStar: ScreenCircle | undefined
let _lastHudPlanet: ScreenCircle | undefined
let _lastHudFocusedIdx = -1
let _lastHudFocusAge = 0
let _lastHudDrawProgress = 0
let _hudExitStartTime = 0
let _hudExitStartProgress = 0
let _hudExitStartAlpha = 0
let _hudExitDuration = FOCUS_EFFECT_EXIT_DURATION
let _focusSideSign = 1
let _focusDepartFov = 40
let _focusDepartDistance = 1

const HUD_STAR_ATMOSPHERE_WORLD_RADIUS = 0.70
const HUD_STAR_ATMOSPHERE_CLEARANCE = 24
const HUD_PLANET_ATMOSPHERE_CLEARANCE = 26
const HUD_CONTOUR_SEGMENTS = 48
const HUD_CAMERA_SETTLE_DELAY = 1.15
const HUD_CAMERA_DEPART_DISTANCE = 0.55
const HUD_FADE_IN_SPEED = 0.08
const HUD_FADE_OUT_SPEED = 0.12
const HUD_FULL_ALPHA = 0.99
const HUD_FULL_DISPLAY_DURATION = Math.log(1 - HUD_FULL_ALPHA) / Math.log(1 - HUD_FADE_IN_SPEED) / 60
const FOCUS_BEHIND_DISTANCE = 2.5
const FOCUS_SIDE_DISTANCE = 2.2
const FOCUS_APPROACH_DURATION = 1.7
const FOCUS_DOLLY_DURATION = HUD_CAMERA_SETTLE_DELAY + HUD_FULL_DISPLAY_DURATION
const FOCUS_ORBIT_DELAY = 1.65
const FOCUS_ORBIT_RAMP = 1.9
const FOCUS_ORBIT_SPEED = 0.014
const FOCUS_TARGET_FOLLOW = 0.06
const FOCUS_CAMERA_FOLLOW = 0.055
const FOCUS_LOOK_FOLLOW = 0.06
const DEFAULT_CAMERA_FOV = 40
const FOCUS_DOLLY_MAX_FOV = 72
const HUD_EFFECT_EXIT_DURATION = FOCUS_EFFECT_EXIT_DURATION
const FOCUS_FOV_FOLLOW = 0.12
const FOCUS_FOV_RETURN = 0.08

/**
 * 相机聚焦系统 �?双层平滑 + 轨道绕行 + 30s 自动取消�?
 *
 * �?updateCameraFocus():776-913，逐字保留算法�?
 *
 * 用于 Act3ContentPhase �?DustField �?useFrame 中调用�?
 *
 * 援引：Target-Lerp 模式（Three.js 社区通用�?
 */
export function updateCameraFocus(
  camera: PerspectiveCamera,
  sp: number,
  time: number,
  getPlanetPosition: (idx: number) => Vector3 | null,
): void {
  const isAct3 = sp >= TIMELINE.act3Shift.start
  touchActorFrame('cameraFocus', Math.round(time * 60), isAct3)
  const store = useScrollStore.getState()

  if (!isAct3) {
    if (store.focusedPlanetIdx >= 0) {
      store.clearFocus()
    }
    _focusUIProgress = 0
    _lastFocusTarget = -1
    _lastFocusTime = 0
    hideOverlayIfNeeded(store, camera)
    // Lerp back to default
    _targetCamPos.lerp(_defaultCamPos, 0.04)
    _targetLookAt.lerp(_defaultLookAt, 0.04)
    _currentLookAt.lerp(_targetLookAt, 0.06)
    camera.position.lerp(_targetCamPos, 0.06)
    updateCameraFov(camera, DEFAULT_CAMERA_FOV, FOCUS_FOV_RETURN)
    camera.lookAt(_currentLookAt)
    return
  }

  const focusedIdx = store.focusedPlanetIdx
  const planet = focusedIdx >= 0 ? getPlanetPosition(focusedIdx) : null
  let focusStartTime = store.focusStartTime

  if (planet && (store.focusStartTime <= 0 || focusedIdx !== _lastFocusTarget)) {
    focusStartTime = time
    store.setFocusStartTime(focusStartTime)
    _lastFocusTarget = focusedIdx
    _focusUIProgress = 0
    _focusOrbitAngle = 0
    _lastFocusTime = time
    _hudExitStartTime = 0
    _hudExitStartProgress = 0
    _hudExitStartAlpha = 0
    _hudExitDuration = FOCUS_EFFECT_EXIT_DURATION
    _focusDepartPos.copy(camera.position)
    _focusDepartLookAt.copy(_currentLookAt)
    _camToStar.subVectors(_starPos, planet).normalize()
    _camLeftDir.crossVectors(_camUp, _camToStar).normalize()
    const focusedTrackIdx = getFocusedTrackIndex(focusedIdx)
    const focusedOrbitRadius = ORBIT_RADII[focusedTrackIdx] ?? ORBIT_RADII[0]
    _focusAxisPoint.copy(planet).addScaledVector(_camToStar, focusedOrbitRadius * 0.25)
    _focusDepartFov = camera.fov
    _focusDepartDistance = Math.max(0.001, _focusDepartPos.distanceTo(_focusAxisPoint))
    _focusCandidateA.copy(planet)
      .addScaledVector(_camToStar, -FOCUS_BEHIND_DISTANCE)
      .addScaledVector(_camLeftDir, FOCUS_SIDE_DISTANCE)
    _focusCandidateB.copy(planet)
      .addScaledVector(_camToStar, -FOCUS_BEHIND_DISTANCE)
      .addScaledVector(_camLeftDir, -FOCUS_SIDE_DISTANCE)
    _focusSideSign = _focusCandidateA.distanceToSquared(_focusDepartPos) <= _focusCandidateB.distanceToSquared(_focusDepartPos)
      ? 1
      : -1
    hideOverlayIfNeeded(store, camera)
  }

  // Auto-unfocus after timeout
  if (planet && focusStartTime > 0 && time - focusStartTime > FOCUS_TIMEOUT) {
    store.clearFocus()
    // Fall through to unfocused path...
  }

  const isFocused = store.focusedPlanetIdx >= 0 && !!getPlanetPosition(store.focusedPlanetIdx)

  if (isFocused && planet) {
    const focusAge = Math.max(0, time - focusStartTime)
    const approachEase = smoothstep(clamped(focusAge, 0, FOCUS_APPROACH_DURATION))
    const orbitRamp = smoothstep(clamped(focusAge, FOCUS_ORBIT_DELAY, FOCUS_ORBIT_DELAY + FOCUS_ORBIT_RAMP))

    _camToStar.subVectors(_starPos, planet).normalize()
    _camLeftDir.crossVectors(_camUp, _camToStar).normalize()

    const focusedTrackIdx = getFocusedTrackIndex(focusedIdx)
    const focusedOrbitRadius = ORBIT_RADII[focusedTrackIdx] ?? ORBIT_RADII[0]

    _focusAxisPoint.copy(planet).addScaledVector(_camToStar, focusedOrbitRadius * 0.25)

    const focusDt = Math.min(0.05, Math.max(0, time - _lastFocusTime))
    _lastFocusTime = time
    _focusOrbitAngle += FOCUS_ORBIT_SPEED * focusDt * orbitRamp
    _focusOrbitQuat.setFromAxisAngle(_camToStar, _focusOrbitAngle)

    _camOffsetDir.copy(planet)
      .addScaledVector(_camToStar, -FOCUS_BEHIND_DISTANCE)
      .addScaledVector(_camLeftDir, FOCUS_SIDE_DISTANCE * _focusSideSign)
    _focusBaseOffset.subVectors(_camOffsetDir, _focusAxisPoint)
    _focusBaseOffset.applyQuaternion(_focusOrbitQuat)
    _camOffsetDir.copy(_focusAxisPoint).add(_focusBaseOffset)

    if (approachEase < 1) {
      _targetCamPos.copy(_focusDepartPos).lerp(_camOffsetDir, approachEase)
      _targetLookAt.copy(_focusDepartLookAt).lerp(_focusAxisPoint, approachEase)
    } else {
      _targetCamPos.lerp(_camOffsetDir, FOCUS_TARGET_FOLLOW)
      _targetLookAt.lerp(_focusAxisPoint, FOCUS_TARGET_FOLLOW)
    }
  } else {
    _targetCamPos.lerp(_defaultCamPos, 0.04)
    _targetLookAt.lerp(_defaultLookAt, 0.04)
    _lastFocusTarget = -1
    _lastFocusTime = time
  }

  // Camera follows smoothed target
  _currentLookAt.lerp(_targetLookAt, isFocused ? FOCUS_LOOK_FOLLOW : 0.06)
  camera.position.lerp(_targetCamPos, isFocused ? FOCUS_CAMERA_FOLLOW : 0.06)
  if (isFocused && planet) {
    const focusAge = Math.max(0, time - focusStartTime)
    const hudRevealProgress = smoothstep(clamped(focusAge, 0, FOCUS_DOLLY_DURATION))
    const focusDistance = Math.max(0.001, camera.position.distanceTo(_focusAxisPoint))
    const distanceRatio = _focusDepartDistance / focusDistance
    const baseTan = Math.tan((_focusDepartFov * Math.PI) / 360)
    const distanceDollyFov = (2 * Math.atan(baseTan * distanceRatio) * 180) / Math.PI
    const dollyFov = _focusDepartFov + (
      Math.min(FOCUS_DOLLY_MAX_FOV, Math.max(_focusDepartFov, distanceDollyFov)) - _focusDepartFov
    ) * hudRevealProgress
    updateCameraFov(
      camera,
      dollyFov,
      FOCUS_FOV_FOLLOW,
    )
  } else {
    updateCameraFov(camera, DEFAULT_CAMERA_FOV, FOCUS_FOV_RETURN)
  }
  camera.lookAt(_currentLookAt)

  if (isFocused && planet) {
    const focusAge = Math.max(0, time - focusStartTime)
    const hudRevealProgress = smoothstep(clamped(focusAge, 0, FOCUS_DOLLY_DURATION))
    const movedFromDepart = camera.position.distanceTo(_focusDepartPos)
    const cameraStable = focusAge > HUD_CAMERA_SETTLE_DELAY && movedFromDepart > HUD_CAMERA_DEPART_DISTANCE
    _viewDir.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
    _planetWorldPos.copy(planet).sub(camera.position).normalize()
    const inFront = _viewDir.dot(_planetWorldPos) > 0.55
    _focusUIProgress += ((cameraStable && inFront ? 1 : 0) - _focusUIProgress) * HUD_FADE_IN_SPEED
    const activeAlpha = overlayAlphaValue(_focusUIProgress)

    // Keep the HUD canvas mounted from the focus trigger onward. Its reveal
    // progress is driven by focus age, while camera stability only controls
    // the steady-state lifecycle alpha and exit behavior.
    emitOverlayData(camera, planet, store, activeAlpha, hudRevealProgress, focusAge)
  } else {
    fadeOverlayOut(store, camera, time)
  }
}

function updateCameraFov(camera: PerspectiveCamera, targetFov: number, follow: number): void {
  const nextFov = camera.fov + (targetFov - camera.fov) * follow
  if (Math.abs(nextFov - camera.fov) < 0.0001) return
  camera.fov = nextFov
  camera.updateProjectionMatrix()
}

function fadeOverlayOut(store: ReturnType<typeof useScrollStore.getState>, camera: PerspectiveCamera, time: number): void {
  _focusUIProgress += (0 - _focusUIProgress) * HUD_FADE_OUT_SPEED
  const activeAlpha = overlayAlphaValue(_focusUIProgress)

  const exitFinished = _hudExitStartTime > 0 && time - _hudExitStartTime >= _hudExitDuration
  if (!_lastHudStar || !_lastHudPlanet || (activeAlpha <= 0.01 && exitFinished)) {
    _focusUIProgress = 0
    hideOverlayIfNeeded(store, camera)
    return
  }

  if (_hudExitStartTime <= 0) {
    _hudExitStartTime = time
    _hudExitStartProgress = _lastHudDrawProgress
    // The focus composition itself is already gated by its per-layer
    // progress. The lifecycle alpha is still near zero during the first
    // 1.15s camera settle window, so carrying it into exit would erase a
    // valid partial reverse before it can be seen.
    _hudExitStartAlpha = 1
    _hudExitDuration = focusExitDuration(_lastHudFocusAge)
  }
  const exitProgress = clamped(time, _hudExitStartTime, _hudExitStartTime + _hudExitDuration)
  const drawProgress = _hudExitStartProgress * inverseProportionalEase(1 - exitProgress)

  renderFocusHudFrame({
    focused: true,
    // Do not let the independent UI fade hide the layer-specific reverse
    // animation. Each effect layer owns its own exit progress below.
    alpha: _hudExitStartAlpha,
    drawProgress,
    exitProgress,
    phase: 'exit',
    focusAge: _lastHudFocusAge,
    focusedPlanetIdx: _lastHudFocusedIdx,
    dayNight: store.dayNight,
    camera: cameraToHudData(camera),
    star: _lastHudStar,
    planet: _lastHudPlanet,
  })
}

function hideOverlayIfNeeded(store: ReturnType<typeof useScrollStore.getState>, camera: PerspectiveCamera): void {
  _lastHudStar = undefined
  _lastHudPlanet = undefined
  _lastHudFocusedIdx = -1
  _lastHudFocusAge = 0
  _lastHudDrawProgress = 0
  _hudExitStartTime = 0
  _hudExitStartProgress = 0
  _hudExitStartAlpha = 0
  _hudExitDuration = FOCUS_EFFECT_EXIT_DURATION
  renderFocusHudFrame({
    focused: false,
    alpha: 0,
    drawProgress: 0,
    exitProgress: 1,
    phase: 'hidden',
    focusAge: 0,
    focusedPlanetIdx: store.focusedPlanetIdx,
    dayNight: store.dayNight,
    camera: cameraToHudData(camera),
  })
  if (store.overlayData.focused || store.overlayData.alpha !== undefined) {
    store.setOverlayData({ focused: false })
  }
}

function getFocusedTrackIndex(particleIdx: number): number {
  for (let trackIdx = 0; trackIdx < ORBIT_RADII.length; trackIdx++) {
    if (readPlanetParticleIndex(trackIdx) === particleIdx) return trackIdx
  }
  return 0
}

function emitOverlayData(
  camera: PerspectiveCamera,
  planetPos: Vector3,
  store: ReturnType<typeof useScrollStore.getState>,
  activeAlpha: number,
  drawProgress: number,
  focusAge: number,
): void {
  const canvas = (camera as any).canvas || (typeof document !== 'undefined' && document.querySelector('canvas'))
  if (!canvas) return

  const w = canvas.clientWidth, h = canvas.clientHeight

  function toScreen(v3: Vector3, out: Vector3): Vector3 {
    out.copy(v3).project(camera)
    out.x = (out.x * 0.5 + 0.5) * w
    out.y = (-out.y * 0.5 + 0.5) * h
    return out
  }

  const starContour = projectSphereContour(
    camera,
    toScreen,
    _starPos,
    HUD_STAR_ATMOSPHERE_WORLD_RADIUS,
    HUD_STAR_ATMOSPHERE_CLEARANCE,
  )
  const planetContour = projectSphereContour(
    camera,
    toScreen,
    planetPos,
    readPlanetAtmosphereWorldRadius(getFocusedTrackIndex(store.focusedPlanetIdx)) ?? 0.08,
    HUD_PLANET_ATMOSPHERE_CLEARANCE,
  )
  const starEllipse = summarizeContour(starContour)
  const planetEllipse = summarizeContour(planetContour)

  const star: ScreenCircle = {
    x: starEllipse.x,
    y: starEllipse.y,
    r: Math.max(starEllipse.rx, starEllipse.ry),
    rx: starEllipse.rx,
    ry: starEllipse.ry,
    contour: starContour,
  }
  const planet: ScreenCircle = {
    x: planetEllipse.x,
    y: planetEllipse.y,
    r: Math.max(planetEllipse.rx, planetEllipse.ry),
    rx: planetEllipse.rx,
    ry: planetEllipse.ry,
    contour: planetContour,
  }

  _lastHudStar = star
  _lastHudPlanet = planet
  _lastHudFocusedIdx = store.focusedPlanetIdx
  _lastHudFocusAge = focusAge
  _lastHudDrawProgress = drawProgress

  renderFocusHudFrame({
    focused: true,
    alpha: activeAlpha,
    drawProgress,
    exitProgress: 0,
    phase: drawProgress < 0.999 ? 'reveal' : 'steady',
    focusAge,
    focusedPlanetIdx: store.focusedPlanetIdx,
    dayNight: store.dayNight,
    camera: cameraToHudData(camera),
    star,
    planet,
  })
}

function overlayAlphaValue(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

function cameraToHudData(camera: PerspectiveCamera): { pos: { x: number; y: number; z: number } } {
  return {
    pos: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
  }
}

function summarizeContour(contour: ScreenPoint[]): { x: number; y: number; rx: number; ry: number } {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of contour) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    rx: Math.max(1, (maxX - minX) * 0.5),
    ry: Math.max(1, (maxY - minY) * 0.5),
  }
}

function projectSphereContour(
  camera: PerspectiveCamera,
  toScreen: (v3: Vector3, out: Vector3) => Vector3,
  sphereWorldPos: Vector3,
  radius: number,
  screenClearance: number,
): ScreenPoint[] {
  _vCamToSphere.subVectors(camera.position, sphereWorldPos)
  const distance = _vCamToSphere.length()
  if (distance <= radius) {
    toScreen(sphereWorldPos, _ssScratch)
    return Array.from({ length: HUD_CONTOUR_SEGMENTS }, (_, idx) => {
      const angle = (idx / HUD_CONTOUR_SEGMENTS) * Math.PI * 2
      return {
        x: _ssScratch.x + Math.cos(angle) * screenClearance,
        y: _ssScratch.y + Math.sin(angle) * screenClearance,
      }
    })
  }

  _vCamToSphere.divideScalar(distance)
  _uRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
  _uRight.addScaledVector(_vCamToSphere, -_uRight.dot(_vCamToSphere)).normalize()
  _uUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
  _uUp.addScaledVector(_vCamToSphere, -_uUp.dot(_vCamToSphere)).normalize()

  const tangentDepth = (radius * radius) / distance
  const tangentRadius = Math.sqrt(Math.max(0, radius * radius - tangentDepth * tangentDepth))
  _sphereTangentCenter.copy(sphereWorldPos).addScaledVector(_vCamToSphere, tangentDepth)

  const projected = Array.from({ length: HUD_CONTOUR_SEGMENTS }, (_, idx) => {
    const angle = (idx / HUD_CONTOUR_SEGMENTS) * Math.PI * 2
    _ssScratch.copy(_sphereTangentCenter)
      .addScaledVector(_uRight, Math.cos(angle) * tangentRadius)
      .addScaledVector(_uUp, Math.sin(angle) * tangentRadius)
    toScreen(_ssScratch, _ssStarEdge)
    return { x: _ssStarEdge.x, y: _ssStarEdge.y }
  })

  return offsetScreenContour(projected, screenClearance)
}

function offsetScreenContour(points: ScreenPoint[], clearance: number): ScreenPoint[] {
  const center = points.reduce(
    (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
    { x: 0, y: 0 },
  )

  const outwardNormal = (dx: number, dy: number, midX: number, midY: number): ScreenPoint => {
    let nx = dy
    let ny = -dx
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    if ((midX - center.x) * nx + (midY - center.y) * ny < 0) {
      nx = -nx
      ny = -ny
    }
    return { x: nx, y: ny }
  }

  return points.map((point, idx) => {
    const prev = points[(idx - 1 + points.length) % points.length]
    const next = points[(idx + 1) % points.length]
    const n1 = outwardNormal(point.x - prev.x, point.y - prev.y, (point.x + prev.x) * 0.5, (point.y + prev.y) * 0.5)
    const n2 = outwardNormal(next.x - point.x, next.y - point.y, (next.x + point.x) * 0.5, (next.y + point.y) * 0.5)
    let mx = n1.x + n2.x
    let my = n1.y + n2.y
    const mLen = Math.hypot(mx, my) || 1
    mx /= mLen
    my /= mLen
    const denom = Math.max(0.35, mx * n2.x + my * n2.y)
    const distance = Math.min(clearance * 3, clearance / denom)
    return {
      x: point.x + mx * distance,
      y: point.y + my * distance,
    }
  })
}
