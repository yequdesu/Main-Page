import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, Color, BufferGeometry, BufferAttribute, LineBasicMaterial, Mesh, MeshBasicMaterial, DoubleSide } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_START, VERTICAL_START, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { _beamWorldOrigin, _beamWorldDirection } from './LightBeam'
import type { WaveLineData, WaveBaseColor } from '../types'

const CURTAIN_BOTTOM_Y = -10

/**
 * 海洋波浪线 — 30 条 Line + 水幕遮罩，逐顶点动画。
 *
 * 每条波浪线下方延伸一个不透明水幕（三角形条带），
 * 顶边跟随波浪曲线，底边固定。水幕先写深度缓冲，
 * 遮挡其 Z 轴后方所有画面。
 *
 * 原 buildOcean():227-265 + animateWavesAndLighting():511-589
 * 30 条线 × 151 顶点 = 4530 个顶点/帧。
 * 深蓝海军底色 + 深度相关透明度，逐字保留自原版。
 *
 * 援引：R3F <threeLine> + bufferGeometry（逐顶点位置/颜色更新）
 */
export default function OceanWaves() {
  const { waveLines, waveData, waveBaseColors, curtainMeshes } = useMemo(() => {
    const TOTAL = 30, POWER = 2.2
    const lines: Line[] = []
    const curtains: Mesh[] = []
    const data: WaveLineData[] = []
    const baseColors: WaveBaseColor[] = []

    for (let i = 0; i < TOTAL; i++) {
      const t = i / (TOTAL - 1)
      const curveT = Math.pow(t, POWER)
      const z = -52 + curveT * 57
      const baseY = -3.5 + curveT * 2.0
      const amplitude = 0.005 + curveT * 0.45
      const frequency = 0.12 + curveT * 0.22
      const speed = 0.35 * curveT + 0.05
      const phase = Math.random() * Math.PI * 2
      const opacity = 0.15 + curveT * 0.55   // 0.15→0.70 深度分层
      const span = 45 + curveT * 35

      const r = Math.floor(6 + curveT * 12)       // 6→18  深蓝 navy
      const g = Math.floor(12 + curveT * 18)      // 12→30
      const b = Math.floor(26 + curveT * 24)      // 26→50
      const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
      const bc = new Color(hex)
      baseColors.push({ r: bc.r, g: bc.g, b: bc.b })

      const segCount = 150
      const points: number[] = []
      for (let j = 0; j <= segCount; j++) {
        const x = (j / segCount - 0.5) * span * 2
        points.push(x, baseY, z)
      }
      const geom = new BufferGeometry()
      geom.setAttribute('position', new BufferAttribute(new Float32Array(points), 3))
      const colors = new Float32Array((segCount + 1) * 3)
      for (let j = 0; j <= segCount; j++) { colors[j * 3] = bc.r; colors[j * 3 + 1] = bc.g; colors[j * 3 + 2] = bc.b }
      geom.setAttribute('color', new BufferAttribute(colors, 3))
      const mat = new LineBasicMaterial({ vertexColors: true, transparent: false, depthWrite: true, depthTest: true })
      const line = new Line(geom, mat)
      line.renderOrder = 0
      lines.push(line)

      // ---- 水幕遮罩：三角形条带，顶边=波浪曲线，底边=CURTAIN_BOTTOM_Y ----
      const vCount = segCount + 1
      const cPositions = new Float32Array(vCount * 2 * 3) // top + bottom rows
      for (let j = 0; j < vCount; j++) {
        const x = (j / segCount - 0.5) * span * 2
        cPositions[j * 3] = x;          cPositions[j * 3 + 1] = baseY; cPositions[j * 3 + 2] = z
        const bi = (vCount + j) * 3
        cPositions[bi] = x;              cPositions[bi + 1] = CURTAIN_BOTTOM_Y; cPositions[bi + 2] = z
      }
      const cIndices: number[] = []
      for (let j = 0; j < segCount; j++) {
        const tl = j, tr = j + 1, bl = vCount + j, br = vCount + j + 1
        cIndices.push(tl, bl, tr, tr, bl, br)
      }
      const cGeom = new BufferGeometry()
      cGeom.setAttribute('position', new BufferAttribute(cPositions, 3))
      cGeom.setIndex(cIndices)
      const cMat = new MeshBasicMaterial({ color: '#1c232b', transparent: true, opacity: 0.90, depthWrite: false, depthTest: true, side: DoubleSide })
      const cMesh = new Mesh(cGeom, cMat)
      cMesh.renderOrder = -1
      curtains.push(cMesh)
      // ------------------------------------------------------------

      data.push({ baseY, z, amplitude, frequency, speed, phase, span, segCount, opacity })
    }
    return { waveLines: lines, waveData: data, waveBaseColors: baseColors, curtainMeshes: curtains }
  }, [])

  useEffect(() => {
    return () => {
      waveLines.forEach(line => {
        line.geometry.dispose()
        ;(line.material as LineBasicMaterial).dispose()
      })
      curtainMeshes.forEach(m => {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
      })
    }
  }, [waveLines, curtainMeshes])

  const { shouldSkip } = useFrameCache()
  const wavesVisibleRef = useRef(true)
  const targetCol = useMemo(() => new Color('#94a3b8'), [])

  useFrame((state, _delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)
    const gridOpacityMult = 1.0 - smooth3

    // Bulk visibility
    if (gridOpacityMult < 0.001) {
      if (wavesVisibleRef.current) {
        waveLines.forEach(l => l.visible = false)
        curtainMeshes.forEach(m => m.visible = false)
        wavesVisibleRef.current = false
      }
      return
    } else if (!wavesVisibleRef.current) {
      waveLines.forEach(l => l.visible = true)
      curtainMeshes.forEach(m => m.visible = true)
      wavesVisibleRef.current = true
    }

    const hlWeight = Math.max(0, Math.min(1, (WHITE_OUT_THRESHOLD - sp) / 0.10))
    const CASCADE_START = 0.24, CASCADE_END = 0.72
    const baseGridFactor = clamped(sp, CASCADE_START, CASCADE_END)
    const shiftY = -32.0 * smooth3

    for (let i = 0; i < waveLines.length; i++) {
      const line = waveLines[i]
      const d = waveData[i]
      const bc = waveBaseColors[i]
      const pa = line.geometry.attributes.position
      const ca = line.geometry.attributes.color
      const pArr = pa.array as Float32Array
      const cArr = ca.array as Float32Array

      const rawZ = d.z
      const baseDepthFade = Math.max(0, Math.min(1, (rawZ - (-52)) / 20.0))
      // 层叠下落：远快近慢，非均匀间距
      // 远处 (zNorm=0) 在 0.24 开始；近处 (zNorm=1) 在 0.60 开始
      const zNorm = (rawZ + 52) / 57  // 0(远) → 1(近)
      const dropStart = CASCADE_START + zNorm * (0.60 - CASCADE_START)  // 0.24→0.60
      const waveGF = clamped(sp, dropStart, CASCADE_END)  // 每层独立起止
      const dropY = -40.0 * waveGF  // 每层下落出画面

      for (let j = 0; j <= d.segCount; j++) {
        const idx = j * 3
        const x = pArr[idx]
        const tWave = time * d.speed + d.phase
        const waveY = d.baseY +
          Math.sin(x * d.frequency + tWave) * d.amplitude +
          Math.sin(x * d.frequency * 1.8 + tWave * 1.2) * d.amplitude * 0.4

        pArr[idx + 1] = waveY + (d.baseY - waveY) * waveGF + shiftY + dropY

        // ---- Volumetric spotlight: per-vertex color highlight ----
        // 原 animateWavesAndLighting():106-122
        // 椭圆光束截面 + 高斯衰减，per-vertex 推向暖蓝白高光
        let r = bc.r, g = bc.g, b = bc.b
        if (hlWeight > 0) {
          const vx = x - _beamWorldOrigin.x
          const vy = waveY - _beamWorldOrigin.y
          const vz = rawZ - _beamWorldOrigin.z
          const proj = vx * _beamWorldDirection.x + vy * _beamWorldDirection.y + vz * _beamWorldDirection.z
          const localX = vx * _beamWorldDirection.z - vz * _beamWorldDirection.x
          const beamR = 2.0 + Math.max(0, proj) * 0.25    // ↑=光束更宽、扩散更快
          const distSq = (localX * localX) / (beamR * beamR) + (vy * vy) / 3.0  // ↑=垂直衰减更小
          let di = Math.exp(-distSq * 0.35)               // ↓=外晕更柔、扩散更远
          di *= Math.max(0, Math.min(1, (proj + 2) / 10))  // 近场截止更宽松
          di *= Math.max(0, 1 - (Math.max(0, proj) / 64))  // 远场延伸到更远
          let li = di * 1.2 * hlWeight                     // 适中亮度，外晕柔和
          if (_beamWorldDirection.z > 0 && vz > 0) {
            li += di * Math.exp(-(x * x) / 10) * _beamWorldDirection.z * 1.5 * hlWeight
          }
          // 高光暖白 + 低系数：外晕可见但不惨白
          const hR = 1.0, hG = 1.0, hB = 1.0
          r = bc.r + (hR - bc.r) * Math.min(1, li) * 1.0
          g = bc.g + (hG - bc.g) * Math.min(1, li) * 1.0
          b = bc.b + (hB - bc.b) * Math.min(1, li) * 1.0
        }

        cArr[idx]     = r
        cArr[idx + 1] = g
        cArr[idx + 2] = b
      }
      pa.needsUpdate = true
      ca.needsUpdate = true
      ;(line.material as LineBasicMaterial).opacity = (d.opacity + (0.45 - d.opacity) * waveGF) * baseDepthFade * gridOpacityMult

      // 同步水幕顶边 + 底边 Y 到波浪曲线
      const cMesh = curtainMeshes[i]
      if (cMesh && cMesh.visible) {
        const cPosArr = (cMesh.geometry.attributes.position.array as Float32Array)
        const vCount = d.segCount + 1
        for (let j = 0; j < vCount; j++) {
          cPosArr[j * 3 + 1] = pArr[j * 3 + 1]           // 顶边 = 波浪线 Y
          cPosArr[(vCount + j) * 3 + 1] = CURTAIN_BOTTOM_Y + dropY  // 底边同步下落
        }
        cMesh.geometry.attributes.position.needsUpdate = true
      }
    }
  })

  return (
    <group>
      {curtainMeshes.map((m, i) => (
        <primitive key={`c-${i}`} object={m} />
      ))}
      {waveLines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  )
}
