import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh, SphereGeometry, MeshBasicMaterial, Matrix4, Color, Vector3, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useRealtimeStore, type PlanetCoords } from '../stores/realtimeStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { calcAppearance } from '../behaviors/useAppearanceFade'
import { calcOcclusionFade } from '../behaviors/useOcclusionFade'
import { calcScreenSpaceHover } from '../behaviors/useScreenSpaceHover'
import { smoothstep, clamped, SCENE_CENTER_Z, WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { type ParticleData } from '../types'

// ============================================================
// 共享状态 — PlanetClickHandler + Act3ContentPhase + PlanetLabel 消费
// ============================================================

export const _planetWorldPositions: (Vector3 | null)[] = [null, null, null]
export let _mainPlanetIndices: number[] = []

/**
 * Planets — 3 颗主行星（独立 Mesh，非 InstancedMesh）。
 *
 * renderOrder = 1, depthWrite = true，与碎片（renderOrder=2）分属不同渲染管线。
 * 原 DustField 中行星逻辑剥离至此处。
 *
 * 援引：
 *   混合方案（TECH_STACK_EVALUATION.md 第十节）
 *   R3F InstancedMesh + individual <mesh> for interactive objects
 */
export default function Planets() {
  const { camera } = useThree()
  const { shouldSkip } = useFrameCache()

  // Pre-allocated reusable objects
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color('#f0f8ff')).current
  const _colorAct3 = useRef(new Color('#64748b')).current

  // ---- Create 3 planet meshes (one-time) ----
  const { mainPlanets, mainPlanetIndices, particleData } = useMemo(() => {
    const count = 83
    const dustConfigs: { scale: number; sizeBoost: number; totalSize: number }[] = []

    // Re-create the same deterministic config that DustField uses for planet index selection
    for (let i = 0; i < count; i++) {
      const scale = 0.4 + Math.random() * 0.8
      const sizeBoost = Math.random() < 0.60 ? 1.5 + Math.random() * 2.5 : 0.7 + Math.random() * 0.8
      dustConfigs.push({ scale, sizeBoost, totalSize: scale * sizeBoost })
    }

    const sorted = dustConfigs.map((c, i) => ({ idx: i, size: c.totalSize }))
      .sort((a, b) => b.size - a.size)
    const planetIndices = sorted.slice(0, ORBIT_COUNT).map(s => s.idx)

    const highPolyGeo = new SphereGeometry(0.015, 32, 32)
    const planets: Mesh[] = []
    const data: ParticleData[] = []

    for (let i = 0; i < count; i++) {
      const isMain = planetIndices.includes(i)
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

      const orbitR = isMain
        ? ORBIT_RADII[planetIndices.indexOf(i)]
        : 2.5 + Math.random() * 4.5
      const orbitSpeed = isMain
        ? -0.04 - planetIndices.indexOf(i) * 0.015
        : -(0.03 + Math.random() * 0.08)

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
        scaleMult: isMain ? 2.4 + planetIndices.indexOf(i) * 0.2 : 0.4 + Math.random() * 0.9,
        isMainPlanet: isMain,
        hoverFactor: 0.0,
        orbitTilt: 0,
        flattenY: 1.0,
      }

      data.push(particle)

      if (isMain) {
        const geo = highPolyGeo.clone()
        const mat = new MeshBasicMaterial({ color: '#f0f8ff', transparent: true, opacity: 0, depthWrite: true, depthTest: true })
        const mesh = new Mesh(geo, mat)
        mesh.renderOrder = 1
        mesh.position.set(wx, wy, wz)
        const trackIdx = planetIndices.indexOf(i)
        mesh.name = `planet_${trackIdx}`
        planets.push(mesh)
      }
    }

    _mainPlanetIndices = planetIndices

    return { mainPlanets: planets, mainPlanetIndices: planetIndices, particleData: data }
  }, [])

  // ---- Per-frame planet animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const wof = clamped(sp, WHITE_OUT_THRESHOLD, WHITE_OUT_END)
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z
    const { hoveredIdx, focusedPlanetIdx } = useScrollStore.getState()

    // Focused planet world position for occlusion
    let focusedPlanetPos: Vector3 | null = null
    if (focusedPlanetIdx >= 0) {
      const fti = mainPlanetIndices.indexOf(focusedPlanetIdx)
      if (fti >= 0) focusedPlanetPos = _planetWorldPositions[fti]
    }

    for (let i = 0; i < particleData.length; i++) {
      const d = particleData[i]
      if (!d.isMainPlanet) continue

      // Hover/focus target
      const targetHover = (i === hoveredIdx && act3Progress >= 0.95) ? 1.0 : 0.0
      d.hoverFactor += (targetHover - d.hoverFactor) * 0.10

      // Position
      const { x: px, y: py, z: pz } = calcOrbitPosition(d, time, delta, cx, cy, cz, smooth3)

      // Distance for appearance
      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(camera.position)

      // Appearance
      const appearance = calcAppearance(d, sp, wof, smooth3, cd, 0)

      // Color
      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, appearance.wofFactor).lerp(_colorAct3, appearance.act3Factor)

      const trackIdx = mainPlanetIndices.indexOf(i)
      const mesh = mainPlanets[trackIdx]
      if (!mesh) continue

      mesh.position.set(px, py, pz)
      mesh.scale.setScalar(appearance.scale)

      // Track world position for camera focus + label following
      if (trackIdx >= 0 && trackIdx < 3) {
        if (!_planetWorldPositions[trackIdx]) _planetWorldPositions[trackIdx] = new Vector3()
        _planetWorldPositions[trackIdx]!.copy(mesh.position)
      }

      // Publish planet coords + orbit data to realtime store
      const store = useRealtimeStore.getState()
      const coords = [...store.planetCoords] as [PlanetCoords, PlanetCoords, PlanetCoords]
      const angles = [...store.planetAngles] as [number, number, number]
      const speeds = [...store.planetSpeeds] as [number, number, number]
      const orbAngles = [...store.orbitAngles] as [number, number, number]
      if (trackIdx >= 0 && trackIdx < 3) {
        coords[trackIdx] = { x: px, y: py, z: pz }
        angles[trackIdx] = d.orbitAngle
        speeds[trackIdx] = d._baseSpeed ?? d.orbitSpeed
      }
      for (let oi = 0; oi < 3; oi++) {
        orbAngles[oi] = (orbAngles[oi] + delta * store.orbitSpeeds[oi]) % (Math.PI * 2)
      }
      store.setPlanetData(coords, angles, speeds, store.orbitSpeeds, orbAngles as [number, number, number])

      // Opacity with occlusion
      const mat = mesh.material as MeshBasicMaterial
      let planetOpacity = appearance.opacity
      if (focusedPlanetPos && focusedPlanetIdx >= 0 && i !== focusedPlanetIdx) {
        _scratch.set(px, py, pz)
        planetOpacity = calcOcclusionFade(_scratch, camera as PerspectiveCamera, focusedPlanetPos, appearance.scale, appearance.opacity)
      }
      mat.opacity = planetOpacity
      mat.color.copy(_scratch2)
    }

    // ---- Hover detection ----
    const hoverResult = calcScreenSpaceHover(
      camera as PerspectiveCamera,
      _planetWorldPositions,
      _mouseNDC.current,
      _hoverState.current,
      act3Progress,
    )
    _hoverState.current = hoverResult
    if (hoverResult.currentIdx !== useScrollStore.getState().hoveredIdx) {
      useScrollStore.getState().setHoveredIdx(hoverResult.currentIdx)
    }
  })

  // ---- Mouse move for hover NDC tracking ----
  const _mouseNDC = useRef({ x: 999, y: 999 })
  const _hoverState = useRef({ currentIdx: -1, hovering: false })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onMouseMove = (e: MouseEvent) => {
      _mouseNDC.current.x = (e.clientX / window.innerWidth) * 2 - 1
      _mouseNDC.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  return (
    <group>
      {mainPlanets.map((mesh, idx) => (
        <primitive key={`planet-${idx}`} object={mesh} />
      ))}
    </group>
  )
}
