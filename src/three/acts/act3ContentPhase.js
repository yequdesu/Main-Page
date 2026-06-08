import * as THREE from 'three'
import {
  TEXT_START, GRID_SHIFT_START, ORBIT_COUNT, ORBIT_RADII,
  ELLIPSE_A, ELLIPSE_B, ELLIPSE_C, ELLIPSE_INCL, SCENE_CENTER_Z
} from '../constants.js'
import {
  _orbitNearCol, _orbitFarCol, _orbitTempCol, _orbitTempV, _ssScratch
} from '../shared/reusableObjects.js'

let act3Initialized = false

let _orbitLines = []
let _gyroGroups = []
let _planetLabels = []
let _starGroup = null
let _starGlow = null
let _wedgeRings = []
let _labelOpacityCurrent = 0
let _raycaster = null

const _planetLinks = [
  { label: 'FS',     accent: '#94a3b8', url: 'https://fs.yequdesu.top' },
  { label: 'Code',   accent: '#0ea5e9', url: 'https://code.yequdesu.top' },
  { label: 'GitHub', accent: '#818cf8', url: 'https://github.com/yequdesu' },
  { label: 'Menu',   accent: '#64748b', url: null },
]

function createPlanetLabel(text, accentColor) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = 128
  const ctx = canvas.getContext('2d')

  ctx.font = '500 40px "Georgia", "Times New Roman", serif'
  const tw = ctx.measureText(text).width
  const padX = 28, padY = 16
  const pillW = Math.max(100, tw + padX * 2)
  const pillH = 56
  const pillX = (size - pillW) / 2
  const pillY = (128 - pillH) / 2
  const pillR = 10

  ctx.beginPath()
  ctx.moveTo(pillX + pillR, pillY)
  ctx.lineTo(pillX + pillW - pillR, pillY)
  ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR, pillR)
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR)
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH, pillR)
  ctx.lineTo(pillX + pillR, pillY + pillH)
  ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR, pillR)
  ctx.lineTo(pillX, pillY + pillR)
  ctx.arcTo(pillX, pillY, pillX + pillR, pillY, pillR)
  ctx.closePath()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#f1f5f9'
  ctx.font = '500 38px "Georgia", "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, 128 / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter

  const spriteMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.scale.set(1.8, 0.45, 1)
  sprite.renderOrder = 9999
  return sprite
}

