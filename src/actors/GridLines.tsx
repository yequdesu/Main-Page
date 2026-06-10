import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, Color, BufferGeometry, BufferAttribute, LineBasicMaterial, PointsMaterial, Vector3, Points } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, GRID_START, VERTICAL_START, TEXT_START, GRID_SHIFT_START } from '../r3f/ScrollRig'
import type { GridLineData } from '../types'

/**
 * 垂直网格线 + 节点。
 *
 * 原 buildVerticalGridLines():963-988 + buildGridJunctionNodes():939-961
 * 28 条线 + 210 个节点。
 *
 * 援引：R3F <points> + <threeLine>（手动 bufferGeometry）
 */
export default function GridLines() {
  const { gridLines, gridPoints } = useMemo(() => {
    // Vertical lines
    const totalLines = 28, zStart = -52, zEnd = 12, baseY = -2.5
    const lines: GridLineData[] = []
    for (let i = 0; i < totalLines; i++) {
      const x = -28 + (i / (totalLines - 1)) * 56
      const pts = [x, baseY, zStart, x, baseY, zStart] // both ends at zStart initially
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
      const nearColor = new Color('#94a3b8')
      const farColor  = new Color('#f1f5f9')
      g.setAttribute('color', new BufferAttribute(new Float32Array([
        farColor.r, farColor.g, farColor.b,
        nearColor.r, nearColor.g, nearColor.b,
      ]), 3))
      const mat = new LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0,
        depthTest: true, depthWrite: false,
      })
      const line = new Line(g, mat)
      line.renderOrder = 2
      lines.push({ line, x, baseY, zStart, zEnd, staggerOffset: Math.random() * 0.45 })
    }

    // Junction nodes
    const dotPts: Vector3[] = []
    for (let i = 0; i < 14; i++) {
      const x = -26 + (i / 13) * 52
      for (let j = 0; j < 15; j++) {
        const z = -48 + (j / 14) * 52
        dotPts.push(new Vector3(x, -2.5, z))
      }
    }
    const dotGeo = new BufferGeometry().setFromPoints(dotPts)
    const dotMat = new PointsMaterial({
      color: '#94a3b8', size: 0.052, transparent: true, opacity: 0,
      depthWrite: false, depthTest: true,
    })
    const dots = new Points(dotGeo, dotMat)
    dots.renderOrder = 2

    return { gridLines: lines, gridPoints: dots }
  }, [])

  useEffect(() => {
    return () => {
      gridLines.forEach(vd => {
        vd.line.geometry.dispose()
        ;(vd.line.material as LineBasicMaterial).dispose()
      })
      gridPoints.geometry.dispose()
      ;(gridPoints.material as PointsMaterial).dispose()
    }
  }, [gridLines, gridPoints])

  const { shouldSkipSp } = useFrameCache()
  const gridVisibleRef = useRef(true)

  useFrame((_state, _delta) => {
    const sp = useScrollStore.getState().scrollProgress
    if (shouldSkipSp(sp)) return

    const vertFactor = clamped(sp, VERTICAL_START, TEXT_START)
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)
    const gridOpacityMult = 1.0 - smooth3

    // Bulk visibility
    if (gridOpacityMult < 0.001) {
      if (gridVisibleRef.current) {
        gridLines.forEach(l => l.line.visible = false)
        gridPoints.visible = false
        gridVisibleRef.current = false
      }
      return
    } else if (!gridVisibleRef.current) {
      gridLines.forEach(l => l.line.visible = true)
      gridPoints.visible = true
      gridVisibleRef.current = true
    }

    if (sp < VERTICAL_START) return

    const shiftY = -32.0 * smooth3

    for (const vd of gridLines) {
      const lp = Math.max(0, Math.min(1, (vertFactor - vd.staggerOffset) / 0.55))
      const curZ = vd.zStart + (vd.zEnd - vd.zStart) * lp
      const pArr = vd.line.geometry.attributes.position.array as Float32Array
      pArr[1] = vd.baseY + shiftY
      pArr[4] = vd.baseY + shiftY
      pArr[5] = curZ
      vd.line.geometry.attributes.position.needsUpdate = true
      ;(vd.line.material as LineBasicMaterial).opacity = Math.min(0.75, lp * 0.75) * gridOpacityMult
    }

    const gridFactor = clamped(sp, GRID_START, VERTICAL_START)
    gridPoints.position.y = shiftY
    gridPoints.material.opacity = gridFactor * 0.55 * gridOpacityMult
  })

  return (
    <group>
      {gridLines.map((vd, i) => (
        <primitive key={`vl-${i}`} object={vd.line} />
      ))}
      <primitive object={gridPoints} />
    </group>
  )
}
