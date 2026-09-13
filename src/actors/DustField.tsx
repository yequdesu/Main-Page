import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, Color, Quaternion, Vector3, SphereGeometry, MeshBasicMaterial, type PerspectiveCamera } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import { useScrollStore } from '../stores/scrollStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { calcAppearance } from '../behaviors/useAppearanceFade'
import { smoothstep, clamped, SCENE_CENTER_Z, ORBIT_COUNT } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { type ParticleData } from '../types'

// Pre-allocated default camera position for debris distance calc
const _defaultCamPos = new Vector3(0, 0.25, 8)

/**
 * DustField — 碎片 InstancedMesh2（80 个）。
 *
 * renderOrder = 2, depthWrite = false。
 * 原 DustField 中行星 Mesh 已剥离至 Planets.tsx。
 *
 * 援引：
 *   混合方案（TECH_STACK_EVALUATION.md 第十节）
 *   R3F InstancedMesh + individual <mesh> for interactive objects
 */
export default function DustField() {
  useActorRuntime('debris', true)
  const { camera, gl } = useThree()
  const { shouldSkip } = useFrameCache()
  const layer = getWebglLayer('webgl.debris')

  // Pre-allocated reusable objects
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color('#f0f8ff')).current
  const _colorAct3 = useRef(new Color('#64748b')).current
  const _matrix = useRef(new Matrix4()).current
  const _position = useRef(new Vector3()).current
  const _quaternion = useRef(new Quaternion()).current
  const _scale = useRef(new Vector3()).current

  // ---- Create debris particle data + InstancedMesh2 (one-time) ----
  const { particleData, debrisGrayHexes } = useMemo(() => {
    const count = 83
    const dustConfigs: { scale: number; sizeBoost: number; totalSize: number }[] = []

    for (let i = 0; i < count; i++) {
      const scale = 0.4 + Math.random() * 0.8
      const sizeBoost = Math.random() < 0.60 ? 1.5 + Math.random() * 2.5 : 0.7 + Math.random() * 0.8
      dustConfigs.push({ scale, sizeBoost, totalSize: scale * sizeBoost })
    }

    const sorted = dustConfigs.map((c, i) => ({ idx: i, size: c.totalSize }))
      .sort((a, b) => b.size - a.size)
    const planetIndices = sorted.slice(0, ORBIT_COUNT).map(s => s.idx)

    const data: ParticleData[] = []
    const grayHexes: string[] = []

    for (let i = 0; i < count; i++) {
      const isMain = planetIndices.includes(i)
      if (isMain) continue // 行星由 Planets.tsx 管理

      const cfg = dustConfigs[i]

      const worldOrigin = new Vector3(0, -2.5 + 2.96 * 0.7, SCENE_CENTER_Z)
      const tt = Math.random()
      const zDist = 1 + tt * 41
      const maxR = (zDist / 42) * 7.5 + 0.2
      const angle = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * maxR
      const wx = worldOrigin.x + Math.cos(angle) * r
      const wy = worldOrigin.y + (Math.random() - 0.5) * maxR * 0.6
      const wz = worldOrigin.z + zDist

      const gray = Math.floor(100 + Math.random() * 60)
      const grayHex = '#' + gray.toString(16).padStart(2, '0').repeat(3)

      const orbitR = 2.5 + Math.random() * 4.5
      const orbitSpeed = -(0.03 + Math.random() * 0.08)

      const particle: ParticleData = {
        wx, wy, wz,
        dx: (Math.random() - 0.5) * 0.15,
        dy: (Math.random() - 0.5) * 0.1 + 0.06,
        dz: (Math.random() - 0.5) * 0.08,
        ph: Math.random() * Math.PI * 2,
        scale: cfg.scale,
        sizeBoost: cfg.sizeBoost,
        grayHex,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitR,
        orbitSpeed,
        _baseSpeed: orbitSpeed,
        scaleMult: 0.4 + Math.random() * 0.9,
        isMainPlanet: false,
        hoverFactor: 0.0,
        orbitTilt: 0,
        flattenY: 1.0,
        wobbleAmp: 0.5 + Math.random() * 1.2,
        wobbleFreq: 0.3 + Math.random() * 0.4,
      }

      data.push(particle)
      grayHexes.push(grayHex)
    }

    return { particleData: data, debrisGrayHexes: grayHexes }
  }, [])

  // ---- Debris InstancedMesh2 ----
  const debrisMesh = useMemo(() => {
    const geo = new SphereGeometry(0.015, 10, 8)
    const mat = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: layer.transparent,
      depthWrite: layer.depthWrite,
      depthTest: layer.depthTest,
    })
    const mesh = new InstancedMesh2(geo, mat, { capacity: 80, renderer: gl })
    mesh.renderOrder = layer.renderOrder
    mesh.sortObjects = true
    mesh.addInstances(80)
    return mesh
  }, [gl, layer.depthTest, layer.depthWrite, layer.renderOrder, layer.transparent])
  const debrisRef = useRef<InstancedMesh2>(debrisMesh)

  // Initialize per-instance colors
  useEffect(() => {
    const mesh = debrisRef.current
    if (!mesh) return
    const _c = new Color()
    for (let i = 0; i < debrisGrayHexes.length; i++) {
      _c.set(debrisGrayHexes[i])
      mesh.setColorAt(i, _c)
    }
    ;(mesh as any).materialsNeedsUpdate?.()
  }, [debrisGrayHexes])

  // ---- Per-frame debris animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    touchActorFrame('debris', Math.round(time * 60), true)
    if (shouldSkip(time, sp)) return

    const wof = clamped(sp, TIMELINE.whiteOut.start, TIMELINE.whiteOut.end)
    const act3Progress = clamped(sp, TIMELINE.act3Shift.start, 1.0)
    const smooth3 = smoothstep(act3Progress)

    const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z

    for (let i = 0; i < particleData.length; i++) {
      const d = particleData[i]

      const { x: px, y: py, z: pz } = calcOrbitPosition(d, time, delta, cx, cy, cz, smooth3)

      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(_defaultCamPos)

      const appearance = calcAppearance(d, sp, wof, smooth3, cd, 0)

      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, appearance.wofFactor).lerp(_colorAct3, appearance.act3Factor)

      _matrix.compose(
        _position.set(px, py, pz),
        _quaternion,
        _scale.set(appearance.scale, appearance.scale, appearance.scale),
      )
      debrisRef.current.setMatrixAt(i, _matrix)
      debrisRef.current.setColorAt(i, _scratch2)
      debrisRef.current.setOpacityAt(i, appearance.opacity)
    }

    // Publish camera + debris data to realtime store
    const cam = camera as PerspectiveCamera
    const lookDir = new Vector3()
    cam.getWorldDirection(lookDir)
    useRealtimeStore.getState().setCameraData({
      pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      look: { x: lookDir.x, y: lookDir.y, z: lookDir.z },
      fov: cam.fov,
    })
    useRealtimeStore.getState().setDebrisCount(80)
  })

  return (
    <primitive object={debrisMesh} />
  )
}