function build(ctx) {
  if (act3Initialized) return

  // Orbit lines
  for (let t = 0; t < ORBIT_COUNT; t++) {
    const pts = []
    if (t === 3) {
      for (let i = 0; i <= 200; i++) {
        const theta = (i / 200) * Math.PI * 2
        const ex = ELLIPSE_A * Math.cos(theta) - ELLIPSE_C
        const ez = ELLIPSE_B * Math.sin(theta)
        const ey = ez * Math.sin(ELLIPSE_INCL)
        const ez2 = ez * Math.cos(ELLIPSE_INCL)
        pts.push(new THREE.Vector3(ex, ey, ez2))
      }
    } else {
      const r = ORBIT_RADII[t]
      for (let i = 0; i <= 128; i++) {
        const theta = (i / 128) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r))
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const colors = new Float32Array(pts.length * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const isElliptical = t === 3
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true, opacity: 0, depthWrite: false, depthTest: true
    })
    const line = new THREE.Line(geo, mat)
    line.userData.isElliptical = isElliptical
    line.position.set(0, -1.0, SCENE_CENTER_Z)
    line.renderOrder = 2
    ctx.scene.add(line)
    _orbitLines.push(line)
  }

  // Gyroscope rings
  const gyroRadii = [7.8, 9.4, 11.0]
  const gyroTilts = [
    { x: Math.PI / 2 + 0.25, z: 0.35 },
    { x: Math.PI / 2 - 0.30, z: -0.40 },
    { x: Math.PI / 2 + 0.55, z: 0.15 },
  ]
  for (let g = 0; g < 3; g++) {
    const r = gyroRadii[g]
    const ringGeo = new THREE.RingGeometry(r - 0.04, r, 96)
    ringGeo.rotateX(gyroTilts[g].x)
    ringGeo.rotateZ(gyroTilts[g].z)
    const ringColors = new Float32Array(ringGeo.attributes.position.count * 3)
    ringGeo.setAttribute('color', new THREE.BufferAttribute(ringColors, 3))
    const ringMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, depthTest: true })
    const ring = new THREE.LineLoop(ringGeo, ringMat)
    const group = new THREE.Group()
    group.add(ring)
    group.position.set(0, -1.0, SCENE_CENTER_Z)
    group.userData = { rotSpeed: 0.08 + g * 0.05 }
    ring.renderOrder = 2
    group.renderOrder = 2
    ctx.scene.add(group)
    _gyroGroups.push(group)
  }

  // Star
  _starGroup = new THREE.Group()
  _starGroup.position.set(0, -1.0, SCENE_CENTER_Z)
  _starGroup.renderOrder = 1

  const coreGeo = new THREE.SphereGeometry(0.42, 32, 32)
  const coreMat = new THREE.MeshBasicMaterial({ color: '#fff8e7', transparent: true, opacity: 0 })
  const core = new THREE.Mesh(coreGeo, coreMat)
  _starGroup.add(core)

  const glowGeo = new THREE.SphereGeometry(0.70, 32, 32)
  const glowMat = new THREE.MeshBasicMaterial({
    color: '#ffe8c0',
    transparent: true,
    opacity: 0.30,
    depthWrite: false
  })
  _starGlow = new THREE.Mesh(glowGeo, glowMat)
  _starGroup.add(_starGlow)

  const haloSprite = (() => {
    const size = 128
    const c = document.createElement('canvas')
    c.width = c.height = size
    const cCtx = c.getContext('2d')
    const gradient = cCtx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
    gradient.addColorStop(0, 'rgba(255,240,210,0.6)')
    gradient.addColorStop(0.15, 'rgba(255,220,170,0.35)')
    gradient.addColorStop(0.4, 'rgba(255,180,100,0.08)')
    gradient.addColorStop(0.7, 'rgba(255,140,60,0.01)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    cCtx.fillStyle = gradient
    cCtx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true
    }))
    sprite.scale.set(5.5, 5.5, 1)
    sprite.renderOrder = 1
    return sprite
  })()
  _starGroup.add(haloSprite)
  _starGroup.userData = { haloSprite }

  ctx.scene.add(_starGroup)

  // Wedge rings
  const outerSectors = 240
  const outerMidR = 82.5
  const outerWidth = 9.0
  const outerArcLen = outerMidR * (Math.PI * 2) / outerSectors
  const wedgeWidth = outerArcLen * 0.5
  const outerTiltX = 0.55, outerTiltZ = -0.65, outerRotSpeed = 0.04
  const wedgeGeo = new THREE.PlaneGeometry(wedgeWidth, outerWidth)

  const wedgeMatTemplate = new THREE.MeshBasicMaterial({
    color: '#000000',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    depthTest: true,
    fog: false
  })

  const outerRingGroup = new THREE.Group()
  outerRingGroup.position.copy(_starGroup.position)
  outerRingGroup.rotation.x = outerTiltX
  outerRingGroup.rotation.z = outerTiltZ
  outerRingGroup.renderOrder = 1
  ctx.scene.add(outerRingGroup)

  const outerWedgeGroups = []
  const phaseDelta = (Math.PI * 2) / outerSectors
  for (let i = 0; i < outerSectors; i++) {
    const angle = (i / outerSectors) * Math.PI * 2
    const wg = new THREE.Group()
    wg.position.set(Math.cos(angle) * outerMidR, 0, Math.sin(angle) * outerMidR)
    wg.rotation.y = -angle + Math.PI / 2

    const wMat = wedgeMatTemplate.clone()
    const wMesh = new THREE.Mesh(wedgeGeo, wMat)
    wMesh.renderOrder = 1
    wg.add(wMesh)
    outerRingGroup.add(wg)
    outerWedgeGroups.push({ group: wg, mesh: wMesh, phase: i * phaseDelta * 3.0 })
  }
  _wedgeRings.push({ isIndividual: true, outerRingGroup, outerWedgeGroups, rotSpeed: outerRotSpeed, tiltX: outerTiltX, tiltZ: outerTiltZ })

  // Planet labels
  for (let t = 0; t < ORBIT_COUNT; t++) {
    const link = _planetLinks[t]
    const sprite = createPlanetLabel(link.label, link.accent)
    sprite.position.set(0, -1.0, SCENE_CENTER_Z)
    sprite.name = `planetLabel_${t}`
    ctx.scene.add(sprite)
    _planetLabels.push(sprite)
  }

  _raycaster = new THREE.Raycaster()
  _raycaster.params.Points.threshold = 0
  _raycaster.params.Line = undefined

  // Write to ctx
  ctx._orbitLines = _orbitLines
  ctx._gyroGroups = _gyroGroups
  ctx._starGroup = _starGroup
  ctx._starGlow = _starGlow
  ctx._wedgeRings = _wedgeRings
  ctx._planetLabels = _planetLabels
  ctx._planetLinks = _planetLinks
  ctx._raycaster = _raycaster

  act3Initialized = true
}

