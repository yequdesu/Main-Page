import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh, SphereGeometry, MeshBasicMaterial, Matrix4, Color, Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { calcAppearance } from '../behaviors/useAppearanceFade'
import { calcOcclusionFade } from '../behaviors/useOcclusionFade'
import { calcScreenSpaceHover } from '../behaviors/useScreenSpaceHover'
import { smoothstep, clamped, SCENE_CENTER_Z, WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { type ParticleData } from '../types'

// Shared planet positions + indices — read by Act3ContentPhase for camera focus + labels
export const _planetWorldPositions: (Vector3 | null)[] = [null, null, null]
export let _mainPlanetIndices: number[] = []

// Pre-allocated default camera position for debris distance calc
const _defaultCamPos = new Vector3(0, 0.25, 8)

// Shared R3F clock time — updated per-frame, read by click handler for focusStartTime
let _r3fClockTime = 0

/**
 * 尘埃/粒子场 — 3 主行星 + InstancedMesh(132 碎片)。
 *
 * 原 buildDust():409-493 + animateDust():633-771
 * 最复杂的单个迁移目标。
 *
 * 援引：
 *   混合方案（TECH_STACK_EVALUATION.md 第十节）
 *   R3F InstancedMesh + individual <mesh> for interactive objects
 */
export default function DustField() {
  const { camera, gl } = useThree()
  const { shouldSkip } = useFrameCache()

  // Pre-allocated reusable objects (from LighthouseScene.vue)
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color('#f0f8ff')).current
  const _colorAct3 = useRef(new Color('#64748b')).current
  const _matrix = useRef(new Matrix4()).current
  const _position = useRef(new Vector3()).current
  const _quaternion = useRef(new Quaternion()).current
  const _scale = useRef(new Vector3()).current

  // ---- Create particle data + meshes (one-time, like useMemo) ----
  const { mainPlanets, particleData, mainPlanetIndices, debrisGrayHexes } = useMemo(() => {
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

    const highPolyGeo = new SphereGeometry(0.015, 32, 32)

    const planets: Mesh[] = []
    const data: ParticleData[] = []
    const debrisGrayHexes: string[] = []

    for (let i = 0; i < count; i++) {
      const isMain = planetIndices.includes(i)
      const cfg = dustConfigs[i]

      // Initial position around lighthouse beam origin
      const worldOrigin = new Vector3(0, -2.5 + 2.96 * 0.7, SCENE_CENTER_Z) // lighthouse Y ≈ -0.428
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
        ...(isMain ? {} : {
          wobbleAmp: 0.5 + Math.random() * 1.2,
          wobbleFreq: 0.3 + Math.random() * 0.4,
        }),
      }

      data.push(particle)

      if (!isMain) {
        debrisGrayHexes.push(grayHex)
      }

      if (isMain) {
        // Create a standalone mesh for main planets
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

    return {
      mainPlanets: planets,
      particleData: data,
      mainPlanetIndices: planetIndices,
      debrisGrayHexes,
    }
  }, [])

  // ---- Debris InstancedMesh2 (per-instance opacity + sorting) ----
  const debrisMesh = useMemo(() => {
    const geo = new SphereGeometry(0.015, 10, 8)
    const mat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, depthTest: true })
    const mesh = new InstancedMesh2(geo, mat, { capacity: 80, renderer: gl })
    mesh.renderOrder = 2
    mesh.sortObjects = true
    mesh.addInstances(80)
    return mesh
  }, [gl])
  const debrisRef = useRef<InstancedMesh2>(debrisMesh)

  // Initialize per-instance colors + trigger shader recompilation
  useEffect(() => {
    const mesh = debrisRef.current
    if (!mesh) return
    const _c = new Color()
    for (let i = 0; i < debrisGrayHexes.length; i++) {
      _c.set(debrisGrayHexes[i])
      mesh.setColorAt(i, _c)
    }
    // setColorAt creates colorsTexture but does NOT trigger shader recompile.
    // Without this, the first render uses a shader without instanced color/alpha support.
    ;(mesh as any).materialsNeedsUpdate?.()
  }, [debrisGrayHexes])

  // ---- Per-frame animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    _r3fClockTime = time
    if (shouldSkip(time, sp)) return

    const wof = clamped(sp, WHITE_OUT_THRESHOLD, WHITE_OUT_END)
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z
    const { hoveredIdx, focusedPlanetIdx } = useScrollStore.getState()

    // Get focused planet world position for occlusion (逐字保留自原版遮挡检测)
    let focusedPlanetPos: Vector3 | null = null
    if (focusedPlanetIdx >= 0) {
      const fti = mainPlanetIndices.indexOf(focusedPlanetIdx)
      if (fti >= 0) focusedPlanetPos = _planetWorldPositions[fti]
    }

    let debrisIdx = 0

    for (let i = 0; i < particleData.length; i++) {
      const d = particleData[i]

      // Hover/focus target
      const targetHover = (i === hoveredIdx && act3Progress >= 0.95) ? 1.0 : 0.0
      d.hoverFactor += (targetHover - d.hoverFactor) * 0.10

      // Position — extracted: useOrbitPosition
      const { x: px, y: py, z: pz } = calcOrbitPosition(d, time, delta, cx, cy, cz, smooth3)

      // Distance for appearance calc
      const refPos = d.isMainPlanet ? camera.position : _defaultCamPos
      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(refPos)

      // Beam factor (simplified — full version needs beamPivot world position)
      const bf = 0

      // Appearance — extracted: useAppearanceFade
      const appearance = calcAppearance(d, sp, wof, smooth3, cd, bf)

      // Convert wofFactor + act3Factor → Three.js Color
      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, appearance.wofFactor).lerp(_colorAct3, appearance.act3Factor)

      // Apply to mesh
      if (d.isMainPlanet) {
        const trackIdx = mainPlanetIndices.indexOf(i)
        const mesh = mainPlanets[trackIdx]
        if (mesh) {
          mesh.position.set(px, py, pz)
          // Track for camera focus + label following
          if (trackIdx >= 0 && trackIdx < 3) {
            if (!_planetWorldPositions[trackIdx]) _planetWorldPositions[trackIdx] = new Vector3()
            _planetWorldPositions[trackIdx]!.copy(mesh.position)
          }
          mesh.scale.setScalar(appearance.scale)
          const mat = mesh.material as MeshBasicMaterial
          // Occlusion: fade planet if it blocks view of focused planet (逐字保留自原版)
          let planetOpacity = appearance.opacity
          if (focusedPlanetPos && focusedPlanetIdx >= 0 && i !== focusedPlanetIdx) {
            _scratch.set(px, py, pz)
            planetOpacity = calcOcclusionFade(_scratch, camera as PerspectiveCamera, focusedPlanetPos, appearance.scale, appearance.opacity)
          }
          mat.opacity = planetOpacity
          mat.color.copy(_scratch2)
        }
      } else if (debrisRef.current) {
        _matrix.compose(
          _position.set(px, py, pz),
          _quaternion,
          _scale.set(appearance.scale, appearance.scale, appearance.scale),
        )
        debrisRef.current.setMatrixAt(debrisIdx, _matrix)
        debrisRef.current.setColorAt(debrisIdx, _scratch2)
        debrisRef.current.setOpacityAt(debrisIdx, appearance.opacity)
        debrisIdx++
      }
    }

    // InstancedMesh2 auto-manages buffer updates after setMatrixAt/setColorAt/setOpacityAt

    // Hover detection — extracted: useScreenSpaceHover
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

  // ---- Mouse move for hover detection ----
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
      {/* 3 main planets rendered directly from useMemo meshes (click via NDC projection) */}
      {mainPlanets.map((mesh, idx) => (
        <primitive key={`planet-${idx}`} object={mesh} />
      ))}

      {/* 132 debris as primitive (InstancedMesh2 created in useMemo) */}
      <primitive object={debrisMesh} />
    </group>
  )
}
