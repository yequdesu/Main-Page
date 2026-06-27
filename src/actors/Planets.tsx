import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh, SphereGeometry, MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial, BackSide, Sprite, SpriteMaterial, CanvasTexture, AdditiveBlending, LinearFilter, Color, Vector3, type PerspectiveCamera, type PointLight } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useRealtimeStore, type PlanetCoords } from '../stores/realtimeStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { calcAppearance } from '../behaviors/useAppearanceFade'
import { calcOcclusionFade } from '../behaviors/useOcclusionFade'
import { calcScreenSpaceHover } from '../behaviors/useScreenSpaceHover'
import { smoothstep, clamped, SCENE_CENTER_Z, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { atmosphereVertex, atmosphereFragment } from '../shaders/AtmosphereShader'
import { type ParticleData } from '../types'
import { WC_ANCHOR_Y, WC_DROP_START, WC_DROP_END, WC_RETRACT_END, getWindChimeProgress, getWindChimePlanetPhysicalPoint } from '../behaviors/useWindChime'
import { useScreenProjection } from '../behaviors/useScreenProjection'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { R3F_FRAME_PRIORITY } from '../composition/frameScheduler'
import {
  makeCoreAnchor,
  planetAtmosphereWorldRadiusAnchorId,
  planetOrbitAnchorId,
  planetParticleIndexAnchorId,
  planetScreenRadiusAnchorId,
  planetWorldAnchorId,
  pointFromVector3,
  setCoreAnchor,
  setCoreAnchors,
} from '../composition/coreAnchors'
import type { AnchorInput } from '../composition/anchorStore'

const PLANET_BASE_RADIUS = 0.015
const GEO_SEGMENTS = 32
const MAIN_PLANET_ORBIT_ANGLES = [4.0, 5.15, 5.35]

const ATMOS_SHELL_SCALE = 1.03
const ATMOS_SHELL_OPACITY = 0.35
const ATMOS_HALO_SCALE = 1.0
const ATMOS_HALO_OPACITY = 0.32
const INNER_GLOW_SCALE = 1.1
const INNER_GLOW_OPACITY = 0.20

const PLANET_CORE_COLOR = '#f0f8ff'
const INNER_GLOW_COLOR = '#f6f7f9'
const FRESNEL_SHELL_COLOR = '#d0d5de'
const COLOR_ACT1 = '#f0f8ff'
const COLOR_ACT3 = '#64748b'
const CENTRAL_STAR_Y = -1.0

const GLOW_PULSE_FREQ_1 = 0.26
const GLOW_PULSE_AMP_1 = 0.005
const GLOW_PULSE_FREQ_2 = 0.38
const GLOW_PULSE_AMP_2 = 0.005

const SPRITE_PULSE_FREQ_1 = 0.24
const SPRITE_PULSE_AMP_1 = 0.01
const SPRITE_PULSE_FREQ_2 = 0.36
const SPRITE_PULSE_AMP_2 = 0.01

const HALO_TEX_SIZE = 128
const HALO_COLOR_STOPS: [number, string][] = [
  [0,    'rgba(220,225,235,0.35)'],
  [0.15, 'rgba(200,210,225,0.18)'],
  [0.4,  'rgba(180,195,215,0.04)'],
  [0.7,  'rgba(160,175,200,0.005)'],
  [1,    'rgba(0,0,0,0)'],
]

let _haloTexture: CanvasTexture | null = null
function getHaloTexture(): CanvasTexture {
  if (_haloTexture) return _haloTexture
  const c = document.createElement('canvas')
  c.width = c.height = HALO_TEX_SIZE
  const ctx = c.getContext('2d')!
  const gradient = ctx.createRadialGradient(
    HALO_TEX_SIZE / 2, HALO_TEX_SIZE / 2, 0,
    HALO_TEX_SIZE / 2, HALO_TEX_SIZE / 2, HALO_TEX_SIZE / 2,
  )
  for (const [pos, color] of HALO_COLOR_STOPS) {
    gradient.addColorStop(pos, color)
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, HALO_TEX_SIZE, HALO_TEX_SIZE)
  _haloTexture = new CanvasTexture(c)
  _haloTexture.minFilter = LinearFilter
  return _haloTexture
}

/**
 * Three main planet meshes plus atmosphere and halo effects.
 */
export default function Planets() {
  useActorRuntime('planets', true)
  const { camera, gl } = useThree()
  const { project } = useScreenProjection()
  const { shouldSkip } = useFrameCache()
  const planetLayer = getWebglLayer('webgl.planets')
  const planetEffectsLayer = getWebglLayer('webgl.planetEffects')
  const planetHaloLayer = getWebglLayer('webgl.planetHalo')

  // Pre-allocated reusable objects
  const _scratch = useRef(new Vector3()).current
  const _starWorld = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _emissiveColor = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color(COLOR_ACT1)).current
  const _colorAct3 = useRef(new Color(COLOR_ACT3)).current
  const starLightRef = useRef<PointLight | null>(null)
  const planetWorldPositionsRef = useRef<(Vector3 | null)[]>([null, null, null])

  // ---- Create 3 planet meshes + atmosphere (one-time) ----
  const { mainPlanets, planetBasicMats, planetLitMats, innerGlows, atmosShells, haloSpriteMats, haloSprites, mainPlanetIndices, particleData } = useMemo(() => {
    const haloTexture = getHaloTexture()
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

    const highPolyGeo = new SphereGeometry(PLANET_BASE_RADIUS, GEO_SEGMENTS, GEO_SEGMENTS)
    const planets: Mesh[] = []
    const basicMats: MeshBasicMaterial[] = []
    const litMats: MeshStandardMaterial[] = []
    const innerGlows: Mesh[] = []
    const shells: Mesh[] = []
    const spriteMats: SpriteMaterial[] = []
    const sprites: Sprite[] = []
    const data: ParticleData[] = []

    for (let i = 0; i < count; i++) {
      const isMain = planetIndices.includes(i)
      const mainTrackIdx = isMain ? planetIndices.indexOf(i) : -1
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
        ? ORBIT_RADII[mainTrackIdx]
        : 2.5 + Math.random() * 4.5
      const orbitSpeed = isMain
        ? -0.04 - mainTrackIdx * 0.015
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
        orbitAngle: isMain ? MAIN_PLANET_ORBIT_ANGLES[mainTrackIdx] : Math.random() * Math.PI * 2,
        orbitR,
        orbitSpeed,
        _baseSpeed: orbitSpeed,
        scaleMult: isMain ? 2.4 + mainTrackIdx * 0.2 : 0.4 + Math.random() * 0.9,
        isMainPlanet: isMain,
        hoverFactor: 0.0,
        orbitTilt: 0,
        flattenY: 1.0,
      }

      data.push(particle)

      if (isMain) {
        const trackIdx = planetIndices.indexOf(i)

        // Planet core
        const geo = highPolyGeo.clone()
        const mat = new MeshBasicMaterial({
          color: PLANET_CORE_COLOR,
          transparent: planetLayer.transparent,
          opacity: 0,
          depthWrite: planetLayer.depthWrite,
          depthTest: planetLayer.depthTest,
        })
        const litMat = new MeshStandardMaterial({
          color: PLANET_CORE_COLOR,
          roughness: 0.96,
          metalness: 0,
          emissive: '#141b27',
          emissiveIntensity: 0.16,
          transparent: planetLayer.transparent,
          opacity: 0,
          depthWrite: planetLayer.depthWrite,
          depthTest: planetLayer.depthTest,
        })
        const mesh = new Mesh(geo, mat)
        mesh.renderOrder = planetLayer.renderOrder
        mesh.position.set(wx, wy, wz)
        mesh.name = `planet_${trackIdx}`
        planets.push(mesh)
        basicMats.push(mat)
        litMats.push(litMat)

        // Inner glow sphere (pulsing, depthWrite=false)
        const glowGeo = new SphereGeometry(PLANET_BASE_RADIUS * INNER_GLOW_SCALE, GEO_SEGMENTS, GEO_SEGMENTS)
        const glowMat = new MeshBasicMaterial({
          color: INNER_GLOW_COLOR,
          transparent: planetEffectsLayer.transparent,
          opacity: 0,
          depthWrite: planetEffectsLayer.depthWrite,
          depthTest: planetEffectsLayer.depthTest,
        })
        const glow = new Mesh(glowGeo, glowMat)
        glow.renderOrder = planetEffectsLayer.renderOrder
        glow.name = `glow_${trackIdx}`
        innerGlows.push(glow)

        // Fresnel atmosphere shell (BackSide)
        const shellGeo = new SphereGeometry(PLANET_BASE_RADIUS * ATMOS_SHELL_SCALE, GEO_SEGMENTS, GEO_SEGMENTS)
        const shellMat = new ShaderMaterial({
          vertexShader: atmosphereVertex,
          fragmentShader: atmosphereFragment,
          uniforms: { uOpacity: { value: 0 }, uColor: { value: new Color(FRESNEL_SHELL_COLOR) } },
          transparent: planetEffectsLayer.transparent,
          depthWrite: planetEffectsLayer.depthWrite,
          depthTest: planetEffectsLayer.depthTest,
          side: BackSide,
        })
        const shell = new Mesh(shellGeo, shellMat)
        shell.renderOrder = planetEffectsLayer.renderOrder
        shell.name = `atmos_${trackIdx}`
        shells.push(shell)

        // Sprite halo (shared texture, AdditiveBlending)
        const sMat = new SpriteMaterial({
          map: haloTexture, blending: AdditiveBlending,
          transparent: planetHaloLayer.transparent,
          opacity: 0,
          depthWrite: planetHaloLayer.depthWrite,
          depthTest: planetHaloLayer.depthTest,
        })
        const sprite = new Sprite(sMat)
        sprite.renderOrder = planetHaloLayer.renderOrder
        sprite.name = `halo_${trackIdx}`
        spriteMats.push(sMat)
        sprites.push(sprite)
      }
    }

    return {
      mainPlanets: planets, planetBasicMats: basicMats, planetLitMats: litMats, innerGlows, atmosShells: shells,
      haloSpriteMats: spriteMats, haloSprites: sprites,
      mainPlanetIndices: planetIndices, particleData: data,
    }
  }, [
    planetEffectsLayer.depthTest,
    planetEffectsLayer.depthWrite,
    planetEffectsLayer.renderOrder,
    planetEffectsLayer.transparent,
    planetHaloLayer.depthTest,
    planetHaloLayer.depthWrite,
    planetHaloLayer.renderOrder,
    planetHaloLayer.transparent,
    planetLayer.depthTest,
    planetLayer.depthWrite,
    planetLayer.renderOrder,
    planetLayer.transparent,
  ])

  useEffect(() => {
    mainPlanetIndices.forEach((particleIdx, trackIdx) => {
      setCoreAnchor(planetParticleIndexAnchorId(trackIdx), particleIdx, 'world', 'planets')
    })
  }, [mainPlanetIndices])

  // ---- Per-frame planet animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    touchActorFrame('planets', Math.round(time * 60), sp >= TIMELINE.planetVisible.start)
    if (shouldSkip(time, sp)) return

    const _screenRadii: [number, number, number] = [0, 0, 0]
    const anchorWrites: AnchorInput[] = []

    const wof = clamped(sp, TIMELINE.whiteOut.start, TIMELINE.whiteOut.end)
    const ORBIT_START = TIMELINE.gridRetract.end
    const act3Progress = clamped(sp, ORBIT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    const VISIBLE_START = TIMELINE.planetVisible.start
    const wc = getWindChimeProgress(sp)
    const inWindChime = wc.active
    const orbitSmooth3 = 1.0

    const cx = 0, cy = CENTRAL_STAR_Y, cz = SCENE_CENTER_Z
    const { hoveredIdx, focusedPlanetIdx, volumeLightEnabled } = useScrollStore.getState()
    _starWorld.set(cx, cy, SCENE_CENTER_Z + 6 * wc.smoothP)
    if (starLightRef.current) {
      const lightFactor = clamped(sp, TIMELINE.orbitGlow.start, TIMELINE.orbitGlow.end)
      starLightRef.current.position.copy(_starWorld)
      starLightRef.current.intensity = volumeLightEnabled ? 6.2 * lightFactor : 0
    }

    // Focused planet world position for occlusion
    let focusedPlanetPos: Vector3 | null = null
    if (focusedPlanetIdx >= 0) {
      const fti = mainPlanetIndices.indexOf(focusedPlanetIdx)
      if (fti >= 0) focusedPlanetPos = planetWorldPositionsRef.current[fti]
    }

    for (let i = 0; i < particleData.length; i++) {
      const d = particleData[i]
      if (!d.isMainPlanet) continue
      const trackIdx = mainPlanetIndices.indexOf(i)

      // Hover/focus target
      const targetHover = (i === hoveredIdx && act3Progress >= 0.95) ? 1.0 : 0.0
      d.hoverFactor += (targetHover - d.hoverFactor) * 0.10

      if (trackIdx >= 0 && sp < TIMELINE.orbitGlow.start) {
        d.orbitAngle = MAIN_PLANET_ORBIT_ANGLES[trackIdx]
      }

      // Position
      const freezeFocusedOrbit = i === focusedPlanetIdx && sp >= TIMELINE.act3Shift.start
      let { x: px, y: py, z: pz } = calcOrbitPosition(d, time, delta, cx, cy, cz, orbitSmooth3, freezeFocusedOrbit)
      const usingWindChimeLayout = trackIdx >= 0 && sp < TIMELINE.orbitGlow.start
      if (usingWindChimeLayout) {
        const point = getWindChimePlanetPhysicalPoint(trackIdx, wc.smoothP, time)
        px = point.x
        py = point.y
        pz = point.z
      }

      // Distance for appearance
      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(camera.position)

      const isMain = mainPlanetIndices.includes(i)
      const appearanceSmooth3 = isMain ? orbitSmooth3 : smooth3
      const appearance = calcAppearance(d, sp, wof, appearanceSmooth3, cd, 0)

      // Color
      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, appearance.wofFactor).lerp(_colorAct3, appearance.act3Factor)

      const mesh = mainPlanets[trackIdx]
      if (!mesh) continue

      if (trackIdx >= 0 && trackIdx < 3) {
        anchorWrites.push(makeCoreAnchor(planetOrbitAnchorId(trackIdx), { x: px, y: py, z: pz }, 'world', 'planets'))
      }

      mesh.position.set(px, py, pz)
      if (sp >= VISIBLE_START && sp < WC_DROP_END) {
        const dropOnly = clamped(sp, VISIBLE_START, WC_DROP_END)
        mesh.position.y = WC_ANCHOR_Y + (py - WC_ANCHOR_Y) * smoothstep(dropOnly)
      }
      if (inWindChime && !usingWindChimeLayout) {
        mesh.position.z += 6 * wc.smoothP
      }
      mesh.visible = sp >= VISIBLE_START
      mesh.scale.setScalar(appearance.scale)

      // Track world position
      if (trackIdx >= 0 && trackIdx < 3) {
        if (!planetWorldPositionsRef.current[trackIdx]) planetWorldPositionsRef.current[trackIdx] = new Vector3()
        planetWorldPositionsRef.current[trackIdx]!.copy(mesh.position)
        anchorWrites.push(makeCoreAnchor(planetWorldAnchorId(trackIdx), pointFromVector3(mesh.position), 'world', 'planets', mesh.visible))

        const _worldR = PLANET_BASE_RADIUS * appearance.scale * INNER_GLOW_SCALE
        const _pcam = camera as PerspectiveCamera
        const _fovY = (_pcam.fov * Math.PI) / 180
        const _finalCd = mesh.position.distanceTo(camera.position)
        const _screenR = (_worldR * gl.domElement.clientHeight) / (2 * _finalCd * Math.tan(_fovY / 2))
        _screenRadii[trackIdx] = Math.round(_screenR)
        anchorWrites.push(makeCoreAnchor(planetScreenRadiusAnchorId(trackIdx), _screenRadii[trackIdx], 'screenPx', 'planets', mesh.visible))

        const atmosphereWorldRadius = PLANET_BASE_RADIUS * ATMOS_SHELL_SCALE * appearance.scale
        anchorWrites.push(makeCoreAnchor(planetAtmosphereWorldRadiusAnchorId(trackIdx), atmosphereWorldRadius, 'world', 'planets', mesh.visible))
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
      const basicMat = planetBasicMats[trackIdx]
      const litMat = planetLitMats[trackIdx]
      const mat = volumeLightEnabled ? litMat : basicMat
      if (mesh.material !== mat) mesh.material = mat
      let planetOpacity = appearance.opacity
      if (focusedPlanetPos && focusedPlanetIdx >= 0 && i !== focusedPlanetIdx) {
        _scratch.set(px, py, pz)
        planetOpacity = calcOcclusionFade(_scratch, camera as PerspectiveCamera, focusedPlanetPos, appearance.scale, appearance.opacity)
      }

      const glowFactor = clamped(sp, TIMELINE.orbitGlow.start, TIMELINE.orbitGlow.end)
      mat.opacity = planetOpacity
      mat.color.copy(_scratch2)
      if (volumeLightEnabled) {
        litMat.emissive.copy(_emissiveColor.copy(_scratch2).multiplyScalar(0.2))
        litMat.emissiveIntensity = 0.14 + glowFactor * 0.06
      }

      // ---- Inner glow (pulse, follows core appearance scale) ----
      const glow = innerGlows[trackIdx]
      if (glow) {
        const gPulse = 1 + Math.sin(time * GLOW_PULSE_FREQ_1 + trackIdx * 2.1) * GLOW_PULSE_AMP_1 + Math.sin(time * GLOW_PULSE_FREQ_2 + trackIdx) * GLOW_PULSE_AMP_2
        glow.position.copy(mesh.position)
        glow.scale.setScalar(appearance.scale * gPulse)
        const gMat = glow.material as MeshBasicMaterial
        gMat.opacity = planetOpacity * INNER_GLOW_OPACITY * gPulse * glowFactor
      }

      // ---- Atmosphere shell (follows core appearance scale) ----
      const shell = atmosShells[trackIdx]
      if (shell) {
        shell.position.copy(mesh.position)
        shell.scale.setScalar(appearance.scale)
        const sMat = shell.material as ShaderMaterial
        sMat.uniforms.uOpacity.value = planetOpacity * ATMOS_SHELL_OPACITY * glowFactor
      }

      // ---- Halo sprite (pulse) ----
      const sMat2 = haloSpriteMats[trackIdx]
      const sprite = haloSprites[trackIdx]
      if (sprite && sMat2) {
        const pulse = 1 + Math.sin(time * SPRITE_PULSE_FREQ_1 + trackIdx * 2.1) * SPRITE_PULSE_AMP_1 + Math.sin(time * SPRITE_PULSE_FREQ_2 + trackIdx) * SPRITE_PULSE_AMP_2
        sprite.position.copy(mesh.position)
        const baseScale = d.scale * d.scaleMult * ATMOS_HALO_SCALE
        sprite.scale.set(baseScale * pulse, baseScale * pulse, 1)
        sMat2.opacity = planetOpacity * ATMOS_HALO_OPACITY * pulse * glowFactor
      }
    }

    // Publish world/screen anchors for downstream consumers.
    if (anchorWrites.length > 0) setCoreAnchors(anchorWrites)

    // Project planet world anchors to screen anchors for DOM labels/guides.
    project()

    // ---- Hover detection ----
    const hoverResult = calcScreenSpaceHover(
      camera as PerspectiveCamera,
      planetWorldPositionsRef.current,
      _mouseNDC.current,
      _hoverState.current,
      act3Progress,
    )
    _hoverState.current = hoverResult
    if (hoverResult.currentIdx !== useScrollStore.getState().hoveredIdx) {
      useScrollStore.getState().setHoveredIdx(hoverResult.currentIdx)
    }
  }, R3F_FRAME_PRIORITY.planetsProduce)

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
      <pointLight ref={starLightRef} color="#ffe4b8" intensity={0} distance={90} decay={1.35} />
      {mainPlanets.map((mesh, idx) => (
        <group key={`planet-group-${idx}`}>
          <primitive object={mesh} />
          <primitive object={innerGlows[idx]} />
          <primitive object={atmosShells[idx]} />
          <primitive object={haloSprites[idx]} />
        </group>
      ))}
    </group>
  )
}
