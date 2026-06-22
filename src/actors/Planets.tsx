import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh, SphereGeometry, MeshBasicMaterial, ShaderMaterial, BackSide, Sprite, SpriteMaterial, CanvasTexture, AdditiveBlending, LinearFilter, Color, Vector3, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useRealtimeStore, type PlanetCoords } from '../stores/realtimeStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { calcAppearance } from '../behaviors/useAppearanceFade'
import { calcOcclusionFade } from '../behaviors/useOcclusionFade'
import { calcScreenSpaceHover } from '../behaviors/useScreenSpaceHover'
import { smoothstep, clamped, SCENE_CENTER_Z, WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { atmosphereVertex, atmosphereFragment } from '../shaders/AtmosphereShader'
import { type ParticleData } from '../types'
import { useScreenProjection } from '../behaviors/useScreenProjection'

// ============================================================
// 共享状态 — PlanetClickHandler + Act3ContentPhase 消费
// ============================================================

export const _planetWorldPositions: (Vector3 | null)[] = [null, null, null]
export let _mainPlanetIndices: number[] = []

// ============================================================
// Planet — 几何常量
// ============================================================

/** 行星基准半径  ↑=所有几何体等比放大  ↓=等比缩小 */
const PLANET_BASE_RADIUS = 0.015
const GEO_SEGMENTS = 32

// ============================================================
// Planet Atmosphere — 可调参数
// ============================================================

/** Fresnel 壳半径倍率  ↑=边缘辉光离核心更远、光环更宽  ↓=辉光紧贴核心 */
const ATMOS_SHELL_SCALE = 1.03
/** Fresnel 壳不透明度系数  ↑=辉光更亮更明显  ↓=辉光更暗 */
const ATMOS_SHELL_OPACITY = 0.35
/** Sprite scale 系数  ↑=远场柔光扩散更远  ↓=收窄 */
const ATMOS_HALO_SCALE = 1.0
/** Sprite 不透明度系数  ↑=柔光更亮  ↓=柔光更暗 */
const ATMOS_HALO_OPACITY = 0.32
/** 内层光晕半径倍率  ↑=近场散射更扩散  ↓=光晕紧贴核心 */
const INNER_GLOW_SCALE = 1.1
/** 内层光晕不透明度系数  ↑=光晕更亮更明显  ↓=光晕更暗 */
const INNER_GLOW_OPACITY = 0.20

// -- 颜色 --
/** 行星核心色  改色相→行星基调变化 */
const PLANET_CORE_COLOR = '#f0f8ff'
/** 内层光晕色  改色相→光晕冷暖偏移 */
const INNER_GLOW_COLOR = '#f6f7f9'
/** Fresnel 壳色  改色相→边缘辉光冷暖偏移 */
const FRESNEL_SHELL_COLOR = '#d0d5de'
/** Act1 基准色（冷白） */
const COLOR_ACT1 = '#f0f8ff'
/** Act3 基准色（灰蓝） */
const COLOR_ACT3 = '#64748b'

// -- 内层光晕脉冲 --
/** 呼吸频率1  ↑=脉动更快  ↓=脉动更慢 */
const GLOW_PULSE_FREQ_1 = 1.1
/** 呼吸振幅1  ↑=亮度波动更大  ↓=更接近静态 */
const GLOW_PULSE_AMP_1 = 0.01
/** 呼吸频率2  ↑=高频微抖更快  ↓=更平滑 */
const GLOW_PULSE_FREQ_2 = 1.6
/** 呼吸振幅2  ↑=微抖更明显  ↓=更平滑 */
const GLOW_PULSE_AMP_2 = 0.01

// -- Sprite 脉冲 --
/** 呼吸频率1  ↑=脉动更快  ↓=脉动更慢 */
const SPRITE_PULSE_FREQ_1 = 1.1
/** 呼吸振幅1  ↑=亮度波动更大  ↓=更接近静态 */
const SPRITE_PULSE_AMP_1 = 0.02
/** 呼吸频率2  ↑=高频微抖更快  ↓=更平滑 */
const SPRITE_PULSE_FREQ_2 = 1.5
/** 呼吸振幅2  ↑=微抖更明显  ↓=更平滑 */
const SPRITE_PULSE_AMP_2 = 0.02

// -- halo 纹理 --
const HALO_TEX_SIZE = 128
/** 径向渐变色阶  [位置, rgba]  位置: 0=中心 1=边缘  改色值→调色系  改位置→衰减节奏 */
const HALO_COLOR_STOPS: [number, string][] = [
  [0,    'rgba(220,225,235,0.35)'],
  [0.15, 'rgba(200,210,225,0.18)'],
  [0.4,  'rgba(180,195,215,0.04)'],
  [0.7,  'rgba(160,175,200,0.005)'],
  [1,    'rgba(0,0,0,0)'],
]

// 共享 halo 纹理 — 所有行星共用
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
  const { camera, gl } = useThree()
  const { project } = useScreenProjection(_planetWorldPositions)
  const { shouldSkip } = useFrameCache()

  // Pre-allocated reusable objects
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color(COLOR_ACT1)).current
  const _colorAct3 = useRef(new Color(COLOR_ACT3)).current

  // ---- Create 3 planet meshes + atmosphere (one-time) ----
  const { mainPlanets, innerGlows, atmosShells, haloSpriteMats, haloSprites, mainPlanetIndices, particleData } = useMemo(() => {
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
    const innerGlows: Mesh[] = []
    const shells: Mesh[] = []
    const spriteMats: SpriteMaterial[] = []
    const sprites: Sprite[] = []
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
        const trackIdx = planetIndices.indexOf(i)

        // Planet core
        const geo = highPolyGeo.clone()
        const mat = new MeshBasicMaterial({ color: PLANET_CORE_COLOR, transparent: true, opacity: 0, depthWrite: true, depthTest: true })
        const mesh = new Mesh(geo, mat)
        mesh.renderOrder = 1
        mesh.position.set(wx, wy, wz)
        mesh.name = `planet_${trackIdx}`
        planets.push(mesh)

        // Inner glow sphere (pulsing, depthWrite=false)
        const glowGeo = new SphereGeometry(PLANET_BASE_RADIUS * INNER_GLOW_SCALE, GEO_SEGMENTS, GEO_SEGMENTS)
        const glowMat = new MeshBasicMaterial({ color: INNER_GLOW_COLOR, transparent: true, opacity: 0, depthWrite: false, depthTest: true })
        const glow = new Mesh(glowGeo, glowMat)
        glow.renderOrder = 1
        glow.name = `glow_${trackIdx}`
        innerGlows.push(glow)

        // Fresnel atmosphere shell (BackSide)
        const shellGeo = new SphereGeometry(PLANET_BASE_RADIUS * ATMOS_SHELL_SCALE, GEO_SEGMENTS, GEO_SEGMENTS)
        const shellMat = new ShaderMaterial({
          vertexShader: atmosphereVertex,
          fragmentShader: atmosphereFragment,
          uniforms: { uOpacity: { value: 0 }, uColor: { value: new Color(FRESNEL_SHELL_COLOR) } },
          transparent: true, depthWrite: false, side: BackSide,
        })
        const shell = new Mesh(shellGeo, shellMat)
        shell.renderOrder = 1
        shell.name = `atmos_${trackIdx}`
        shells.push(shell)

        // Sprite halo (shared texture, AdditiveBlending)
        const sMat = new SpriteMaterial({
          map: haloTexture, blending: AdditiveBlending,
          transparent: true, opacity: 0, depthWrite: false, depthTest: true,
        })
        const sprite = new Sprite(sMat)
        sprite.renderOrder = 9999
        sprite.name = `halo_${trackIdx}`
        spriteMats.push(sMat)
        sprites.push(sprite)
      }
    }

    _mainPlanetIndices = planetIndices

    return {
      mainPlanets: planets, innerGlows, atmosShells: shells,
      haloSpriteMats: spriteMats, haloSprites: sprites,
      mainPlanetIndices: planetIndices, particleData: data,
    }
  }, [])

  // ---- Per-frame planet animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    // 本帧待写入的屏幕视觉半径（main planet 3 个）
    const _screenRadii: [number, number, number] = [0, 0, 0]

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

        // 计算该行星的屏幕视觉半径（px），供径向布局使用
        // worldRadius = 基准半径 × 当前 scale × 内层光晕倍率（视觉可见边缘）
        const _worldR = PLANET_BASE_RADIUS * appearance.scale * INNER_GLOW_SCALE
        const _pcam = camera as PerspectiveCamera
        const _fovY = (_pcam.fov * Math.PI) / 180
        // 屏幕半径 = worldRadius / 距离处的 frustum 高度 × 视口高度
        const _screenR = (_worldR * gl.domElement.clientHeight) / (2 * cd * Math.tan(_fovY / 2))
        _screenRadii[trackIdx] = Math.round(_screenR)
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

      // ---- Inner glow (pulse, follows core appearance scale) ----
      const glow = innerGlows[trackIdx]
      if (glow) {
        const gPulse = 1 + Math.sin(time * GLOW_PULSE_FREQ_1 + trackIdx * 2.1) * GLOW_PULSE_AMP_1 + Math.sin(time * GLOW_PULSE_FREQ_2 + trackIdx) * GLOW_PULSE_AMP_2
        glow.position.copy(mesh.position)
        glow.scale.setScalar(appearance.scale * gPulse)
        const gMat = glow.material as MeshBasicMaterial
        gMat.opacity = planetOpacity * INNER_GLOW_OPACITY * gPulse
      }

      // ---- Atmosphere shell (follows core appearance scale) ----
      const shell = atmosShells[trackIdx]
      if (shell) {
        shell.position.copy(mesh.position)
        shell.scale.setScalar(appearance.scale)
        const sMat = shell.material as ShaderMaterial
        sMat.uniforms.uOpacity.value = planetOpacity * ATMOS_SHELL_OPACITY
      }

      // ---- Halo sprite (pulse) ----
      const sMat2 = haloSpriteMats[trackIdx]
      const sprite = haloSprites[trackIdx]
      if (sprite && sMat2) {
        const pulse = 1 + Math.sin(time * SPRITE_PULSE_FREQ_1 + trackIdx * 2.1) * SPRITE_PULSE_AMP_1 + Math.sin(time * SPRITE_PULSE_FREQ_2 + trackIdx) * SPRITE_PULSE_AMP_2
        sprite.position.copy(mesh.position)
        const baseScale = d.scale * d.scaleMult * ATMOS_HALO_SCALE
        sprite.scale.set(baseScale * pulse, baseScale * pulse, 1)
        sMat2.opacity = planetOpacity * ATMOS_HALO_OPACITY * pulse
      }
    }

    // 发布屏幕视觉半径（供径向布局使用）
    useRealtimeStore.getState().setPlanetScreenRadii(_screenRadii)

    // 投影行星世界坐标到屏幕坐标（供 FloatingLabels 消费）
    project()

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
