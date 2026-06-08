import * as THREE from 'three'
import { GRID_SHIFT_START, SCENE_CENTER_Z } from '../constants.js'
import {
  _defaultCamPos, _defaultLookAt, _targetCamPos, _targetLookAt,
  _currentLookAt, _camOffsetDir, _camToStar, _camLeftDir,
  _camUp, _starPos, _focusAxisPoint, _focusBaseOffset,
  _focusOrbitQuat, _vCamToPlanet, _uRight, _uUp, _sTangent,
  _tRight, _tLeft, _tTop, _tBottom,
  _ssTRight, _ssTLeft, _ssTTop, _ssTBottom,
  _planetWorldPos, _ssStar, _ssPlanet, _ssScratch
} from '../shared/reusableObjects.js'

const FOCUS_TIMEOUT = 30

// Temporal smoothing state (module-local)
let _smoothStarX = 0, _smoothStarY = 0, _smoothStarRX = 0, _smoothStarRY = 0
let _smoothPlanetX = 0, _smoothPlanetY = 0, _smoothPlanetRX = 0, _smoothPlanetRY = 0
let _smoothInvertInit = false
let _lastFocusTarget = -1
const _focusDepartPos = new THREE.Vector3()

export function updateOverlayCanvas(sp, time, ctx) {
  const isAct3 = sp >= GRID_SHIFT_START
  const _focusedPlanetIdx = ctx._focusedPlanetIdx
  const camera = ctx.camera
  const renderer = ctx.renderer

  if (!isAct3) {
    if (_focusedPlanetIdx >= 0) {
      ctx._focusedPlanetIdx = -1
      ctx._focusStartTime = 0
      ctx.emit?.('focusChange', false)
    }
    return
  }

  const focusedPlanet = (_focusedPlanetIdx >= 0) ? ctx.dustParticles[_focusedPlanetIdx] : null

  if (focusedPlanet && ctx._focusStartTime > 0 && time - ctx._focusStartTime > FOCUS_TIMEOUT) {
    ctx._focusedPlanetIdx = -1
    ctx._focusStartTime = 0
    ctx.emit?.('focusChange', false)
  }

  const isFocused = ctx._focusedPlanetIdx >= 0
  const planet = isFocused ? ctx.dustParticles[ctx._focusedPlanetIdx] : null

  if (planet && planet.userData.isMainPlanet) {
    _camToStar.subVectors(_starPos, planet.position).normalize()
    _camLeftDir.crossVectors(_camUp, _camToStar).normalize()

    const isMenu = (planet.userData.orbitR || 0) > 20
    const behindDist = isMenu ? 3.2 : 2.5
    const sideDist = isMenu ? 2.8 : 2.2
    const orbitR = planet.userData.orbitR || 4.5

    _focusAxisPoint.copy(planet.position)
      .addScaledVector(_camToStar, orbitR * 0.25)

    ctx._focusOrbitAngle = (time - ctx._focusStartTime) * 0.024
    _focusOrbitQuat.setFromAxisAngle(_camToStar, ctx._focusOrbitAngle)

    _camOffsetDir.copy(planet.position)
      .addScaledVector(_camToStar, -behindDist)
      .addScaledVector(_camLeftDir, sideDist)
    _focusBaseOffset.subVectors(_camOffsetDir, _focusAxisPoint)
    _focusBaseOffset.applyQuaternion(_focusOrbitQuat)
    _camOffsetDir.copy(_focusAxisPoint).add(_focusBaseOffset)

    const camLerp = isMenu ? 0.015 : 0.04
    _targetCamPos.lerp(_camOffsetDir, camLerp)
    _targetLookAt.lerp(_focusAxisPoint, camLerp)
  } else {
    _targetCamPos.lerp(_defaultCamPos, 0.04)
    _targetLookAt.lerp(_defaultLookAt, 0.04)
  }

  _currentLookAt.lerp(_targetLookAt, 0.06)
  camera.position.lerp(_targetCamPos, 0.06)
  camera.lookAt(_currentLookAt)

  camera.updateMatrixWorld()

  const distToTarget = camera.position.distanceTo(_targetCamPos)
  const stabilization = Math.max(0, Math.min(1, 1 - distToTarget / 1.5))

  const _viewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const starInFront = new THREE.Vector3().subVectors(_starPos, camera.position).dot(_viewDir) > 0
  let planetInFront = false
  if (planet) {
    planet.updateMatrixWorld(true)
    planet.getWorldPosition(_planetWorldPos)
    planetInFront = new THREE.Vector3().subVectors(_planetWorldPos, camera.position).dot(_viewDir) > 0
  }

  ctx._focusUIProgress += ((isFocused ? 1.0 : 0.0) - ctx._focusUIProgress) * 0.12

  // Prevent first-frame flash: on the initial frame after focus,
  // _targetCamPos and camera are still near each other (both at default),
  // making stabilization artificially ~1. Suppress UI until the camera
  // has actually departed from its focus-start position by a meaningful distance.
  const currentFocusTarget = isFocused ? ctx._focusedPlanetIdx : -1
  if (currentFocusTarget !== _lastFocusTarget) {
    _focusDepartPos.copy(camera.position)
    _lastFocusTarget = currentFocusTarget
  }

  let activeUIAlpha = ctx._focusUIProgress * stabilization * stabilization
  if (!starInFront || !planetInFront) activeUIAlpha = 0
  // Gate: suppress UI until camera has genuinely departed from start position
  if (isFocused && camera.position.distanceTo(_focusDepartPos) < 0.25) activeUIAlpha = 0

  // ---- invert canvas ----
  const invertCanvas = ctx.invertCanvasRef?.value
  if (invertCanvas) {
    const invCtx = invertCanvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = renderer.domElement.getBoundingClientRect()
    const w = rect.width, h = rect.height

    if (invertCanvas.width !== w * dpr || invertCanvas.height !== h * dpr) {
      invertCanvas.width = w * dpr
      invertCanvas.height = h * dpr
      invertCanvas.style.width = w + 'px'
      invertCanvas.style.height = h + 'px'
      invertCanvas.style.left = rect.left + 'px'
      invertCanvas.style.top = rect.top + 'px'
    }
    invCtx.clearRect(0, 0, invertCanvas.width, invertCanvas.height)
    invCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (isFocused && planet && activeUIAlpha > 0.01) {
      function toScreen(v3, out) {
        out.copy(v3).project(camera)
        out.x = (out.x * 0.5 + 0.5) * w
        out.y = (-out.y * 0.5 + 0.5) * h
        return out
      }

      const _getPS = (sp, r, oc) => {
        _vCamToPlanet.subVectors(camera.position, sp)
        const d = _vCamToPlanet.length()
        if (d <= r) { toScreen(sp, oc); return { rx: 0, ry: 0 } }
        _vCamToPlanet.divideScalar(d)
        _uRight.set(1,0,0).applyQuaternion(camera.quaternion)
        const dr = _uRight.dot(_vCamToPlanet)
        _uRight.addScaledVector(_vCamToPlanet, -dr).normalize()
        _uUp.set(0,1,0).applyQuaternion(camera.quaternion)
        const du = _uUp.dot(_vCamToPlanet)
        _uUp.addScaledVector(_vCamToPlanet, -du).normalize()
        const x = (r*r)/d, rT = Math.sqrt(Math.max(0,r*r-x*x))
        _sTangent.copy(sp).addScaledVector(_vCamToPlanet, x)
        _tRight.copy(_sTangent).addScaledVector(_uRight, rT)
        _tLeft.copy(_sTangent).addScaledVector(_uRight, -rT)
        _tTop.copy(_sTangent).addScaledVector(_uUp, rT)
        _tBottom.copy(_sTangent).addScaledVector(_uUp, -rT)
        toScreen(_tRight,_ssTRight); toScreen(_tLeft,_ssTLeft)
        toScreen(_tTop,_ssTTop); toScreen(_tBottom,_ssTBottom)
        oc.x=(_ssTRight.x+_ssTLeft.x)*0.5; oc.y=(_ssTTop.y+_ssTBottom.y)*0.5
        return { rx: _ssTRight.distanceTo(_ssTLeft)*0.5, ry: _ssTTop.distanceTo(_ssTBottom)*0.5 }
      }

      const starRes = _getPS(_starPos, 0.42, _ssStar)
      planet.updateMatrixWorld(true)
      planet.getWorldPosition(_planetWorldPos)
      const planetRes = _getPS(_planetWorldPos, 0.015*planet.scale.x, _ssPlanet)

      const rawStarDRX = starRes.rx + 8, rawStarDRY = starRes.ry + 8
      const rawPlanetDRX = planetRes.rx + 6, rawPlanetDRY = planetRes.ry + 6
      const rawStarX = _ssStar.x, rawStarY = _ssStar.y
      const rawPlanetX = _ssPlanet.x, rawPlanetY = _ssPlanet.y

      const smooth = 0.35
      if (!_smoothInvertInit || !isFocused) {
        _smoothStarX = rawStarX; _smoothStarY = rawStarY
        _smoothStarRX = rawStarDRX; _smoothStarRY = rawStarDRY
        _smoothPlanetX = rawPlanetX; _smoothPlanetY = rawPlanetY
        _smoothPlanetRX = rawPlanetDRX; _smoothPlanetRY = rawPlanetDRY
        _smoothInvertInit = isFocused
      } else {
        _smoothStarX += (rawStarX - _smoothStarX) * smooth
        _smoothStarY += (rawStarY - _smoothStarY) * smooth
        _smoothStarRX += (rawStarDRX - _smoothStarRX) * smooth
        _smoothStarRY += (rawStarDRY - _smoothStarRY) * smooth
        _smoothPlanetX += (rawPlanetX - _smoothPlanetX) * smooth
        _smoothPlanetY += (rawPlanetY - _smoothPlanetY) * smooth
        _smoothPlanetRX += (rawPlanetDRX - _smoothPlanetRX) * smooth
        _smoothPlanetRY += (rawPlanetDRY - _smoothPlanetRY) * smooth
      }

      const starDRX = _smoothStarRX, starDRY = _smoothStarRY
      const planetDRX = _smoothPlanetRX, planetDRY = _smoothPlanetRY
      const sStarX = _smoothStarX, sStarY = _smoothStarY
      const sPlanetX = _smoothPlanetX, sPlanetY = _smoothPlanetY

      const dx = sPlanetX-sStarX, dy = sPlanetY-sStarY
      const dist = Math.hypot(dx,dy), theta = Math.atan2(dy,dx)
      const drVal = starDRX-planetDRX
      const phi = (dist > Math.abs(drVal) && isFinite(dist)) ? Math.asin(Math.max(-1, Math.min(1, drVal/dist))) : 0
      const a1 = theta+Math.PI/2-phi, a2 = theta-Math.PI/2+phi

      const ts1x=sStarX+starDRX*Math.cos(a1), ts1y=sStarY+starDRY*Math.sin(a1)
      const ts2x=sStarX+starDRX*Math.cos(a2), ts2y=sStarY+starDRY*Math.sin(a2)
      const tp1x=sPlanetX+planetDRX*Math.cos(a1), tp1y=sPlanetY+planetDRY*Math.sin(a1)
      const tp2x=sPlanetX+planetDRX*Math.cos(a2), tp2y=sPlanetY+planetDRY*Math.sin(a2)

      const tdx1=tp1x-ts1x, tdy1=tp1y-ts1y, tl1=Math.hypot(tdx1,tdy1)||1
      const tdx2=tp2x-ts2x, tdy2=tp2y-ts2y, tl2=Math.hypot(tdx2,tdy2)||1
      const ux1=tdx1/tl1, uy1=tdy1/tl1, ux2=tdx2/tl2, uy2=tdy2/tl2

      const extLen = Math.max(w,h)*2
      const es1x=ts1x-ux1*extLen, es1y=ts1y-uy1*extLen
      const es2x=ts2x-ux2*extLen, es2y=ts2y-uy2*extLen
      const ep1x=tp1x+ux1*extLen, ep1y=tp1y+uy1*extLen
      const ep2x=tp2x+ux2*extLen, ep2y=tp2y+uy2*extLen

      const distInv = Math.hypot(sPlanetX-sStarX, sPlanetY-sStarY)
      const mathValidInv = distInv > Math.abs(starDRX-planetDRX) + 15 && isFinite(distInv) && distInv > 10

      if (mathValidInv) {
        invCtx.save()
        invCtx.globalAlpha = activeUIAlpha
        invCtx.fillStyle = '#ffffff'

        invCtx.beginPath()
        invCtx.moveTo(es1x, es1y)
        invCtx.lineTo(ts1x, ts1y)
        invCtx.ellipse(sStarX, sStarY, starDRX, starDRY, 0, a1, a2, false)
        invCtx.lineTo(es2x, es2y)
        invCtx.closePath()
        invCtx.fill()

        invCtx.beginPath()
        invCtx.moveTo(ep2x, ep2y)
        invCtx.lineTo(tp2x, tp2y)
        invCtx.ellipse(sPlanetX, sPlanetY, planetDRX, planetDRY, 0, a2, a1, false)
        invCtx.lineTo(ep1x, ep1y)
        invCtx.closePath()
        invCtx.fill()

        invCtx.restore()
      }
    }
  }

  // ---- overlay canvas ----
  const overlay = ctx.overlayRef?.value
  if (overlay) {
    const oCtx = overlay.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const rect = renderer.domElement.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (overlay.width !== w * dpr || overlay.height !== h * dpr) {
      overlay.width = w * dpr
      overlay.height = h * dpr
      overlay.style.width = w + 'px'
      overlay.style.height = h + 'px'
      overlay.style.left = rect.left + 'px'
      overlay.style.top = rect.top + 'px'
    }

    oCtx.clearRect(0, 0, overlay.width, overlay.height)
    oCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const margin = 30
    const cornerLen = 18
    const hudScale = 1.5
    oCtx.strokeStyle = 'rgba(15, 23, 42, 0.12)'
    oCtx.lineWidth = 1.2

    oCtx.beginPath(); oCtx.moveTo(margin, margin + cornerLen); oCtx.lineTo(margin, margin); oCtx.lineTo(margin + cornerLen, margin); oCtx.stroke()
    oCtx.beginPath(); oCtx.moveTo(w - margin, margin + cornerLen); oCtx.lineTo(w - margin, margin); oCtx.lineTo(w - margin - cornerLen, margin); oCtx.stroke()
    oCtx.beginPath(); oCtx.moveTo(margin, h - margin - cornerLen); oCtx.lineTo(margin, h - margin); oCtx.lineTo(margin + cornerLen, h - margin); oCtx.stroke()
    oCtx.beginPath(); oCtx.moveTo(w - margin, h - margin - cornerLen); oCtx.lineTo(w - margin, h - margin); oCtx.lineTo(w - margin - cornerLen, h - margin); oCtx.stroke()

    oCtx.strokeStyle = 'rgba(15, 23, 42, 0.18)'
    oCtx.lineWidth = 1.2
    oCtx.beginPath()
    oCtx.moveTo(margin + 14, h - margin - 8)
    oCtx.lineTo(margin + 100, h - margin - 8)
    oCtx.moveTo(margin + 14, h - margin - 14); oCtx.lineTo(margin + 14, h - margin - 2)
    oCtx.moveTo(margin + 100, h - margin - 14); oCtx.lineTo(margin + 100, h - margin - 2)
    oCtx.stroke()
    oCtx.fillStyle = 'rgba(15, 23, 42, 0.5)'
    oCtx.font = `${10 * hudScale}px monospace`
    oCtx.textAlign = 'left'
    oCtx.fillText('GRID_UNIT: 50AU', margin + 18, h - margin - 16)

    if (ctx._focusUIProgress > 0.01) {
      const textX = margin + 14
      const textY = h - margin - 110

      oCtx.save()
      oCtx.globalAlpha = ctx._focusUIProgress

      const titleYOffset = ctx._focusUIProgress * -12

      const titleSize = (18 + ctx._focusUIProgress * 22) * hudScale
      oCtx.font = `bold ${titleSize.toFixed(1)}px "Georgia", "Times New Roman", serif`

      const titleR = Math.round(100 - ctx._focusUIProgress * 85)
      const titleG = Math.round(116 - ctx._focusUIProgress * 93)
      const titleB = Math.round(139 - ctx._focusUIProgress * 97)
      oCtx.fillStyle = `rgb(${titleR}, ${titleG}, ${titleB})`
      oCtx.fillText('Personal Site', textX, textY + titleYOffset)

      oCtx.font = `bold ${10 * hudScale}px monospace`
      oCtx.fillStyle = '#0f172a'
      oCtx.fillText('YEQU_DESU // RADAR_TERMINAL_LOCK', textX, textY + titleYOffset - 78)

      oCtx.font = `${10 * hudScale}px monospace`
      oCtx.fillStyle = '#475569'
      oCtx.fillText('PORTFOLIO DIRECTORY / SECURE GUIDANCE', textX, textY + titleYOffset + 44)
      oCtx.fillText(`SYS_COORD: TARGET_ACTIVE (F_INDEX: 0${ctx._mainPlanetIndices.indexOf(ctx._focusedPlanetIdx) + 1})`, textX, textY + titleYOffset + 62)

      oCtx.restore()
    }

    // 左上角 HUD
    const linkIdx = ctx._mainPlanetIndices?.indexOf(ctx._focusedPlanetIdx)
    const link = linkIdx >= 0 && linkIdx < ctx._planetLinks?.length ? ctx._planetLinks[linkIdx] : null

    if (isFocused && planet && link && activeUIAlpha > 0.01) {
      oCtx.save()
      oCtx.globalAlpha = activeUIAlpha

      const tlX = margin + 14
      const tlY = margin + 22

      oCtx.fillStyle = '#0f172a'
      oCtx.font = `bold ${11 * hudScale}px monospace`
      oCtx.fillText('TARGET_AQUISITION_CONSOLE', tlX, tlY)

      oCtx.fillStyle = '#64748b'
      oCtx.font = `${9 * hudScale}px monospace`
      const lh = 16 * hudScale
      oCtx.fillText(`FOCUS_INDEX: 0${linkIdx + 1} // NOMINAL`, tlX, tlY + lh)
      oCtx.fillText(`CAM_XYZ: [${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`, tlX, tlY + lh * 2)
      oCtx.fillText(`ORBIT_VEL: ${(Math.abs(planet.userData.orbitSpeed) * 100).toFixed(1)} AU/S`, tlX, tlY + lh * 3)

      oCtx.restore()

      // 3D 星体投影连线
      function toScreen(v3, out) {
        out.copy(v3).project(camera)
        out.x = (out.x * 0.5 + 0.5) * w
        out.y = (-out.y * 0.5 + 0.5) * h
        return out
      }

      function getPreciseProjectedSphere(sphereWorldPos, radius, outScreenCenter) {
        _vCamToPlanet.subVectors(camera.position, sphereWorldPos)
        const d = _vCamToPlanet.length()
        if (d <= radius) { toScreen(sphereWorldPos, outScreenCenter); return { rx: 0, ry: 0 } }
        _vCamToPlanet.divideScalar(d)

        _uRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
        const dotR = _uRight.dot(_vCamToPlanet)
        _uRight.addScaledVector(_vCamToPlanet, -dotR).normalize()

        _uUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
        const dotU = _uUp.dot(_vCamToPlanet)
        _uUp.addScaledVector(_vCamToPlanet, -dotU).normalize()

        const x = (radius * radius) / d
        const rTangent = Math.sqrt(Math.max(0, radius * radius - x * x))

        _sTangent.copy(sphereWorldPos).addScaledVector(_vCamToPlanet, x)
        _tRight.copy(_sTangent).addScaledVector(_uRight, rTangent)
        _tLeft.copy(_sTangent).addScaledVector(_uRight, -rTangent)
        _tTop.copy(_sTangent).addScaledVector(_uUp, rTangent)
        _tBottom.copy(_sTangent).addScaledVector(_uUp, -rTangent)

        toScreen(_tRight, _ssTRight)
        toScreen(_tLeft, _ssTLeft)
        toScreen(_tTop, _ssTTop)
        toScreen(_tBottom, _ssTBottom)

        outScreenCenter.x = (_ssTRight.x + _ssTLeft.x) * 0.5
        outScreenCenter.y = (_ssTTop.y + _ssTBottom.y) * 0.5
        const radiusX = _ssTRight.distanceTo(_ssTLeft) * 0.5
        const radiusY = _ssTTop.distanceTo(_ssTBottom) * 0.5
        return { rx: radiusX, ry: radiusY }
      }

      const starRes = getPreciseProjectedSphere(_starPos, 0.42, _ssStar)

      planet.updateMatrixWorld(true)
      planet.getWorldPosition(_planetWorldPos)
      const planetRes = getPreciseProjectedSphere(_planetWorldPos, 0.015 * planet.scale.x, _ssPlanet)

      const starDrawRX = starRes.rx + 8, starDrawRY = starRes.ry + 8
      const planetDrawRX = planetRes.rx + 6, planetDrawRY = planetRes.ry + 6

      const dx = _ssPlanet.x - _ssStar.x, dy = _ssPlanet.y - _ssStar.y
      const dist = Math.hypot(dx, dy)
      const theta = Math.atan2(dy, dx)
      const dr = starDrawRX - planetDrawRX
      const phi = (dist > Math.abs(dr) && isFinite(dist) && dist > 0)
        ? Math.asin(Math.max(-1, Math.min(1, dr / dist))) : 0

      const alpha1 = theta + Math.PI / 2 - phi
      const alpha2 = theta - Math.PI / 2 + phi

      const ts1x = _ssStar.x + starDrawRX * Math.cos(alpha1), ts1y = _ssStar.y + starDrawRY * Math.sin(alpha1)
      const ts2x = _ssStar.x + starDrawRX * Math.cos(alpha2), ts2y = _ssStar.y + starDrawRY * Math.sin(alpha2)
      const tp1x = _ssPlanet.x + planetDrawRX * Math.cos(alpha1), tp1y = _ssPlanet.y + planetDrawRY * Math.sin(alpha1)
      const tp2x = _ssPlanet.x + planetDrawRX * Math.cos(alpha2), tp2y = _ssPlanet.y + planetDrawRY * Math.sin(alpha2)

      const extLen = Math.max(w, h) * 2
      const tdx1 = tp1x - ts1x, tdy1 = tp1y - ts1y, tl1 = Math.hypot(tdx1, tdy1) || 1
      const tdx2 = tp2x - ts2x, tdy2 = tp2y - ts2y, tl2 = Math.hypot(tdx2, tdy2) || 1

      const distOv = Math.hypot(_ssPlanet.x - _ssStar.x, _ssPlanet.y - _ssStar.y)
      const mathValidOv = distOv > Math.abs(starDrawRX - planetDrawRX) + 15 && isFinite(distOv) && distOv > 10

      if (mathValidOv) {
        oCtx.save()
        oCtx.globalAlpha = activeUIAlpha

        oCtx.strokeStyle = '#64748b'; oCtx.lineWidth = 1
        oCtx.setLineDash([4, 4])
        oCtx.beginPath(); oCtx.ellipse(_ssStar.x, _ssStar.y, starDrawRX, starDrawRY, 0, 0, Math.PI * 2); oCtx.stroke()
        oCtx.beginPath(); oCtx.ellipse(_ssPlanet.x, _ssPlanet.y, planetDrawRX, planetDrawRY, 0, 0, Math.PI * 2); oCtx.stroke()

        oCtx.setLineDash([])
        oCtx.strokeStyle = '#475569'; oCtx.lineWidth = 1.0
        oCtx.beginPath(); oCtx.moveTo(ts1x - (tdx1 / tl1) * extLen, ts1y - (tdy1 / tl1) * extLen)
        oCtx.lineTo(tp1x + (tdx1 / tl1) * extLen, tp1y + (tdy1 / tl1) * extLen); oCtx.stroke()
        oCtx.beginPath(); oCtx.moveTo(ts2x - (tdx2 / tl2) * extLen, ts2y - (tdy2 / tl2) * extLen)
        oCtx.lineTo(tp2x + (tdx2 / tl2) * extLen, tp2y + (tdy2 / tl2) * extLen); oCtx.stroke()

        const drawAnchor = (x, y, sz = 5) => {
          oCtx.strokeStyle = 'rgba(15, 23, 42, 0.4)'
          oCtx.lineWidth = 0.75
          oCtx.beginPath()
          oCtx.moveTo(x - sz, y); oCtx.lineTo(x + sz, y)
          oCtx.moveTo(x, y - sz); oCtx.lineTo(x, y + sz)
          oCtx.stroke()
        }
        drawAnchor(_ssStar.x, _ssStar.y, 6)
        drawAnchor(_ssPlanet.x, _ssPlanet.y, 4)

        const flowT = (time * 0.4) % 1.0
        oCtx.fillStyle = '#475569'
        oCtx.beginPath()
        oCtx.arc(ts1x + tdx1 * flowT, ts1y + tdy1 * flowT, 1.5, 0, Math.PI * 2)
        oCtx.arc(ts2x + tdx2 * flowT, ts2y + tdy2 * flowT, 1.5, 0, Math.PI * 2)
        oCtx.fill()

        const rayCount = 16
        const rayMaxDist = Math.hypot(w, h)
        const rayDuration = 1.2
        const rayStagger = 0.04
        oCtx.strokeStyle = 'rgba(15, 23, 42, 0.22)'; oCtx.lineWidth = 0.5
        for (let i = 0; i < rayCount; i++) {
          const angle = (i / rayCount) * Math.PI * 2
          const cosA = Math.cos(angle), sinA = Math.sin(angle)
          const startT = ctx._focusStartTime + i * rayStagger
          const elapsed = Math.max(0, time - startT)
          const rawT = Math.min(1, elapsed / rayDuration)
          const eased = rawT * rawT * rawT * rawT
          const rayStartR = (starDrawRX + starDrawRY) * 0.5
          const rayLen = rayStartR + 4 + eased * rayMaxDist
          oCtx.beginPath()
          oCtx.moveTo(_ssStar.x + cosA * (rayStartR + 4), _ssStar.y + sinA * (rayStartR + 4))
          oCtx.lineTo(_ssStar.x + cosA * rayLen, _ssStar.y + sinA * rayLen)
          oCtx.stroke()
        }

        const sideSign = (_ssPlanet.x >= _ssStar.x) ? 1 : -1
        const leadLen = 75
        const elbowX = _ssPlanet.x + 25 * sideSign
        const elbowY = _ssPlanet.y - 45
        const endX = _ssPlanet.x + leadLen * sideSign
        const endY = elbowY

        oCtx.strokeStyle = '#475569'
        oCtx.lineWidth = 0.75
        oCtx.beginPath()
        oCtx.moveTo(_ssPlanet.x, _ssPlanet.y)
        oCtx.lineTo(elbowX, elbowY)
        oCtx.lineTo(endX, endY)
        oCtx.stroke()

        oCtx.fillStyle = link.accent
        oCtx.fillRect(endX - (sideSign > 0 ? 0 : 2), endY - 2, 2, 4)

        const panelW = 125
        const panelH = 54
        const panelX = (sideSign > 0) ? endX + 8 : endX - panelW - 8
        const panelY = endY - 22

        oCtx.fillStyle = 'rgba(15, 23, 42, 0.94)'
        oCtx.fillRect(panelX, panelY, panelW, panelH)

        oCtx.strokeStyle = '#475569'
        oCtx.lineWidth = 1.0
        oCtx.strokeRect(panelX, panelY, panelW, panelH)

        const blockW = 113
        const blockH = 17
        const blockX = panelX + 6
        const blockY = panelY + 6
        oCtx.fillStyle = link.accent
        oCtx.fillRect(blockX, blockY, blockW, blockH)

        oCtx.fillStyle = '#0f172a'
        oCtx.font = 'bold 8px monospace'
        oCtx.textAlign = 'left'
        oCtx.fillText(`LAUNCH ➔ ${link.label}`, blockX + 6, blockY + 11.5)

        oCtx.fillStyle = '#f1f5f9'
        oCtx.font = '7.5px monospace'
        oCtx.fillText(`SYS_LOC: [${_planetWorldPos.x.toFixed(1)}, ${_planetWorldPos.z.toFixed(1)}]`, blockX, blockY + 28)
        oCtx.fillStyle = '#cbd5e1'
        oCtx.fillText(`GATEWAY: ${(link.url || 'MENU_SYSTEM').replace('https://', '')}`, blockX, blockY + 38)
        oCtx.restore()
      }
    }
  }
}

export function dispose(ctx) {
  _smoothInvertInit = false
}
