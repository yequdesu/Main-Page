import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, Color, BufferGeometry, BufferAttribute, LineBasicMaterial, Vector3 } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_START, VERTICAL_START, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { _beamWorldOrigin, _beamWorldDirection } from './LightBeam'
import type { WaveLineData, WaveBaseColor } from '../types'

// 预分配 — 波面光束交运算
const _toVertex = new Vector3()
const _projOnBeam = new Vector3()

/**
 * 海洋波浪线 — 50 条 Line，逐顶点动画。
 *
 * 原 buildOcean():227-265 + animateWavesAndLighting():511-589
 * 50 条线 × 151 顶点 = 7550 个顶点/帧。
 *
 * 援引：R3F <threeLine> + bufferGeometry（逐顶点位置/颜色更新）
 */
export default function OceanWaves() {
  const { waveLines, waveData, waveBaseColors } = useMemo(() => {
    const TOTAL = 30, POWER = 2.2
    const lines: Line[] = []
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
      const opacity = 0.10
      const span = 45 + curveT * 35

      const v = Math.floor(200 + curveT * 55)
      const hex = '#' + v.toString(16).padStart(2, '0').repeat(3)
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
      const mat = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, depthTest: true })
      const line = new Line(geom, mat)
      line.renderOrder = 0
      lines.push(line)
      data.push({ baseY, z, amplitude, frequency, speed, phase, span, segCount, opacity })
    }
    return { waveLines: lines, waveData: data, waveBaseColors: baseColors }
  }, [])

  useEffect(() => {
    return () => {
      waveLines.forEach(line => {
        line.geometry.dispose()
        ;(line.material as LineBasicMaterial).dispose()
      })
    }
  }, [waveLines])

  const { shouldSkip } = useFrameCache()
  const wavesVisibleRef = useRef(true)
  const targetCol = useMemo(() => new Color('#ffffff'), [])

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
        wavesVisibleRef.current = false
      }
      return
    } else if (!wavesVisibleRef.current) {
      waveLines.forEach(l => l.visible = true)
      wavesVisibleRef.current = true
    }

    const hlWeight = Math.max(0, Math.min(1, (WHITE_OUT_THRESHOLD - sp) / 0.10))
    const gridFactor = clamped(sp, GRID_START, VERTICAL_START)
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
      let lineMaxBf = 0

      for (let j = 0; j <= d.segCount; j++) {
        const idx = j * 3
        const x = pArr[idx]
        const tWave = time * d.speed + d.phase
        const waveY = d.baseY +
          Math.sin(x * d.frequency + tWave) * d.amplitude +
          Math.sin(x * d.frequency * 1.8 + tWave * 1.2) * d.amplitude * 0.4

        pArr[idx + 1] = waveY + (d.baseY - waveY) * gridFactor + shiftY

        // Color: lerp from base to target based on gridFactor
        cArr[idx]     = bc.r + (targetCol.r - bc.r) * gridFactor
        cArr[idx + 1] = bc.g + (targetCol.g - bc.g) * gridFactor
        cArr[idx + 2] = bc.b + (targetCol.b - bc.b) * gridFactor

        // ---- Volumetric spotlight illumination ----
        // 聚合该线上所有顶点的最大 beamFactor
        const vy = pArr[idx + 1]
        _toVertex.set(x, vy, rawZ).sub(_beamWorldOrigin)
        const tBeam = _toVertex.dot(_beamWorldDirection)
        if (tBeam > 0 && tBeam < 42) {
          _projOnBeam.copy(_beamWorldDirection).multiplyScalar(tBeam)
          const distFromAxis = _toVertex.distanceTo(_projOnBeam)
          const beamRadius = tBeam * 0.14
          const softEdge = beamRadius * 1.6
          if (distFromAxis < softEdge) {
            const bf = distFromAxis < beamRadius
              ? 1.0
              : 1.0 - (distFromAxis - beamRadius) / (softEdge - beamRadius)
            if (bf > lineMaxBf) lineMaxBf = bf
          }
        }
      }
      pa.needsUpdate = true
      ca.needsUpdate = true
      // 透明度：基础 10%，光束扫过时平滑提升至 50%
      const baseOpacity = d.opacity + (0.45 - d.opacity) * gridFactor
      const litOpacity = 0.10 + lineMaxBf * 0.40  // 10% → 50%
      ;(line.material as LineBasicMaterial).opacity = (baseOpacity + (litOpacity - baseOpacity) * lineMaxBf) * baseDepthFade * gridOpacityMult
    }
  })

  return (
    <group>
      {waveLines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  )
}
