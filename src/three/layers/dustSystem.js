import * as THREE from 'three'
import {
  WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START,
  ORBIT_COUNT, ORBIT_RADII, SCENE_CENTER_Z,
  ELLIPSE_A, ELLIPSE_B, ELLIPSE_C, ELLIPSE_INCL
} from '../constants.js'
import {
  _dustBwo, _dustBeamDir, _dustToP, _dustPp,
  _colorAct1, _colorAct3, _colorAct2, _currentColor,
  _defaultCamPos, _occCamToPlanet, _occToParticle, _occProj,
  _dustProjectScratch
} from '../shared/reusableObjects.js'

let dustParticles = []
let _mainPlanetIndices = []
let _mainPlanetsPreFiltered = []
let _lastDustTime = -1, _lastDustSp = -1
let _hoveredIdx = -1
let _lastTimeSec = 0

export { dustParticles, _mainPlanetIndices, _mainPlanetsPreFiltered, _hoveredIdx, _lastTimeSec }

export function buildDust(ctx) {
  if (dustParticles.length > 0) return
  const count = 135

  const dustConfigs = []
  for (let i = 0; i < count; i++) {
    const scale = 0.4 + Math.random() * 0.8
    const sizeBoost = Math.random() < 0.60 ? 1.5 + Math.random() * 2.5 : 0.7 + Math.random() * 0.8
    dustConfigs.push({ scale, sizeBoost, totalSize: scale * sizeBoost })
  }

  const sorted = dustConfigs.map((c, i) => ({ idx: i, size: c.totalSize }))
    .sort((a, b) => b.size - a.size)
  _mainPlanetIndices = sorted.slice(0, ORBIT_COUNT).map(s => s.idx)

  const lowPolyGeo = new THREE.SphereGeometry(0.015, 10, 8)
  const highPolyGeo = new THREE.SphereGeometry(0.015, 32, 32)

  for (let i = 0; i < count; i++) {
    const isMain = _mainPlanetIndices.includes(i)
    const geo = isMain ? highPolyGeo : lowPolyGeo

    const gray = Math.floor(100 + Math.random() * 60)
    const grayHex = '#' + gray.toString(16).padStart(2, '0').repeat(3)

    const mat = new THREE.MeshBasicMaterial({
      color: '#f0f8ff',
      transparent: true,
      opacity: 0,
      depthWrite: isMain,
      depthTest: true
    })
    const p = new THREE.Mesh(geo, mat)

    p.renderOrder = isMain ? 1 : 2

    const t = Math.random()
    const worldOrigin = new THREE.Vector3()
    const lighthouseGroup = ctx.lighthouseGroup
    lighthouseGroup.getWorldPosition(worldOrigin)
    worldOrigin.y += 2.96 * lighthouseGroup.scale.y
    const zDist = 1 + t * 41
    const maxR = (zDist / 42) * 7.5 + 0.2
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * maxR

    p.position.set(
      worldOrigin.x + Math.cos(angle) * r,
      worldOrigin.y + (Math.random() - 0.5) * maxR * 0.6,
      worldOrigin.z + zDist
    )

    const scale = dustConfigs[i].scale
    const sizeBoost = dustConfigs[i].sizeBoost

    p.userData = {
      wx: p.position.x, wy: p.position.y, wz: p.position.z,
      dx: (Math.random() - 0.5) * 0.15, dy: (Math.random() - 0.5) * 0.1 + 0.06, dz: (Math.random() - 0.5) * 0.08,
      ph: Math.random() * Math.PI * 2, scale, sizeBoost,
      grayHex,
      orbitAngle: Math.random() * Math.PI * 2,
      isMainPlanet: isMain,
      hoverFactor: 0.0
    }

    if (isMain) {
      const trackIdx = _mainPlanetIndices.indexOf(i)
      p.userData.orbitR     = ORBIT_RADII[trackIdx]
      const isMenu = trackIdx === 3
      p.userData.orbitSpeed = isMenu ? -0.015 : (-0.04 - trackIdx * 0.015)
      p.userData._baseSpeed = p.userData.orbitSpeed
      p.userData.scaleMult  = isMenu ? 2.8 : (2.4 + trackIdx * 0.2)
      p.name = `planet_${trackIdx}`
    } else {
      p.userData.orbitR     = 2.5 + Math.random() * 4.5
      p.userData.orbitSpeed = -(0.03 + Math.random() * 0.08)
      p.userData._baseSpeed = p.userData.orbitSpeed
      p.userData.scaleMult  = 0.4 + Math.random() * 0.9
      p.userData.wobbleAmp  = 0.5 + Math.random() * 1.2
      p.userData.wobbleFreq = 0.3 + Math.random() * 0.4
    }
    p.userData.orbitTilt  = 0
    p.userData.flattenY   = 1.0

    ctx.scene.add(p)
    dustParticles.push(p)
  }
  _mainPlanetsPreFiltered = dustParticles.filter(p => p.userData.isMainPlanet)

  ctx.dustParticles = dustParticles
  ctx._mainPlanetIndices = _mainPlanetIndices
  ctx._mainPlanetsPreFiltered = _mainPlanetsPreFiltered
}

