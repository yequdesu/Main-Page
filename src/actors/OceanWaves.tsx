import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, Color, BufferGeometry, BufferAttribute, LineBasicMaterial, Mesh, MeshBasicMaterial, DoubleSide } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { SCENE_CENTER_Z, smoothstep, clamped } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { readBeamWorldDirection, readBeamWorldOrigin } from '../composition/coreAnchors'
import type { WaveLineData, WaveBaseColor } from '../types'
import { containOceanX, getMiniatureTransform } from '../behaviors/miniatureUniverse'

const CURTAIN_BOTTOM_Y = -10
const REEF_DEPTH_WAVE_INDEX = 24
const REEF_DEPTH_Z = SCENE_CENTER_Z + 2.45
const REEF_DEPTH_HALF_WIDTH = 3.5
const REEF_DEPTH_SEGMENTS = 64
const DEFAULT_BEAM_ORIGIN = { x: 0, y: -0.428, z: SCENE_CENTER_Z }
const DEFAULT_BEAM_DIRECTION = { x: 0, y: 0, z: 1 }

/**
 * 海洋波浪�?�?30 �?Line + 水幕遮罩，逐顶点动画�?
 *
 * 每条波浪线下方延伸一个不透明水幕（三角形条带），
 * 顶边跟随波浪曲线，底边固定。水幕先写深度缓冲，
 * 遮挡�?Z 轴后方所有画面�?
 *
 * �?buildOcean():227-265 + animateWavesAndLighting():511-589
 * 30 条线 × 151 顶点 = 4530 个顶�?帧�?
 * 深蓝海军底色 + 深度相关透明度，逐字保留自原版�?
 *
 * 援引：R3F <threeLine> + bufferGeometry（逐顶点位�?颜色更新�?
 */
