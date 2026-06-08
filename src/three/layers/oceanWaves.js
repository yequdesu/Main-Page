import * as THREE from 'three'
import { WHITE_OUT_THRESHOLD, GRID_START, VERTICAL_START, GRID_SHIFT_START } from '../constants.js'
import { _waveBeamOrigin, _waveBeamDir, _targetCol } from '../shared/reusableObjects.js'

let oceanLines = []
let waveData = [], waveBaseColors = []
let wavesVisible = true
let _lastWavesTime = -1, _lastWavesSp = -1

export function buildOcean(ctx) {
  const TOTAL = 50, POWER = 2.2
  for (let i = 0; i < TOTAL; i++) {
    const t = i / (TOTAL - 1)
    const curveT = Math.pow(t, POWER)
    const z     = -52 + curveT * 57
    const baseY = -3.5 + curveT * 2.0
    const amplitude = 0.005 + curveT * 0.45
    const frequency = 0.12 + curveT * 0.22
    const speed     = 0.35 * curveT + 0.05
    const phase     = Math.random() * Math.PI * 2
    const opacity   = 0.15 + curveT * 0.55
    const span      = 45 + curveT * 35

    const r = Math.floor(6 + curveT * 12)
    const g = Math.floor(12 + curveT * 18)
    const b = Math.floor(26 + curveT * 24)
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
    const bc = new THREE.Color(hex)
    waveBaseColors.push({ r: bc.r, g: bc.g, b: bc.b })

    const segCount = 150
    const points = []
    for (let j = 0; j <= segCount; j++) {
      const x = (j / segCount - 0.5) * span * 2
      points.push(new THREE.Vector3(x, baseY, z))
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points)
    const colors = new Float32Array((segCount + 1) * 3)
    for (let j = 0; j <= segCount; j++) { colors[j*3]=bc.r; colors[j*3+1]=bc.g; colors[j*3+2]=bc.b }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, depthTest: true })
    const line = new THREE.Line(geom, mat)
    line.renderOrder = 0
    ctx.scene.add(line)
    oceanLines.push(line)
    waveData.push({ baseY, z, amplitude, frequency, speed, phase, span, segCount, opacity })
  }
  ctx.oceanLines = oceanLines
  ctx.waveData = waveData
  ctx.waveBaseColors = waveBaseColors
}

export function animateWavesAndLighting(time, sp, gridFactor, smoothProgress3, ctx) {
  if (time === _lastWavesTime && sp === _lastWavesSp) return
  _lastWavesTime = time
  _lastWavesSp = sp

  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothP3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const gridOpacityMult = 1.0 - smoothP3

  if (gridOpacityMult < 0.001) {
    if (wavesVisible) {
      for (let i = 0; i < oceanLines.length; i++) {
        oceanLines[i].visible = false
      }
      wavesVisible = false
    }
    return
  } else {
    if (!wavesVisible) {
      for (let i = 0; i < oceanLines.length; i++) {
        oceanLines[i].visible = true
      }
      wavesVisible = true
    }
  }

  const hlWeight = Math.max(0, Math.min(1, (WHITE_OUT_THRESHOLD - sp) / 0.10))
  const gridWeight = gridFactor
  const shiftY = -32.0 * smoothP3

  const beamPivot = ctx.beamPivot
  if (hlWeight > 0 && beamPivot) {
    beamPivot.getWorldPosition(_waveBeamOrigin)
    _waveBeamDir.set(0, 0, 1).applyQuaternion(beamPivot.quaternion).normalize()
  }

  for (let i = 0; i < oceanLines.length; i++) {
    const line = oceanLines[i], data = waveData[i], bc = waveBaseColors[i]
    const pa = line.geometry.attributes.position, ca = line.geometry.attributes.color
    const pArr = pa.array, cArr = ca.array

    const rawZ = data.z
    const baseDepthFade = Math.max(0, Math.min(1, (rawZ - (-52)) / 20.0))

    for (let j = 0; j <= data.segCount; j++) {
      const idx = j * 3, x = pArr[idx]
      const t = time * data.speed + data.phase
      const waveY = data.baseY + Math.sin(x * data.frequency + t) * data.amplitude + Math.sin(x * data.frequency * 1.8 + t * 1.2) * data.amplitude * 0.4

      pArr[idx+1] = THREE.MathUtils.lerp(waveY, data.baseY, gridWeight) + shiftY

      let r = bc.r, g = bc.g, b = bc.b
      if (hlWeight > 0 && beamPivot) {
        const vx = x - _waveBeamOrigin.x
        const vy = waveY - _waveBeamOrigin.y
        const vz = data.z - _waveBeamOrigin.z
        const proj = vx * _waveBeamDir.x + vy * _waveBeamDir.y + vz * _waveBeamDir.z
        const localX = vx * _waveBeamDir.z - vz * _waveBeamDir.x
        const beamR = 1.2 + Math.max(0, proj) * 0.15
        const distSq = (localX * localX) / (beamR * beamR) + (vy * vy) / 1.5
        let di = Math.exp(-distSq * 0.9)
        di *= Math.max(0, Math.min(1, (proj + 4) / 8))
        di *= Math.max(0, 1 - (Math.max(0, proj) / 48))
        let li = di * 1.5 * hlWeight
        if (_waveBeamDir.z > 0 && vz > 0) li += di * Math.exp(-(x * x) / 7) * _waveBeamDir.z * 1.3 * hlWeight
        const hR = 0.92, hG = 0.97, hB = 1.0
        r = bc.r + (hR - bc.r) * li * 0.95
        g = bc.g + (hG - bc.g) * li * 0.95
        b = bc.b + (hB - bc.b) * li * 0.95
      }

      cArr[idx]   = THREE.MathUtils.lerp(r, _targetCol.r, gridWeight)
      cArr[idx+1] = THREE.MathUtils.lerp(g, _targetCol.g, gridWeight)
      cArr[idx+2] = THREE.MathUtils.lerp(b, _targetCol.b, gridWeight)
    }
    pa.needsUpdate = true
    ca.needsUpdate = true
    line.material.opacity = THREE.MathUtils.lerp(data.opacity, 0.45, gridWeight) * baseDepthFade * gridOpacityMult
  }
}

export function disposeOcean(ctx) {
  for (const line of oceanLines) {
    line.geometry.dispose()
    line.material.dispose()
    ctx.scene.remove(line)
  }
  oceanLines = []
  waveData = []
  waveBaseColors = []
}