function animate(time, tSp, sp, ctx) {
  const focusUI = ctx._focusUIProgress || 0

  // Star and wedge: fade in during TEXT_START → GRID_SHIFT_START
  const starWedgeProgress = Math.max(0, Math.min(1, (sp - TEXT_START) / (GRID_SHIFT_START - TEXT_START)))
  const smoothStarWedge = starWedgeProgress * starWedgeProgress * (3 - 2 * starWedgeProgress)

  // Orbits and focus: fade in during GRID_SHIFT_START → 1.0
  const orbitFocusProgress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothOrbitFocus = orbitFocusProgress * orbitFocusProgress * (3 - 2 * orbitFocusProgress)

  const camera = ctx.camera

  // Orbit lines
  for (const line of _orbitLines) {
    line.visible = sp >= GRID_SHIFT_START
    const isElliptical = line.userData.isElliptical
    const baseOpacity = isElliptical ? 0.55 : 0.35
    const focusBoost = baseOpacity + focusUI * 0.45
    line.material.opacity = smoothOrbitFocus * focusBoost
    if (line.visible && line.geometry.attributes.color) {
      const pa = line.geometry.attributes.position
      const ca = line.geometry.attributes.color
      const pArr = pa.array; const cArr = ca.array
      for (let i = 0; i < pArr.length / 3; i++) {
        const idx = i * 3
        _orbitTempV.set(pArr[idx], pArr[idx+1], pArr[idx+2]).applyMatrix4(line.matrixWorld)
        const dist = _orbitTempV.distanceTo(camera.position)
        const tDist = Math.max(0, Math.min(1, (dist - 10) / 32.0))
        _orbitTempCol.copy(_orbitNearCol).lerp(_orbitFarCol, tDist * 0.82)
        cArr[idx]=_orbitTempCol.r; cArr[idx+1]=_orbitTempCol.g; cArr[idx+2]=_orbitTempCol.b
      }
      ca.needsUpdate = true
    }
  }

  // Gyro rings
  for (const g of _gyroGroups) {
    g.visible = sp >= GRID_SHIFT_START
    g.rotation.y = time * g.userData.rotSpeed * 0.96
    const ring = g.children[0]
    if (ring) {
      ring.material.opacity = smoothOrbitFocus * 0.28
      if (ring.visible && ring.geometry.attributes.color) {
        const pa = ring.geometry.attributes.position
        const ca = ring.geometry.attributes.color
        const pArr = pa.array; const cArr = ca.array
        for (let i = 0; i < pArr.length / 3; i++) {
          const idx = i * 3
          _orbitTempV.set(pArr[idx], pArr[idx+1], pArr[idx+2]).applyMatrix4(ring.matrixWorld)
          const dist = _orbitTempV.distanceTo(camera.position)
          const tDist = Math.max(0, Math.min(1, (dist - 10) / 32.0))
          _orbitTempCol.copy(_orbitNearCol).lerp(_orbitFarCol, tDist * 0.82)
          cArr[idx]=_orbitTempCol.r; cArr[idx+1]=_orbitTempCol.g; cArr[idx+2]=_orbitTempCol.b
        }
        ca.needsUpdate = true
      }
    }
  }

  // Star
  if (_starGroup) {
    _starGroup.visible = true
    const pulse = 1 + Math.sin(time * 0.18) * 0.06 + Math.sin(time * 0.33) * 0.04

    const coreMesh = _starGroup.children[0]
    if (coreMesh && coreMesh.material) {
      coreMesh.material.opacity = smoothStarWedge
    }

    if (_starGlow) {
      _starGlow.material.opacity = smoothStarWedge * 0.30 * pulse
      _starGlow.scale.setScalar(pulse)
    }
    if (_starGroup.userData.haloSprite) {
      _starGroup.userData.haloSprite.material.opacity = smoothStarWedge * 0.55 * pulse
    }
  }

  // Wedge rings
  const gentlerStarWedge = Math.pow(smoothStarWedge, 2.5)
  const ringOpacity = gentlerStarWedge * 0.85
  for (let ri = 0; ri < _wedgeRings.length; ri++) {
    const rd = _wedgeRings[ri]
    if (rd.isIndividual) {
      rd.outerRingGroup.visible = true
      rd.outerRingGroup.position.copy(_starGroup.position)
      rd.outerRingGroup.rotation.set(rd.tiltX, time * rd.rotSpeed, rd.tiltZ)

      for (const wg of rd.outerWedgeGroups) {
        _ssScratch.setFromMatrixPosition(wg.group.matrixWorld)
        _ssScratch.project(camera)
        const screenDist = Math.hypot(_ssScratch.x, _ssScratch.y)
        const normDist = Math.min(1.2, screenDist)
        const lensFade = Math.max(0, Math.min(1, Math.pow(normDist / 1.1, 2.5)))
        const finalAlpha = ringOpacity * lensFade
        wg.mesh.material.color.setRGB(finalAlpha, finalAlpha, finalAlpha)
        wg.mesh.material.opacity = finalAlpha
        wg.group.rotation.z = time * 0.15 + wg.phase
      }
    } else {
      rd.mesh.visible = true
      rd.mesh.position.copy(_starGroup.position)
      rd.mesh.rotation.set(rd.tiltX, time * rd.rotSpeed, rd.tiltZ)
      rd.mesh.material.color.setRGB(ringOpacity, ringOpacity, ringOpacity)
      rd.mesh.material.opacity = ringOpacity
    }
  }

  // Planet labels
  const isFocused = ctx._focusedPlanetIdx >= 0
  const targetLabelOpacity = isFocused ? 0 : smoothOrbitFocus * 0.82
  _labelOpacityCurrent += (targetLabelOpacity - _labelOpacityCurrent) * 0.12
  const mainPlanets = ctx._mainPlanetsPreFiltered || []
  mainPlanets.sort((a, b) =>
    (ctx._mainPlanetIndices || []).indexOf((ctx.dustParticles || []).indexOf(a)) -
    (ctx._mainPlanetIndices || []).indexOf((ctx.dustParticles || []).indexOf(b))
  )
  for (let t = 0; t < _planetLabels.length && t < mainPlanets.length; t++) {
    const label = _planetLabels[t]
    const planet = mainPlanets[t]
    label.visible = sp >= GRID_SHIFT_START
    label.position.copy(planet.position)
    label.position.y += 0.45
    label.material.opacity = _labelOpacityCurrent
  }
}

