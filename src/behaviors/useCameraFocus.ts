import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, Quaternion, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { SCENE_CENTER_Z, GRID_SHIFT_START, FOCUS_TIMEOUT, smoothstep, clamped } from '../r3f/ScrollRig'
import type { OverlayData } from '../types'

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
const _ssStar = new Vector3()
const _ssPlanet = new Vector3()
const _ssStarEdge = new Vector3()
const _ssScratch = new Vector3()

let _focusOrbitAngle = 0

/**
 * 相机聚焦系统 — 双层平滑 + 轨道绕行 + 30s 自动取消。
 *
 * 原 updateCameraFocus():776-913，逐字保留算法。
 *
 * 用于 Act3ContentPhase 或 DustField 的 useFrame 中调用。
 *
 * 援引：Target-Lerp 模式（Three.js 社区通用）
 */
export function updateCameraFocus(
  camera: PerspectiveCamera,
  sp: number,
  time: number,
  getPlanetPosition: (idx: number) => Vector3 | null,
): void {
  const isAct3 = sp >= GRID_SHIFT_START
  const store = useScrollStore.getState()

  if (!isAct3) {
    if (store.focusedPlanetIdx >= 0) {
      store.clearFocus()
    }
    // Lerp back to default
    _targetCamPos.lerp(_defaultCamPos, 0.04)
    _targetLookAt.lerp(_defaultLookAt, 0.04)
    _currentLookAt.lerp(_targetLookAt, 0.06)
    camera.position.lerp(_targetCamPos, 0.06)
    camera.lookAt(_currentLookAt)
    return
  }

  const focusedIdx = store.focusedPlanetIdx
  const planet = focusedIdx >= 0 ? getPlanetPosition(focusedIdx) : null

  // Auto-unfocus after timeout
  if (planet && store.focusStartTime > 0 && time - store.focusStartTime > FOCUS_TIMEOUT) {
    store.clearFocus()
    // Fall through to unfocused path...
  }

  const isFocused = store.focusedPlanetIdx >= 0 && !!getPlanetPosition(store.focusedPlanetIdx)

  if (isFocused && planet) {
    _camToStar.subVectors(_starPos, planet).normalize()
    _camLeftDir.crossVectors(_camUp, _camToStar).normalize()

    const behindDist = 2.5
    const sideDist = 2.2

    _focusAxisPoint.copy(planet).addScaledVector(_camToStar, 3.6 * 0.25)

    _focusOrbitAngle += 0.024 * 0.016 // ~same rate as original per-frame at 60fps
    _focusOrbitQuat.setFromAxisAngle(_camToStar, _focusOrbitAngle)

    _camOffsetDir.copy(planet)
      .addScaledVector(_camToStar, -behindDist)
      .addScaledVector(_camLeftDir, sideDist)
    _focusBaseOffset.subVectors(_camOffsetDir, _focusAxisPoint)
    _focusBaseOffset.applyQuaternion(_focusOrbitQuat)
    _camOffsetDir.copy(_focusAxisPoint).add(_focusBaseOffset)

    _targetCamPos.lerp(_camOffsetDir, 0.04)
    _targetLookAt.lerp(_focusAxisPoint, 0.04)

    // Emit overlay data (screen-space circles + tangents)
    emitOverlayData(camera, planet, store)
  } else {
    _targetCamPos.lerp(_defaultCamPos, 0.04)
    _targetLookAt.lerp(_defaultLookAt, 0.04)
    store.setOverlayData({ focused: false })
  }

  // Camera follows smoothed target
  _currentLookAt.lerp(_targetLookAt, 0.06)
  camera.position.lerp(_targetCamPos, 0.06)
  camera.lookAt(_currentLookAt)
}

function emitOverlayData(camera: PerspectiveCamera, planetPos: Vector3, store: ReturnType<typeof useScrollStore.getState>): void {
  const canvas = (camera as any).canvas || (typeof document !== 'undefined' && document.querySelector('canvas'))
  if (!canvas) return

  const w = canvas.clientWidth, h = canvas.clientHeight

  function toScreen(v3: Vector3, out: Vector3): Vector3 {
    out.copy(v3).project(camera)
    out.x = (out.x * 0.5 + 0.5) * w
    out.y = (-out.y * 0.5 + 0.5) * h
    return out
  }

  // Star
  toScreen(_starPos, _ssStar)
  _ssScratch.set(1, 0, 0).applyQuaternion(camera.quaternion)
  _ssStarEdge.copy(_starPos).addScaledVector(_ssScratch, 0.42)
  toScreen(_ssStarEdge, _ssStarEdge)
  const starSR = Math.hypot(_ssStarEdge.x - _ssStar.x, _ssStarEdge.y - _ssStar.y)

  // Planet
  toScreen(planetPos, _ssPlanet)
  _ssStarEdge.copy(planetPos).addScaledVector(_ssScratch, 0.15 * 2.4)
  toScreen(_ssStarEdge, _ssStarEdge)
  const planetSR = Math.hypot(_ssStarEdge.x - _ssPlanet.x, _ssStarEdge.y - _ssPlanet.y)

  // Outer tangents
  const dx = _ssPlanet.x - _ssStar.x
  const dy = _ssPlanet.y - _ssStar.y
  const dist = Math.hypot(dx, dy)
  const theta = Math.atan2(dy, dx)
  const dr = starSR - planetSR
  const phi = dist > Math.abs(dr) ? Math.asin(dr / dist) : 0

  const alpha1 = theta + Math.PI / 2 + phi
  const alpha2 = theta + Math.PI / 2 - phi

  const ts1x = _ssStar.x + starSR * Math.cos(alpha1)
  const ts1y = _ssStar.y + starSR * Math.sin(alpha1)
  const tp1x = _ssPlanet.x + planetSR * Math.cos(alpha1)
  const tp1y = _ssPlanet.y + planetSR * Math.sin(alpha1)
  const ts2x = _ssStar.x + starSR * Math.cos(alpha2)
  const ts2y = _ssStar.y + starSR * Math.sin(alpha2)
  const tp2x = _ssPlanet.x + planetSR * Math.cos(alpha2)
  const tp2y = _ssPlanet.y + planetSR * Math.sin(alpha2)

  const extLen = Math.max(dist * 0.5, 150)
  const tdx1 = tp1x - ts1x; const tdy1 = tp1y - ts1y
  const tl1 = Math.hypot(tdx1, tdy1) || 1
  const tdx2 = tp2x - ts2x; const tdy2 = tp2y - ts2y
  const tl2 = Math.hypot(tdx2, tdy2) || 1

  store.setOverlayData({
    focused: true,
    star:   { x: _ssStar.x,   y: _ssStar.y,   r: Math.max(starSR, 8) },
    planet: { x: _ssPlanet.x, y: _ssPlanet.y, r: Math.max(planetSR, 6) },
    tangents: [
      { x1: ts1x - (tdx1 / tl1) * extLen, y1: ts1y - (tdy1 / tl1) * extLen,
        x2: tp1x + (tdx1 / tl1) * extLen, y2: tp1y + (tdy1 / tl1) * extLen },
      { x1: ts2x - (tdx2 / tl2) * extLen, y1: ts2y - (tdy2 / tl2) * extLen,
        x2: tp2x + (tdx2 / tl2) * extLen, y2: tp2y + (tdy2 / tl2) * extLen },
    ],
  })
}
