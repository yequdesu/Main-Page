import { useMemo, useRef, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh, type InstancedMesh, SphereGeometry, MeshBasicMaterial, Matrix4, Color, Vector3 } from 'three'
import Planet from './Planet'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, SCENE_CENTER_Z, WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { PLANET_LINKS, type ParticleData } from '../types'

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
  const { camera } = useThree()
  const { shouldSkip } = useFrameCache()

  // Pre-allocated reusable objects (from LighthouseScene.vue)
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color('#f0f8ff')).current
  const _colorAct3 = useRef(new Color('#64748b')).current
  const _matrix = useRef(new Matrix4()).current
  const _position = useRef(new Vector3()).current
  const _quaternion = useRef({ x: 0, y: 0, z: 0, w: 1 } as any).current
  const _scale = useRef(new Vector3()).current
  const _dustBwo = useRef(new Vector3()).current
  const _dustBeamDir = useRef(new Vector3()).current
  const _dustToP = useRef(new Vector3()).current
  const _dustPp = useRef(new Vector3()).current

  // ---- Create particle data + meshes (one-time, like useMemo) ----
  const { mainPlanets, particleData, mainPlanetIndices } = useMemo(() => {
    const count = 135
    const dustConfigs: { scale: number; sizeBoost: number; totalSize: number }[] = []

    for (let i = 0; i < count; i++) {
      const scale = 0.4 + Math.random() * 0.8
      const sizeBoost = Math.random() < 0.60 ? 1.5 + Math.random() * 2.5 : 0.7 + Math.random() * 0.8
      dustConfigs.push({ scale, sizeBoost, totalSize: scale * sizeBoost })
    }

    const sorted = dustConfigs.map((c, i) => ({ idx: i, size: c.totalSize }))
      .sort((a, b) => b.size - a.size)
    const planetIndices = sorted.slice(0, ORBIT_COUNT).map(s => s.idx)

    const lowPolyGeo = new SphereGeometry(0.015, 10, 8)
    const highPolyGeo = new SphereGeometry(0.015, 32, 32)

    const planets: Mesh[] = []
    const data: ParticleData[] = []
    const debrisMatrices: number[] = [] // flat matrix16 per debris

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
      } else {
        // Debris — stored for InstancedMesh
        debrisMatrices.push(wx, 0, 0, 0, 0, wy, 0, 0, 0, 0, wz, 0, 0, 0, 0, 1) // simplified — full matrix built per-frame
      }
    }

    return {
      mainPlanets: planets,
      particleData: data,
      mainPlanetIndices: planetIndices,
    }
  }, [])

  // ---- Debris InstancedMesh ref ----
  const debrisRef = useRef<InstancedMesh>(null)

  // ---- Click handler ----
  const handlePlanetClick = useCallback((trackIdx: number) => {
    const { focusedPlanetIdx } = useScrollStore.getState()
    if (focusedPlanetIdx === mainPlanetIndices[trackIdx]) {
      // Second click → open URL
      window.open(PLANET_LINKS[trackIdx].url, '_blank', 'noopener')
    } else {
      // First click → focus
      useScrollStore.getState().setFocusedPlanet(mainPlanetIndices[trackIdx])
      useScrollStore.getState().setFocusStartTime(performance.now() * 0.001)
    }
  }, [mainPlanetIndices])

  // ---- Per-frame animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const wof = clamped(sp, WHITE_OUT_THRESHOLD, WHITE_OUT_END)
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z

    for (let i = 0; i < particleData.length; i++) {
      const d = particleData[i]

      // Hover/focus target
      const { hoveredIdx } = useScrollStore.getState()
      const targetHover = (i === hoveredIdx && act3Progress >= 0.95) ? 1.0 : 0.0
      d.hoverFactor += (targetHover - d.hoverFactor) * 0.10

      // Act 1 float
      const bx = d.wx + Math.sin(time * 0.4 + d.ph) * 0.25
      const by = d.wy + Math.sin(time * 0.3 + d.ph + 1) * 0.18
      const bz = d.wz + Math.sin(time * 0.25 + d.ph + 2) * 0.15

      // Act 3 orbit
      const effectiveSpeed = d._baseSpeed * (1.0 - d.hoverFactor * 0.80)
      d.orbitAngle += delta * effectiveSpeed
      const wobbleR = d.isMainPlanet ? d.orbitR : d.orbitR + Math.sin(time * (d.wobbleFreq ?? 0.3) + d.ph) * (d.wobbleAmp ?? 1)
      const ox = cx + Math.cos(d.orbitAngle) * wobbleR
      const oz = cz + Math.sin(d.orbitAngle) * wobbleR

      // Position
      const px = bx + (ox - bx) * smooth3
      const py = by + (cy - by) * smooth3
      const pz = bz + (oz - bz) * smooth3

      // Distance for scale calc
      const refPos = d.isMainPlanet ? camera.position : new Vector3(0, 0.25, 8)
      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(refPos)
      const ds = 22 / Math.max(5, cd)

      // Beam factor (simplified — full version needs beamPivot world position)
      let bf = 0

      // Scale
      const scaleAct1 = d.scale * (0.4 + bf * 2) * ds
      const scaleAct2 = d.scale * 0.7 * d.sizeBoost * ds
      const scaleAct3 = scaleAct2 * d.scaleMult
      let s = scaleAct1 + (scaleAct2 - scaleAct1) * wof
      s = s + (scaleAct3 - s) * smooth3
      s *= (1.0 + d.hoverFactor * 0.35)

      // Opacity
      let opacityAct1 = (0.14 + bf * 0.76) * (0.35 + sp * 0.65)
      if (cd < 7) opacityAct1 *= Math.max(0, (cd - 2.5) / 4.5)
      if (cd > 42) opacityAct1 *= Math.max(0, 1 - (cd - 42) / 10)
      const opacityAct2 = 0.4
      const opacityAct3 = d.isMainPlanet ? 1.0 : 0.55
      let opacity = opacityAct1 + (opacityAct2 - opacityAct1) * wof
      opacity = opacity + (opacityAct3 - opacity) * smooth3

      // Color
      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, wof).lerp(_colorAct3, smooth3)

      // Apply to mesh
      if (d.isMainPlanet) {
        const planetIdx = mainPlanetIndices.indexOf(i)
        const mesh = mainPlanets[planetIdx]
        if (mesh) {
          mesh.position.set(px, py, pz)
          mesh.scale.setScalar(s)
          const mat = mesh.material as MeshBasicMaterial
          mat.opacity = opacity
          mat.color.copy(_scratch2)
        }
      } else if (debrisRef.current) {
        const debrisIdx = i - mainPlanetIndices.filter(idx => idx < i).length
        _matrix.compose(
          _position.set(px, py, pz),
          _quaternion,
          _scale.set(s, s, s),
        )
        debrisRef.current.setMatrixAt(debrisIdx, _matrix)
      }
    }

    if (debrisRef.current) {
      debrisRef.current.instanceMatrix.needsUpdate = true
    }
  })

  // ---- Mouse move for hover detection ----
  const _mouseNDC = useRef({ x: 999, y: 999 })
  const onMouseMove = useCallback((e: MouseEvent) => {
    _mouseNDC.current.x = (e.clientX / window.innerWidth) * 2 - 1
    _mouseNDC.current.y = -(e.clientY / window.innerHeight) * 2 + 1
  }, [])

  // Register mousemove handler
  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', onMouseMove)
  }

  return (
    <group>
      {/* 3 main planets as individual Mesh components */}
      {mainPlanets.map((mesh, idx) => (
        <Planet
          key={`planet-${idx}`}
          ref={(el) => { if (el) mainPlanets[idx] = el }}
          onClick={() => handlePlanetClick(idx)}
        />
      ))}

      {/* 132 debris as InstancedMesh */}
      <instancedMesh
        ref={debrisRef}
        args={[undefined as any, undefined as any, 132]}
        renderOrder={2}
      >
        <sphereGeometry args={[0.015, 10, 8]} />
        <meshBasicMaterial color="#f0f8ff" transparent opacity={0} depthWrite={false} depthTest />
      </instancedMesh>
    </group>
  )
}