function exit(ctx) {
  for (const line of _orbitLines) { line.visible = false; line.material.opacity = 0 }
  for (const g of _gyroGroups) { g.visible = false; if (g.children[0]) g.children[0].material.opacity = 0 }
  for (const label of _planetLabels) { label.visible = false; label.material.opacity = 0 }
  for (const rd of _wedgeRings) {
    if (rd.isIndividual) rd.outerRingGroup.visible = false
    else rd.mesh.visible = false
  }
  if (_starGroup) {
    _starGroup.visible = false
    const coreMesh = _starGroup.children[0]
    if (coreMesh && coreMesh.material) coreMesh.material.opacity = 0
    if (_starGlow) _starGlow.material.opacity = 0
    if (_starGroup.userData.haloSprite) _starGroup.userData.haloSprite.material.opacity = 0
  }
  if (ctx._focusedPlanetIdx >= 0) {
    ctx._focusedPlanetIdx = -1
    ctx._focusStartTime = 0
    ctx.emit?.('focusChange', false)
  }
}

function dispose(ctx) {
  for (const line of _orbitLines) {
    line.geometry.dispose()
    line.material.dispose()
  }
  _orbitLines = []

  for (const g of _gyroGroups) {
    g.traverse(c => {
      if (c.geometry) c.geometry.dispose()
      if (c.material) c.material.dispose()
    })
  }
  _gyroGroups = []

  for (const sprite of _planetLabels) {
    sprite.material.map.dispose()
    sprite.material.dispose()
  }
  _planetLabels = []

  for (const rd of _wedgeRings) {
    if (rd.isIndividual) {
      for (const wg of rd.outerWedgeGroups) { wg.mesh.material.dispose() }
      if (rd.outerWedgeGroups.length > 0) rd.outerWedgeGroups[0].mesh.geometry.dispose()
      ctx.scene.remove(rd.outerRingGroup)
    } else {
      ctx.scene.remove(rd.mesh)
      rd.mesh.geometry.dispose()
      if (rd.mesh.material.map) rd.mesh.material.map.dispose()
      rd.mesh.material.dispose()
    }
  }
  _wedgeRings = []

  if (_starGroup) {
    _starGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose()
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose())
        else c.material.dispose()
      }
    })
    _starGroup = null
    _starGlow = null
  }

  _raycaster = null
  act3Initialized = false
}

export const act3 = { name: 'ContentPhase', start: TEXT_START, end: 1.00, build, animate, exit, dispose }
