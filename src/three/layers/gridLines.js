import * as THREE from 'three'
import { GRID_START, VERTICAL_START, TEXT_START, GRID_SHIFT_START } from '../constants.js'

let gridVerticalLines = []
let _gridPoints = null
let gridLinesVisible = true
let _lastGridSp = -1

export function buildGridLines(ctx) {
  buildVerticalGridLines(ctx)
  buildGridJunctionNodes(ctx)
  ctx.gridVerticalLines = gridVerticalLines
  ctx._gridPoints = _gridPoints
}

function buildGridJunctionNodes(ctx) {
  if (_gridPoints) return
  const dotPts = []
  for (let i = 0; i < 14; i++) {
    const x = -26 + (i / 13) * 52
    for (let j = 0; j < 15; j++) {
      const z = -48 + (j / 14) * 52
      dotPts.push(new THREE.Vector3(x, -2.5, z))
    }
  }
  const dotGeo = new THREE.BufferGeometry().setFromPoints(dotPts)
  const dotMat = new THREE.PointsMaterial({
    color: '#94a3b8',
    size: 0.052,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true
  })
  _gridPoints = new THREE.Points(dotGeo, dotMat)
  _gridPoints.renderOrder = 2
  ctx.scene.add(_gridPoints)
}

function buildVerticalGridLines(ctx) {
  if (gridVerticalLines.length > 0) return
  const totalLines = 28, zStart = -52, zEnd = 12, baseY = -2.5
  for (let i = 0; i < totalLines; i++) {
    const x = -28 + (i / (totalLines - 1)) * 56
    const pts = [new THREE.Vector3(x, baseY, zStart), new THREE.Vector3(x, baseY, zStart)]
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    const nearColor = new THREE.Color('#94a3b8')
    const farColor  = new THREE.Color('#f1f5f9')
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
      farColor.r, farColor.g, farColor.b,
      nearColor.r, nearColor.g, nearColor.b
    ]), 3))
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false
    })
    const line = new THREE.Line(g, mat)
    line.renderOrder = 2
    ctx.scene.add(line)
    gridVerticalLines.push({ line, x, baseY, zStart, zEnd, staggerOffset: Math.random() * 0.45 })
  }
}

export function animateVerticalGrid(sp, smoothProgress3, ctx) {
  if (sp === _lastGridSp) return
  _lastGridSp = sp

  const vertFactor = Math.max(0, Math.min(1, (sp - VERTICAL_START) / (TEXT_START - VERTICAL_START)))
  const act3Progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
  const smoothP3 = act3Progress * act3Progress * (3 - 2 * act3Progress)
  const gridOpacityMult = 1.0 - smoothP3

  if (gridOpacityMult < 0.001) {
    if (gridLinesVisible) {
      for (const vd of gridVerticalLines) {
        vd.line.visible = false
      }
      if (_gridPoints) _gridPoints.visible = false
      gridLinesVisible = false
    }
    return
  } else {
    if (!gridLinesVisible) {
      for (const vd of gridVerticalLines) {
        vd.line.visible = true
      }
      if (_gridPoints) _gridPoints.visible = true
      gridLinesVisible = true
    }
  }

  if (sp < VERTICAL_START) {
    return
  }

  const shiftY = -32.0 * smoothP3

  for (const vd of gridVerticalLines) {
    const lp = Math.max(0, Math.min(1, (vertFactor - vd.staggerOffset) / 0.55))
    const curZ = THREE.MathUtils.lerp(vd.zStart, vd.zEnd, lp)
    const pArr = vd.line.geometry.attributes.position.array

    pArr[1] = vd.baseY + shiftY
    pArr[4] = vd.baseY + shiftY
    pArr[5] = curZ

    vd.line.geometry.attributes.position.needsUpdate = true
    vd.line.material.opacity = Math.min(0.75, lp * 0.75) * gridOpacityMult
  }

  if (_gridPoints) {
    const gridFactor = Math.max(0, Math.min(1, (sp - GRID_START) / (VERTICAL_START - GRID_START)))
    _gridPoints.position.y = shiftY
    _gridPoints.material.opacity = gridFactor * 0.55 * gridOpacityMult
  }
}

export function disposeGridLines(ctx) {
  for (const vd of gridVerticalLines) {
    vd.line.geometry.dispose()
    vd.line.material.dispose()
    ctx.scene.remove(vd.line)
  }
  gridVerticalLines = []
  if (_gridPoints) {
    _gridPoints.geometry.dispose()
    _gridPoints.material.dispose()
    ctx.scene.remove(_gridPoints)
    _gridPoints = null
  }
}