export default function OceanWaves() {
  useActorRuntime('waves', true)
  const lineLayer = getWebglLayer('webgl.oceanLines')
  const curtainDepthLayer = getWebglLayer('webgl.oceanCurtainDepth')
  const curtainLayer = getWebglLayer('webgl.oceanCurtain')
  const { waveLines, waveData, waveBaseColors, curtainMeshes, reefCurtainMeshes, curtainDepthMeshes } = useMemo(() => {
    const TOTAL = 30, POWER = 2.2
    const lines: Line[] = []
    const curtains: Mesh[] = []
    const reefCurtains: Mesh[] = []
    const depthCurtains: Mesh[] = []
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
      const opacity = 0.15 + curveT * 0.55   // 0.15�?.70 深度分层
      const span = 45 + curveT * 35

      const r = Math.floor(6 + curveT * 12)       // 6�?8  深蓝 navy
      const g = Math.floor(12 + curveT * 18)      // 12�?0
      const b = Math.floor(26 + curveT * 24)      // 26�?0
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
      const mat = new LineBasicMaterial({
        vertexColors: true,
        transparent: lineLayer.transparent,
        depthWrite: lineLayer.depthWrite,
        depthTest: lineLayer.depthTest,
      })
      const line = new Line(geom, mat)
      line.renderOrder = lineLayer.renderOrder
      lines.push(line)

      // ---- 水幕遮罩：三角形条带，顶�?波浪曲线，底�?CURTAIN_BOTTOM_Y ----
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
      const cMat = new MeshBasicMaterial({
        color: '#1c232b',
        transparent: curtainLayer.transparent,
        opacity: 0.90,
        depthWrite: curtainLayer.depthWrite,
        depthTest: curtainLayer.depthTest,
        side: DoubleSide,
      })
      const cMesh = new Mesh(cGeom, cMat)
      cMesh.renderOrder = curtainLayer.renderOrder
      curtains.push(cMesh)

      // ------------------------------------------------------------

      data.push({ baseY, z, amplitude, frequency, speed, phase, span, segCount, opacity })
    }

    // A depth-only waterline is placed immediately in front of the imported
    // reef. The old implementation borrowed a far ocean curtain; because the
    // reef spans several Z layers, that curtain could slice through the rock
    // while still leaving the front face visible. This local mask only covers
    // the lighthouse footprint and lets the layered ocean remain untouched.
    const reefWave = data[REEF_DEPTH_WAVE_INDEX]
    const vCount = REEF_DEPTH_SEGMENTS + 1
    const depthPositions = new Float32Array(vCount * 2 * 3)
    for (let j = 0; j < vCount; j++) {
      const x = (j / REEF_DEPTH_SEGMENTS - 0.5) * REEF_DEPTH_HALF_WIDTH * 2
      depthPositions[j * 3] = x
      depthPositions[j * 3 + 1] = reefWave.baseY
      depthPositions[j * 3 + 2] = REEF_DEPTH_Z
      const bottomIndex = (vCount + j) * 3
      depthPositions[bottomIndex] = x
      depthPositions[bottomIndex + 1] = CURTAIN_BOTTOM_Y
      depthPositions[bottomIndex + 2] = REEF_DEPTH_Z
    }
    const depthIndices: number[] = []
    for (let j = 0; j < REEF_DEPTH_SEGMENTS; j++) {
      const topLeft = j
      const topRight = j + 1
      const bottomLeft = vCount + j
      const bottomRight = vCount + j + 1
      depthIndices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight)
    }
    const depthGeom = new BufferGeometry()
    depthGeom.setAttribute('position', new BufferAttribute(depthPositions, 3))
    depthGeom.setIndex(depthIndices)
        const depthMat = new MeshBasicMaterial({
          color: '#000000',
          colorWrite: false,
          // Keep the pre-pass completely invisible even on renderers that
          // defer the color-write flag until the material is first compiled.
          transparent: true,
          opacity: 0,
          depthWrite: curtainDepthLayer.depthWrite,
      depthTest: curtainDepthLayer.depthTest,
      side: DoubleSide,
    })
    const depthMesh = new Mesh(depthGeom, depthMat)
    depthMesh.renderOrder = curtainDepthLayer.renderOrder
    depthCurtains.push(depthMesh)

    // The depth pre-pass deliberately has no color. Put a matching local
    // water curtain just in front of it so the cleared background never shows
    // through the masked area; this is the water volume that hides the reef.
    const reefCurtainGeom = depthGeom.clone()
    const reefCurtainMat = new MeshBasicMaterial({
      color: '#1c232b',
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      depthTest: curtainLayer.depthTest,
      side: DoubleSide,
    })
    const reefCurtain = new Mesh(reefCurtainGeom, reefCurtainMat)
    reefCurtain.position.z = 0.035
    reefCurtain.renderOrder = curtainLayer.renderOrder
    reefCurtains.push(reefCurtain)

    return {
      waveLines: lines,
      waveData: data,
      waveBaseColors: baseColors,
      curtainMeshes: curtains,
      reefCurtainMeshes: reefCurtains,
      curtainDepthMeshes: depthCurtains,
    }
  }, [
    curtainDepthLayer.depthTest,
    curtainDepthLayer.depthWrite,
    curtainDepthLayer.renderOrder,
    curtainDepthLayer.transparent,
    curtainLayer.depthTest,
    curtainLayer.depthWrite,
    curtainLayer.renderOrder,
    curtainLayer.transparent,
    lineLayer.depthTest,
    lineLayer.depthWrite,
    lineLayer.renderOrder,
    lineLayer.transparent,
  ])

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
      reefCurtainMeshes.forEach(m => {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
      })
      curtainDepthMeshes.forEach(m => {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
      })
    }
  }, [waveLines, curtainMeshes, reefCurtainMeshes, curtainDepthMeshes])

  const { shouldSkip } = useFrameCache()
  const wavesVisibleRef = useRef(true)
  const targetCol = useMemo(() => new Color('#94a3b8'), [])

  useFrame((state, _delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    touchActorFrame('waves', Math.round(time * 60), sp < TIMELINE.wavesAct3Fade.end)
    if (shouldSkip(time, sp)) return

    const act3Progress = clamped(sp, TIMELINE.act3Shift.start, 1.0)
    const smooth3 = smoothstep(act3Progress)
    const gridOpacityMult = 1.0 - smooth3

    // Bulk visibility
    if (gridOpacityMult < 0.001) {
      if (wavesVisibleRef.current) {
        waveLines.forEach(l => l.visible = false)
        curtainMeshes.forEach(m => m.visible = false)
        reefCurtainMeshes.forEach(m => m.visible = false)
        curtainDepthMeshes.forEach(m => m.visible = false)
        wavesVisibleRef.current = false
      }
      return
    } else if (!wavesVisibleRef.current) {
      waveLines.forEach(l => l.visible = true)
      curtainMeshes.forEach(m => m.visible = true)
      reefCurtainMeshes.forEach(m => m.visible = true)
      curtainDepthMeshes.forEach(m => m.visible = true)
      wavesVisibleRef.current = true
    }

    const hlWeight = Math.max(0, Math.min(1, (TIMELINE.miniatureShrink.start - sp) / 0.10))
    const CASCADE_START = TIMELINE.wavesCascade.start
    const CASCADE_END = TIMELINE.wavesCascade.end
    const baseGridFactor = clamped(sp, CASCADE_START, CASCADE_END)
    const shiftY = -32.0 * smooth3
    const miniatureContainment = getMiniatureTransform(sp).containment
    const beamWorldOrigin = readBeamWorldOrigin() ?? DEFAULT_BEAM_ORIGIN
    const beamWorldDirection = readBeamWorldDirection() ?? DEFAULT_BEAM_DIRECTION

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
      // 远处 (zNorm=0) �?0.24 开始；近处 (zNorm=1) �?0.60 开�?
      const zNorm = (rawZ + 52) / 57  // 0(�? �?1(�?
      const dropStart = CASCADE_START + zNorm * (TIMELINE.gridExtend.start - CASCADE_START)  // 0.24�?.60
      const waveGF = clamped(sp, dropStart, CASCADE_END)  // 每层独立起止
      const dropY = -40.0 * waveGF  // 每层下落出画�?

      for (let j = 0; j <= d.segCount; j++) {
        const idx = j * 3
        const originalX = (j / d.segCount - 0.5) * d.span * 2
        const x = containOceanX(originalX, miniatureContainment)
        pArr[idx] = x
        const tWave = time * d.speed + d.phase
        const waveY = d.baseY +
          Math.sin(originalX * d.frequency + tWave) * d.amplitude +
          Math.sin(originalX * d.frequency * 1.8 + tWave * 1.2) * d.amplitude * 0.4

        pArr[idx + 1] = waveY + (d.baseY - waveY) * waveGF + shiftY + dropY

        // ---- Volumetric spotlight: per-vertex color highlight ----
        // �?animateWavesAndLighting():106-122
        // 椭圆光束截面 + 高斯衰减，per-vertex 推向暖蓝白高�?
        let r = bc.r, g = bc.g, b = bc.b
        if (hlWeight > 0) {
          const vx = x - beamWorldOrigin.x
          const vy = waveY - beamWorldOrigin.y
          const vz = rawZ - beamWorldOrigin.z
          const proj = vx * beamWorldDirection.x + vy * beamWorldDirection.y + vz * beamWorldDirection.z
          const localX = vx * beamWorldDirection.z - vz * beamWorldDirection.x
          const beamR = 2.0 + Math.max(0, proj) * 0.25    // �?光束更宽、扩散更�?
          const distSq = (localX * localX) / (beamR * beamR) + (vy * vy) / 3.0  // �?垂直衰减更小
          let di = Math.exp(-distSq * 0.35)               // �?外晕更柔、扩散更�?
          di *= Math.max(0, Math.min(1, (proj + 2) / 10))  // 近场截止更宽�?
          di *= Math.max(0, 1 - (Math.max(0, proj) / 64))  // 远场延伸到更�?
          let li = di * 1.2 * hlWeight                     // 适中亮度，外晕柔�?
          if (beamWorldDirection.z > 0 && vz > 0) {
            li += di * Math.exp(-(x * x) / 10) * beamWorldDirection.z * 1.5 * hlWeight
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

      // 同步水幕顶边 + 底边 Y 到波浪曲�?
      const cMesh = curtainMeshes[i]
      if (cMesh && cMesh.visible) {
        const cPosArr = (cMesh.geometry.attributes.position.array as Float32Array)
        const vCount = d.segCount + 1
        for (let j = 0; j < vCount; j++) {
          cPosArr[j * 3] = pArr[j * 3]
          cPosArr[j * 3 + 1] = pArr[j * 3 + 1]           // 顶边 = 波浪�?Y
          cPosArr[(vCount + j) * 3] = pArr[j * 3]
          cPosArr[(vCount + j) * 3 + 1] = CURTAIN_BOTTOM_Y + dropY  // 底边同步下落
        }
        cMesh.geometry.attributes.position.needsUpdate = true

      }
    }

    // Animate the local reef mask from the same near wave that defines its
    // waterline. It follows the cascade, but never changes the depth of the
    // visible ocean curtains themselves.
    const reefWave = waveData[REEF_DEPTH_WAVE_INDEX]
    const reefDepthMesh = curtainDepthMeshes[0]
    const reefCurtainMesh = reefCurtainMeshes[0]
    if (reefDepthMesh) {
      const reefDepthPosition = reefDepthMesh.geometry.attributes.position
      const reefDepthArr = reefDepthPosition.array as Float32Array
      const reefCurtainPosition = reefCurtainMesh?.geometry.attributes.position
      const reefCurtainArr = reefCurtainPosition?.array as Float32Array | undefined
      const reefZNorm = (reefWave.z + 52) / 57
      const reefDropStart = CASCADE_START + reefZNorm * (TIMELINE.gridExtend.start - CASCADE_START)
      const reefWaveGF = clamped(sp, reefDropStart, CASCADE_END)
      const reefDropY = -40.0 * reefWaveGF
      for (let j = 0; j <= REEF_DEPTH_SEGMENTS; j++) {
        const idx = j * 3
        const x = reefDepthArr[idx]
        const tWave = time * reefWave.speed + reefWave.phase
        const waveY = reefWave.baseY +
          Math.sin(x * reefWave.frequency + tWave) * reefWave.amplitude +
          Math.sin(x * reefWave.frequency * 1.8 + tWave * 1.2) * reefWave.amplitude * 0.4
        reefDepthArr[idx + 1] = waveY + (reefWave.baseY - waveY) * reefWaveGF + shiftY + reefDropY
        reefDepthArr[(REEF_DEPTH_SEGMENTS + 1 + j) * 3 + 1] = CURTAIN_BOTTOM_Y + reefDropY
        if (reefCurtainArr) {
          reefCurtainArr[idx + 1] = reefDepthArr[idx + 1]
          reefCurtainArr[(REEF_DEPTH_SEGMENTS + 1 + j) * 3 + 1] = reefDepthArr[(REEF_DEPTH_SEGMENTS + 1 + j) * 3 + 1]
        }
      }
      reefDepthPosition.needsUpdate = true
      if (reefCurtainPosition) reefCurtainPosition.needsUpdate = true
    }
  })

  return (
    <group>
      {curtainDepthMeshes.map((m, i) => (
        <primitive key={`depth-${i}`} object={m} />
      ))}
      {reefCurtainMeshes.map((m, i) => (
        <primitive key={`reef-curtain-${i}`} object={m} />
      ))}
      {curtainMeshes.map((m, i) => (
        <primitive key={`c-${i}`} object={m} />
      ))}
      {waveLines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  )
}
