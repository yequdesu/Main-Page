import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, Vector3, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useRealtimeStore, type PlanetCoords } from '../stores/realtimeStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { CENTRAL_STAR_CORE_RADIUS } from './assets/centralStar'
import { createFocusTimeline, type FocusEvent } from '../behaviors/useFocusTimeline'
import { voyagerState } from './voyagerState'
import { useFocusAnimation } from '../r3f/FocusAnimationContext'
import { createFocusOrbitController } from '../behaviors/useFocusOrbit'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { calcAppearance } from '../behaviors/useAppearanceFade'
import { calcOcclusionFade } from '../behaviors/useOcclusionFade'
import { calcScreenSpaceHover } from '../behaviors/useScreenSpaceHover'
import { smoothstep, clamped, SCENE_CENTER_Z, WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { createPlanetAsset, createPlanetHaloTexture, PLANET_BASE_RADIUS, ATMOS_HALO_SCALE, PLANET_CONTENT_COLOR } from './assets/planet'
import { createSatellitePlanetAsset } from './assets/satellitePlanet'
import { createRingedPlanetAsset } from './assets/ringedPlanet'
import { PLANET_ORBIT_SPEEDS, type ParticleData } from '../types'
import { WC_ANCHOR_Y, WC_DROP_START, WC_DROP_END, WC_RETRACT_END, getWindChimeProgress } from '../behaviors/useWindChime'
import { useScreenProjection } from '../behaviors/useScreenProjection'

// ============================================================
// 共享状态 — PlanetClickHandler + Act3ContentPhase 消费
// ============================================================

export const _planetWorldPositions: (Vector3 | null)[] = [null, null, null]
// 实时球体半径供轨道接触处淡出使用，不包含实体行星环或卫星轨道。
export const _planetCoreWorldRadii: number[] = [0, 0, 0]
export const _planetOrbitTargets: (Vector3 | null)[] = [null, null, null]
export const _planetRawOrbitY: number[] = [0, 0, 0]  // 纯轨道Y(WindChimeLines计算用)
export let _mainPlanetIndices: number[] = []
// 按内、中、外轨道配置；复合行星保留适量附件边距。
export const _planetFocusDistanceScales = [1, 1.25, 1.25] as const

/** Act1 基准色（冷白） */
const COLOR_ACT1 = '#f0f8ff'

// 与 ORBIT_RADII / PLANET_LINKS 一致，按由内到外的轨道顺序构造。
const PLANET_FACTORIES = [createPlanetAsset, createSatellitePlanetAsset, createRingedPlanetAsset] as const

/**
 * Planets — 3 颗主行星（独立 Mesh，非 InstancedMesh）。
 *
 * 核心 renderOrder = 1、depthWrite = true；附件沿用各自工厂的绘制与深度设置。
 * 原 DustField 中行星逻辑剥离至此处。
 *
 * 援引：
 *   混合方案（TECH_STACK_EVALUATION.md 第十节）
 *   R3F InstancedMesh + individual <mesh> for interactive objects
 */
export default function Planets() {
  const { camera, gl, invalidate } = useThree()
  const { project } = useScreenProjection(_planetWorldPositions)
  const { shouldSkip } = useFrameCache()
  const focusChannels = useFocusAnimation()
  const baseFov = useRef((camera as PerspectiveCamera).fov).current

  // Pre-allocated reusable objects
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color(COLOR_ACT1)).current
  const _colorAct3 = useRef(new Color(PLANET_CONTENT_COLOR)).current

  // ---- Create 3 planet meshes + atmosphere (one-time) ----
  const { mainPlanets, assets, mainPlanetIndices, particleData, dispose } = useMemo(() => {
    const haloTexture = createPlanetHaloTexture()
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

    const assets: (ReturnType<typeof createPlanetAsset> & {
      updateSpin?: ReturnType<typeof createRingedPlanetAsset>['updateSpin']
    })[] = []
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
        ? PLANET_ORBIT_SPEEDS[planetIndices.indexOf(i)]
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

        const asset = PLANET_FACTORIES[trackIdx](trackIdx, haloTexture)
        asset.core.position.set(wx, wy, wz)
        asset.root.visible = false
        // 粒子遍历顺序不等于轨道顺序，后续更新、标签和聚焦都按 trackIdx 读取。
        assets[trackIdx] = asset
      }
    }

    return {
      mainPlanets: assets.map(asset => asset.core), assets,
      dispose: () => {
        assets.forEach(asset => asset.dispose())
        haloTexture.dispose()
      },
      mainPlanetIndices: planetIndices, particleData: data,
    }
  }, [])

  // 发布已提交实例的索引，避免 StrictMode 的重复构造覆盖事件目标映射。
  useEffect(() => { _mainPlanetIndices = mainPlanetIndices }, [mainPlanetIndices])
  useEffect(() => () => dispose(), [dispose])
  const focusOrbit = useMemo(() => createFocusOrbitController({ planetRadius: PLANET_BASE_RADIUS, starRadius: CENTRAL_STAR_CORE_RADIUS }), [])
  const orbitBodies = useMemo(() => mainPlanetIndices.map(i => particleData[i]), [mainPlanetIndices, particleData])
  const envelopes = useMemo(() => assets.map(asset => asset.visualRadiusScale), [assets])

  const focusTimeline = useRef<ReturnType<typeof createFocusTimeline> | null>(null)
  const pendingFocusEvent = useRef<FocusEvent | null>(null)
  const sceneTime = useRef(0)
  const focusAspect = useRef((camera as PerspectiveCamera).aspect)
  useEffect(() => {
    const timeline = createFocusTimeline(focusChannels, {
      focus(track) {
        focusAspect.current = (camera as PerspectiveCamera).aspect
        focusOrbit.focus(orbitBodies, track, camera as PerspectiveCamera, envelopes, _planetFocusDistanceScales[track], baseFov)
        useScrollStore.getState().setFocusStartTime(sceneTime.current)
      },
      exit: settle => focusOrbit.exit(orbitBodies, settle),
      timeout: () => useScrollStore.getState().clearFocus('timeout'),
    })
    focusTimeline.current = timeline
    const initial = useScrollStore.getState()
    pendingFocusEvent.current = initial.focusedVoyager ? { type: 'voyager' } : initial.focusedPlanetIdx >= 0
      ? { type: 'focus', planetIdx: initial.focusedPlanetIdx } : null
    const unsubscribe = useScrollStore.subscribe((state, previous) => {
      if (state.focusEvent !== previous.focusEvent) {
        pendingFocusEvent.current = state.focusEvent
        invalidate()
      }
    })
    return () => {
      unsubscribe()
      timeline.dispose()
      focusTimeline.current = null
      pendingFocusEvent.current = null
    }
  }, [camera, baseFov, focusChannels, focusOrbit, orbitBodies, envelopes, invalidate])

  // ---- Per-frame planet animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    // 本帧待写入的屏幕视觉半径（main planet 3 个）
    const _screenRadii: [number, number, number] = [0, 0, 0]

    const wof = clamped(sp, WHITE_OUT_THRESHOLD, WHITE_OUT_END)
    const ORBIT_START = 0.95  // 重组延迟到回收完毕后
    const act3Progress = clamped(sp, ORBIT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    // 行星始终在轨道 XZ，不参与 dust；从 VISIBLE_START 起由上方下落。
    const VISIBLE_START = 0.60
    // 可见时驱动公转；离开场景后仍完成时间轴上的镜头退出与回位，再停止请求帧。
    if (sp >= VISIBLE_START || focusChannels.mode !== 'idle') invalidate()
    const wc = getWindChimeProgress(sp)
    const inWindChime = wc.active
    const orbitSmooth3 = 1.0  // 始终轨道位置，永不 dust-lerp

    const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z
    const { hoveredIdx, focusedPlanetIdx, focusedVoyager, structureProgress } = useScrollStore.getState()

    sceneTime.current = time
    const focusedTrack = mainPlanetIndices.indexOf(focusedPlanetIdx)
    if (focusedPlanetIdx >= 0 && (sp < GRID_SHIFT_START || focusedTrack < 0 || structureProgress > 0)) {
      useScrollStore.getState().clearFocus('scene')
    }
    if (focusedVoyager && (sp < GRID_SHIFT_START || !voyagerState.available || structureProgress > 0)) useScrollStore.getState().clearFocus('scene')
    const event = pendingFocusEvent.current
    pendingFocusEvent.current = null
    if (event) {
      const track = event.type === 'focus' ? mainPlanetIndices.indexOf(event.planetIdx) : -1
      if (event.type === 'exit' || (sp >= GRID_SHIFT_START && structureProgress === 0 && (track >= 0 || (event.type === 'voyager' && voyagerState.available)))) {
        focusTimeline.current?.dispatch(event, track)
        if (event.type === 'voyager') useScrollStore.getState().setFocusStartTime(sceneTime.current)
      } else {
        focusTimeline.current?.dispatch({ type: 'exit', reason: 'scene' })
        useScrollStore.getState().clearFocus('scene')
      }
    } else if (focusChannels.mode === 'focus' && focusChannels.target === 'planet' && Math.abs(focusAspect.current - (camera as PerspectiveCamera).aspect) > 0.02) {
      // 窗口比例改变也通过事件重建构图，从当前姿态衔接。
      focusTimeline.current?.dispatch({ type: 'focus', planetIdx: focusedPlanetIdx }, focusedTrack)
    }
    focusTimeline.current?.advance(delta)
    focusOrbit.step(orbitBodies, delta, focusChannels)

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
      const { x: px, y: py, z: pz } = calcOrbitPosition(d, time, 0, cx, cy, cz, orbitSmooth3)

      // Distance for appearance
      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(camera.position)

      // Appearance — 主行星用 orbitSmooth3 避免风铃阶段显示为 dust
      const isMain = mainPlanetIndices.includes(i)
      const appearanceSmooth3 = isMain ? orbitSmooth3 : smooth3
      const appearance = calcAppearance(d, sp, wof, appearanceSmooth3, cd, 0)

      // Color
      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, appearance.wofFactor).lerp(_colorAct3, appearance.act3Factor)

      const trackIdx = mainPlanetIndices.indexOf(i)
      const mesh = mainPlanets[trackIdx]
      if (!mesh) continue

      // 风铃期间：行星靠前(+Z) + 从上方垂落
      // 存轨道目标供 WindChimeLines 计算线位置
      if (trackIdx >= 0 && trackIdx < 3) {
        if (!_planetOrbitTargets[trackIdx]) _planetOrbitTargets[trackIdx] = new Vector3()
        _planetOrbitTargets[trackIdx]!.set(px, py, pz)
        _planetRawOrbitY[trackIdx] = py  // 偏移前的纯轨道Y
      }

      mesh.position.set(px, py, pz)
      // 下落早于风铃线开始，到 WC_DROP_END 到位。
      if (sp >= VISIBLE_START && sp < WC_DROP_END) {
        const dropOnly = clamped(sp, VISIBLE_START, WC_DROP_END)
        mesh.position.y = WC_ANCHOR_Y + (py - WC_ANCHOR_Y) * smoothstep(dropOnly)
      }
      // 风铃期间拉近摄像机
      if (inWindChime) {
        mesh.position.z += 6 * wc.smoothP
      }
      mesh.visible = sp >= VISIBLE_START
      assets[trackIdx].root.visible = mesh.visible
      mesh.scale.setScalar(appearance.scale)

      // Track world position
      if (trackIdx >= 0 && trackIdx < 3) {
        if (!_planetWorldPositions[trackIdx]) _planetWorldPositions[trackIdx] = new Vector3()
        _planetWorldPositions[trackIdx]!.copy(mesh.position)
        _planetCoreWorldRadii[trackIdx] = mesh.visible ? PLANET_BASE_RADIUS * appearance.scale : 0

        // 计算该行星的屏幕视觉半径（px），供径向布局使用
        // 标签避让覆盖环带外缘或卫星整圈公转范围，不随卫星相位抖动。
        const _worldR = PLANET_BASE_RADIUS * appearance.scale * assets[trackIdx].visualRadiusScale
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
        speeds[trackIdx] = focusOrbit.speeds[trackIdx]
      }
      for (let oi = 0; oi < 3; oi++) {
        orbAngles[oi] = (orbAngles[oi] + delta * store.orbitSpeeds[oi]) % (Math.PI * 2)
      }
      store.setPlanetData(coords, angles, speeds, store.orbitSpeeds, orbAngles as [number, number, number])

      // Opacity with occlusion
      const mat = mesh.material
      let planetOpacity = appearance.opacity
      if (focusedPlanetPos && focusedPlanetIdx >= 0 && i !== focusedPlanetIdx) {
        _scratch.set(px, py, pz)
        planetOpacity = calcOcclusionFade(_scratch, camera as PerspectiveCamera, focusedPlanetPos, appearance.scale, appearance.opacity)
      }
      mat.opacity = planetOpacity
      mat.color.copy(_scratch2)

      // ---- Glow delay: 线条回收完毕后(sp≥0.94)才启辉光 ----
      const glowFactor = clamped(sp, 0.94, 1.0)

      assets[trackIdx].updateAppearance(
        time, trackIdx, appearance.scale, planetOpacity, glowFactor,
        d.scale * d.scaleMult * ATMOS_HALO_SCALE,
      )
      if (sp >= GRID_SHIFT_START) assets[trackIdx].updateSpin?.(time, d._baseSpeed)
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
  }, -1)

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
      {assets.map((asset, idx) => (
        <primitive key={idx} object={asset.root} dispose={null} />
      ))}
    </group>
  )
}