export function animateDust(time, sp, ctx) {
  if (time === _lastDustTime && sp === _lastDustSp) return
  _lastDustTime = time
  _lastDustSp = sp

  if (dustParticles.length === 0 || !ctx.camera) return

  const camera = ctx.camera
  const _mouseNDC = ctx._mouseNDC || { x: 999, y: 999 }
  const _focusedPlanetIdx = ctx._focusedPlanetIdx !== undefined ? ctx._focusedPlanetIdx : -1
  const canvasRef = ctx.canvasRef

  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothProgress3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const isFullyFormed3 = act3Progress >= 0.95

  if (sp < WHITE_OUT_END && ctx.beamPivot) {
    ctx.beamPivot.getWorldPosition(_dustBwo)
    _dustBeamDir.set(0, 0, 1).applyQuaternion(ctx.beamPivot.quaternion).normalize()
  }

  let bestDist = 1e9, bestIdx = -1

  if (isFullyFormed3) {
    for (let i = 0; i < dustParticles.length; i++) {
      const p = dustParticles[i]
      const d = p.userData
      if (!d.isMainPlanet) continue

      _dustProjectScratch.copy(p.position).project(camera)
      const dx = (_dustProjectScratch.x - _mouseNDC.x) * (camera.aspect || 1)
      const dy = _dustProjectScratch.y - _mouseNDC.y
      const dist = Math.hypot(dx, dy)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    const exitThreshold = (_hoveredIdx >= 0) ? 0.22 : 0.16
    _hoveredIdx = bestDist < exitThreshold ? bestIdx : -1
  } else {
    _hoveredIdx = -1
  }

  if (canvasRef) {
    canvasRef.style.cursor = (_hoveredIdx >= 0) ? 'pointer' : ''
  }

  if (_lastTimeSec === 0) _lastTimeSec = time
  const dt = Math.min(0.1, time - _lastTimeSec)
  _lastTimeSec = time

  const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z

  for (let idx = 0; idx < dustParticles.length; idx++) {
    const p = dustParticles[idx]
    const d = p.userData

    const targetHover = (idx === _hoveredIdx && isFullyFormed3) ? 1.0 : 0.0
    d.hoverFactor = d.hoverFactor ?? 0.0
    d.hoverFactor += (targetHover - d.hoverFactor) * 0.10

    const bx = d.wx + Math.sin(time * 0.4 + d.ph) * 0.25
    const by = d.wy + Math.sin(time * 0.3 + d.ph + 1) * 0.18
    const bz = d.wz + Math.sin(time * 0.25 + d.ph + 2) * 0.15

    const focusSlowdown = (!d.isMainPlanet && _focusedPlanetIdx >= 0) ? 0.05 : 1.0
    const effectiveSpeed = d._baseSpeed * (1.0 - d.hoverFactor * 0.80) * focusSlowdown
    d.orbitAngle += dt * effectiveSpeed

    const wobbleR = d.isMainPlanet ? d.orbitR : d.orbitR + Math.sin(time * d.wobbleFreq + d.ph) * d.wobbleAmp
    let ox, oy, oz
    if (d.isMainPlanet && d.orbitR > 20) {
      const a = ELLIPSE_A, b = ELLIPSE_B, c = ELLIPSE_C
      const ex = a * Math.cos(d.orbitAngle) - c
      const ez = b * Math.sin(d.orbitAngle)
      ox = cx + ex
      oy = cy + ez * Math.sin(ELLIPSE_INCL)
      oz = cz + ez * Math.cos(ELLIPSE_INCL)
    } else {
      ox = cx + Math.cos(d.orbitAngle) * wobbleR
      oy = cy
      oz = cz + Math.sin(d.orbitAngle) * wobbleR
    }

    p.position.set(
      THREE.MathUtils.lerp(bx, ox, smoothProgress3),
      THREE.MathUtils.lerp(by, oy, smoothProgress3),
      THREE.MathUtils.lerp(bz, oz, smoothProgress3)
    )

    const refPos = d.isMainPlanet ? camera.position : _defaultCamPos
    const cd = p.position.distanceTo(refPos)
    const ds = 22 / Math.max(5, cd)

    let bf = 0
    if (sp < WHITE_OUT_END && ctx.beamPivot) {
      _dustToP.subVectors(p.position, _dustBwo)
      const proj = _dustToP.dot(_dustBeamDir)
      if (proj > 0 && proj < 45) {
        _dustPp.copy(_dustBwo).addScaledVector(_dustBeamDir, proj)
        const dist = p.position.distanceTo(_dustPp)
        const br = (proj / 45) * 5.5 + 0.2
        if (dist < br) bf = Math.pow(1 - dist / br, 1.8)
      }
    }

    const scaleAct1 = d.scale * (0.4 + bf * 2) * ds
    const scaleAct2 = d.scale * 0.7 * d.sizeBoost * ds
    const scaleAct3 = scaleAct2 * d.scaleMult

    let currentScale = THREE.MathUtils.lerp(scaleAct1, scaleAct2, wof)
    currentScale = THREE.MathUtils.lerp(currentScale, scaleAct3, smoothProgress3)

    p.scale.setScalar(currentScale * (1.0 + d.hoverFactor * 0.35))

    let opacityAct1 = (0.14 + bf * 0.76) * (0.35 + sp * 0.65)
    if (cd < 7) opacityAct1 *= Math.max(0, (cd - 2.5) / 4.5)
    if (cd > 42) opacityAct1 *= Math.max(0, 1 - (cd - 42) / 10)

    const opacityAct2 = 0.4
    const opacityAct3 = d.isMainPlanet ? 1.0 : 0.55

    let currentOpacity = THREE.MathUtils.lerp(opacityAct1, opacityAct2, wof)
    p.material.opacity = THREE.MathUtils.lerp(currentOpacity, opacityAct3, smoothProgress3)

    if (_focusedPlanetIdx >= 0 && idx !== _focusedPlanetIdx) {
      const fp = dustParticles[_focusedPlanetIdx]
      _occCamToPlanet.subVectors(fp.position, camera.position).normalize()
      _occToParticle.subVectors(p.position, camera.position)
      const projDist = _occToParticle.dot(_occCamToPlanet)
      const fpDist = fp.position.distanceTo(camera.position)
      if (projDist > 0.5 && projDist < fpDist - 0.3) {
        _occProj.copy(camera.position).addScaledVector(_occCamToPlanet, projDist)
        const perpDist = p.position.distanceTo(_occProj)
        const occRadius = currentScale * 0.6 + 0.06
        if (perpDist < occRadius) {
          p.material.opacity *= 0.12
        }
      }
    }

    _colorAct2.set(d.grayHex)
    _currentColor.copy(_colorAct1).lerp(_colorAct2, wof).lerp(_colorAct3, smoothProgress3)
    p.material.color.copy(_currentColor)
  }
}

export function disposeDust(ctx) {
  for (const p of dustParticles) {
    p.geometry.dispose()
    p.material.dispose()
    ctx.scene.remove(p)
  }
  dustParticles = []
  _mainPlanetIndices = []
  _mainPlanetsPreFiltered = []
}
