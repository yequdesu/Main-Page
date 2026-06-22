import { useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, Color, BufferGeometry, BufferAttribute, LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, GRID_SHIFT_START } from '../r3f/ScrollRig'
import type { GridLineData } from '../types'

// ============================================================
// 几何参数 — 方向：近处 → 远处 → 向上
// ============================================================
const LINE_COUNT = 32
const X_SPREAD = 22.6
const BOTTOM_Y = -7.0
const TOP_Y = 22.0
const ARC_RADIUS = 2.5
const Z_NEAR = 8
const Z_FAR = -44

const HORZ_SEGS = 18
const ARC_SEGS = 10
const VERT_SEGS = 14
const TOTAL_SEGS = HORZ_SEGS + ARC_SEGS + VERT_SEGS

const COLOR_CENTER = new Color('#8899b0')
const COLOR_EDGE   = new Color('#4a5568')

export default function GridLines() {
  const { gridLines } = useMemo(() => {
    const lines: GridLineData[] = []

    for (let i = 0; i < LINE_COUNT; i++) {
      const x = -X_SPREAD + (i / (LINE_COUNT - 1)) * X_SPREAD * 2
      const vCount = TOTAL_SEGS + 1
      const pts = new Float32Array(vCount * 3)
      const colors = new Float32Array(vCount * 3)

      let vi = 0

      // ---- 水平段：近处 → 远处 ----
      for (let j = 0; j <= HORZ_SEGS; j++, vi++) {
        const t = j / HORZ_SEGS
        const z = Z_NEAR + (Z_FAR - Z_NEAR) * t
        pts[vi * 3] = x
        pts[vi * 3 + 1] = BOTTOM_Y
        pts[vi * 3 + 2] = z
      }

      // ---- 圆弧段 ----
      for (let j = 1; j <= ARC_SEGS; j++, vi++) {
        const theta = (j / ARC_SEGS) * (Math.PI / 2)
        const y = BOTTOM_Y + ARC_RADIUS * (1 - Math.cos(theta))
        const z = Z_FAR - ARC_RADIUS * Math.sin(theta)
        pts[vi * 3] = x
        pts[vi * 3 + 1] = y
        pts[vi * 3 + 2] = z
      }

      // ---- 竖直段 ----
      const vertBaseZ = Z_FAR - ARC_RADIUS
      const vertBaseY = BOTTOM_Y + ARC_RADIUS
      for (let j = 1; j <= VERT_SEGS; j++, vi++) {
        const t = j / VERT_SEGS
        const y = vertBaseY + (TOP_Y - vertBaseY) * t
        pts[vi * 3] = x
        pts[vi * 3 + 1] = y
        pts[vi * 3 + 2] = vertBaseZ
      }

      const xBright = 1.0 - Math.abs(x / X_SPREAD) * 0.8
      for (let j = 0; j < vCount; j++) {
        const zNorm = (pts[j * 3 + 2] - Z_FAR) / (Z_NEAR - Z_FAR)
        const c = new Color().copy(COLOR_EDGE).lerp(COLOR_CENTER, Math.max(0, Math.min(1, xBright + zNorm * 0.15)))
        colors[j * 3] = c.r; colors[j * 3 + 1] = c.g; colors[j * 3 + 2] = c.b
      }

      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(pts, 3))
      g.setAttribute('color', new BufferAttribute(colors, 3))
      const mat = new LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0,
        depthTest: true, depthWrite: false,
      })
      const line = new Line(g, mat)
      line.renderOrder = 2
      const staggerOffset = Math.abs(x / X_SPREAD) * 0.25
      lines.push({ line, x, baseY: BOTTOM_Y, zStart: Z_FAR, zEnd: Z_NEAR, staggerOffset, arcHeight: 0, basePositions: new Float32Array(pts) })
    }

    return { gridLines: lines }
  }, [])

  useEffect(() => {
    return () => {
      gridLines.forEach(vd => {
        vd.line.geometry.dispose()
        ;(vd.line.material as LineBasicMaterial).dispose()
      })
    }
  }, [gridLines])

  const { shouldSkipSp } = useFrameCache()

  useFrame((_state, _delta) => {
    const sp = useScrollStore.getState().scrollProgress
    if (shouldSkipSp(sp)) return

    const EXT_START = 0.60, EXT_END = 0.85, RECYCLE_END = 0.95
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)
    const shiftY = -32.0 * smooth3

    // 完全隐藏
    if (sp < EXT_START || sp >= RECYCLE_END) {
      for (const vd of gridLines) {
        ;(vd.line.material as LineBasicMaterial).opacity = 0
      }
      return
    }

    // 阶段判断
    const isRecycle = sp >= EXT_END
    const phaseFactor = isRecycle
      ? 1.0 - clamped(sp, EXT_END, RECYCLE_END)  // 1→0
      : clamped(sp, EXT_START, EXT_END)            // 0→1

    for (const vd of gridLines) {
      const pArr = vd.line.geometry.attributes.position.array as Float32Array
      const base = vd.basePositions
      const vCount = TOTAL_SEGS + 1
      pArr.set(base)

      let lp: number
      if (isRecycle) {
        lp = Math.max(0, Math.min(1, (phaseFactor - vd.staggerOffset * 0.3) / 0.7))
      } else {
        lp = Math.max(0, Math.min(1, (phaseFactor - vd.staggerOffset) / 0.35))
      }

      const curProgress = lp * TOTAL_SEGS
      const endJ = Math.floor(curProgress)
      const endFrac = curProgress - endJ
      const endIdx = Math.min(endJ, TOTAL_SEGS)
      const nextIdx = Math.min(endJ + 1, TOTAL_SEGS)

      if (isRecycle) {
        // 回收：近端（低索引）拉向远端（高索引）
        for (let j = 0; j < vCount; j++) {
          if (j <= endIdx) {
            pArr[j * 3]     = pArr[TOTAL_SEGS * 3]
            pArr[j * 3 + 1] = pArr[TOTAL_SEGS * 3 + 1]
            pArr[j * 3 + 2] = pArr[TOTAL_SEGS * 3 + 2]
          } else if (j === nextIdx && endFrac > 0) {
            const t = 1.0 - endFrac
            pArr[j * 3]     = pArr[TOTAL_SEGS * 3]     + (pArr[j * 3]     - pArr[TOTAL_SEGS * 3])     * t
            pArr[j * 3 + 1] = pArr[TOTAL_SEGS * 3 + 1] + (pArr[j * 3 + 1] - pArr[TOTAL_SEGS * 3 + 1]) * t
            pArr[j * 3 + 2] = pArr[TOTAL_SEGS * 3 + 2] + (pArr[j * 3 + 2] - pArr[TOTAL_SEGS * 3 + 2]) * t
          }
          pArr[j * 3 + 1] += shiftY
        }
      } else {
        // 延伸：近端（低索引）先生长
        for (let j = 0; j < vCount; j++) {
          if (j <= endIdx) {
          } else if (j === nextIdx && endFrac > 0) {
            const t = endFrac
            pArr[j * 3]     = pArr[endIdx * 3]     + (pArr[j * 3]     - pArr[endIdx * 3])     * t
            pArr[j * 3 + 1] = pArr[endIdx * 3 + 1] + (pArr[j * 3 + 1] - pArr[endIdx * 3 + 1]) * t
            pArr[j * 3 + 2] = pArr[endIdx * 3 + 2] + (pArr[j * 3 + 2] - pArr[endIdx * 3 + 2]) * t
          } else {
            pArr[j * 3]     = pArr[endIdx * 3]
            pArr[j * 3 + 1] = pArr[endIdx * 3 + 1]
            pArr[j * 3 + 2] = pArr[endIdx * 3 + 2]
          }
          pArr[j * 3 + 1] += shiftY
        }
      }

      // 颜色
      const xBright = 1.0 - Math.abs(vd.x / X_SPREAD) * 0.8
      for (let j = 0; j < vCount; j++) {
        const zNorm = (pArr[j * 3 + 2] - Z_FAR) / (Z_NEAR - Z_FAR)
        const c = new Color().copy(COLOR_EDGE).lerp(COLOR_CENTER, Math.max(0, Math.min(1, xBright + zNorm * 0.15)))
        const ca = vd.line.geometry.attributes.color
        if (ca) {
          const cArr = ca.array as Float32Array
          cArr[j * 3] = c.r; cArr[j * 3 + 1] = c.g; cArr[j * 3 + 2] = c.b
        }
      }
      vd.line.geometry.attributes.color!.needsUpdate = true
      vd.line.geometry.attributes.position.needsUpdate = true

      const lineOpacity = 0.60 * (1.0 - Math.abs(vd.x / X_SPREAD))
      ;(vd.line.material as LineBasicMaterial).opacity = Math.min(0.75, lp * 0.75) * lineOpacity
    }
  })

  return (
    <group>
      {gridLines.map((vd, i) => (
        <primitive key={`vl-${i}`} object={vd.line} />
      ))}
    </group>
  )
}
