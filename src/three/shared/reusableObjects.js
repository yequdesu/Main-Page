import * as THREE from 'three'
import { SCENE_CENTER_Z, BG_BASE, BG_TARGET } from '../constants.js'

// ---- act1 beam highlight ----
export const _waveBeamOrigin = new THREE.Vector3()
export const _waveBeamDir = new THREE.Vector3()
export const _targetCol = new THREE.Color('#94a3b8')

// ---- dust system ----
export const _dustBwo = new THREE.Vector3()
export const _dustBeamDir = new THREE.Vector3()
export const _dustToP = new THREE.Vector3()
export const _dustPp = new THREE.Vector3()
export const _colorAct1 = new THREE.Color('#f0f8ff')
export const _colorAct3 = new THREE.Color('#64748b')
export const _colorAct2 = new THREE.Color()
export const _currentColor = new THREE.Color()

// ---- click NDC ----
export const _clickNDC = new THREE.Vector2()

// ---- camera-focus system ----
export const _defaultCamPos = new THREE.Vector3(0, 0.25, 8)
export const _defaultLookAt = new THREE.Vector3(0, -0.65, -24)
export const _targetCamPos = new THREE.Vector3(0, 0.25, 8)
export const _targetLookAt = new THREE.Vector3(0, -0.65, -24)
export const _currentLookAt = new THREE.Vector3(0, -0.65, -24)
export const _camOffsetDir = new THREE.Vector3()
export const _camToStar = new THREE.Vector3()
export const _camLeftDir = new THREE.Vector3()
export const _camUp = new THREE.Vector3(0, 1, 0)
export const _starPos = new THREE.Vector3(0, -1.0, SCENE_CENTER_Z)
export const _occCamToPlanet = new THREE.Vector3()
export const _occToParticle = new THREE.Vector3()
export const _occProj = new THREE.Vector3()
export const _focusAxisPoint = new THREE.Vector3()
export const _focusBaseOffset = new THREE.Vector3()
export const _focusOrbitQuat = new THREE.Quaternion()

// ---- orbit ring vertex depth ----
export const _orbitNearCol = new THREE.Color('#475569')
export const _orbitFarCol  = new THREE.Color('#f1f5f9')
export const _orbitTempCol = new THREE.Color()
export const _orbitTempV   = new THREE.Vector3()

// ---- screen-space overlay ----
export const _ssStar = new THREE.Vector3()
export const _ssPlanet = new THREE.Vector3()
export const _ssStarEdge = new THREE.Vector3()
export const _ssScratch = new THREE.Vector3()

// ---- precise projection tangent (overlay & invert canvas) ----
export const _vCamToPlanet = new THREE.Vector3()
export const _uRight = new THREE.Vector3()
export const _uUp = new THREE.Vector3()
export const _sTangent = new THREE.Vector3()
export const _tRight = new THREE.Vector3()
export const _tLeft = new THREE.Vector3()
export const _tTop = new THREE.Vector3()
export const _tBottom = new THREE.Vector3()
export const _ssTRight = new THREE.Vector3()
export const _ssTLeft = new THREE.Vector3()
export const _ssTTop = new THREE.Vector3()
export const _ssTBottom = new THREE.Vector3()
export const _planetWorldPos = new THREE.Vector3()

// ---- background lerp ----
export const _bgBaseColor = new THREE.Color(BG_BASE)
export const _bgTargetColor = new THREE.Color(BG_TARGET)
export const _bgLerpColor = new THREE.Color()

// ---- dust projection scratch ----
export const _dustProjectScratch = new THREE.Vector3()
