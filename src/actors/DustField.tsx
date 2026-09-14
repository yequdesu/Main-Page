import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, Color, Quaternion, Vector3, IcosahedronGeometry, MeshBasicMaterial, type PerspectiveCamera } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import { useScrollStore } from '../stores/scrollStore'
import { useStellarTransition } from '../r3f/StellarTransitionContext'
import { useFocusAnimation } from '../r3f/FocusAnimationContext'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { calcAppearance } from '../behaviors/useAppearanceFade'
import { ASTEROID_BELT, ASTEROID_ENTRY_VISUAL, asteroidRandom, beltSceneWeight, sampleAsteroidEntry, updateBeltScene, createAsteroidOrbits, createAsteroidBeltController } from '../behaviors/asteroidBelt'
import { readPlanetWorldPoint, readAnchorValue, planetVisualRadiusAnchorId } from '../composition/coreAnchors'
import { smoothstep, clamped, getThemeBlend, SCENE_CENTER_Z, ORBIT_COUNT } from '../r3f/ScrollRig'
import { themeColor } from '../theme/colors'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { type ParticleData } from '../types'

// Pre-allocated default camera position for debris distance calc
const _defaultCamPos = new Vector3(0, 0.25, 8)

/**
 * DustField — 碎片 InstancedMesh2（前幕 80 个，恒星系统 320 个）。
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
  const transition = useStellarTransition()
  const focus = useFocusAnimation()
  const { camera, gl, invalidate } = useThree()
  const { shouldSkip } = useFrameCache()
  const layer = getWebglLayer('webgl.debris')

  // Pre-allocated reusable objects
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _colorAct1 = useRef(new Color('#f0f8ff')).current
  const _colorAct3 = useRef(new Color()).current
  const _cruiseNight = useRef(new Color(themeColor('asteroidCruise', 'night'))).current
  const _cruiseDay = useRef(new Color(themeColor('asteroidCruise', 'day'))).current
  const _entryNight = useRef(new Color(themeColor('asteroidEntry', 'night'))).current
  const _entryDay = useRef(new Color(themeColor('asteroidEntry', 'day'))).current
  const _entryColor = useRef(new Color()).current
  const _instanceEntryColor = useRef(new Color()).current
  const _matrix = useRef(new Matrix4()).current
  const _position = useRef(new Vector3()).current
  const _quaternion = useRef(new Quaternion()).current
  const _scale = useRef(new Vector3()).current
  const _beltPosition = useRef(new Vector3()).current
  const _lookDir = useRef(new Vector3()).current
  const _spinAxis = useRef(new Vector3(0.3, 1, 0.4).normalize()).current
  const orbits = useMemo(() => createAsteroidOrbits(), [])
  const belt = useRef<ReturnType<typeof createAsteroidBeltController> | null>(null)
  // 动画在 effect 中构建和清理，StrictMode 不复用已释放的时间轴。
  useEffect(() => {
    const controller = createAsteroidBeltController(orbits)
    belt.current = controller
    return () => { controller.dispose(); if (belt.current === controller) belt.current = null }
  }, [orbits])
  const entryPositions = useMemo(() => orbits.map(o => sampleAsteroidEntry(o, new Vector3())), [orbits])
  const planetClearances = useMemo(() => [0, 1, 2].map(() => ({ point: new Vector3(), radius: 0 })), [])

  // ---- Create debris particle data + InstancedMesh2 (one-time) ----
  const { particleData, debrisGrayHexes } = useMemo(() => {
    const random = asteroidRandom(ASTEROID_BELT.seed)
    const count = ASTEROID_BELT.legacyCount + ORBIT_COUNT
    const dustConfigs: { scale: number; sizeBoost: number; totalSize: number }[] = []

    for (let i = 0; i < count; i++) {
      const scale = 0.4 + random() * 0.8
      const sizeBoost = random() < 0.60 ? 1.5 + random() * 2.5 : 0.7 + random() * 0.8
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
      const tt = random()
      const zDist = 1 + tt * 41
      const maxR = (zDist / 42) * 7.5 + 0.2
      const angle = random() * Math.PI * 2
      const r = Math.sqrt(random()) * maxR
      const wx = worldOrigin.x + Math.cos(angle) * r
      const wy = worldOrigin.y + (random() - 0.5) * maxR * 0.6
      const wz = worldOrigin.z + zDist

      const gray = Math.floor(100 + random() * 60)
      const grayHex = '#' + gray.toString(16).padStart(2, '0').repeat(3)

      const orbitR = 2.5 + random() * 4.5
      const orbitSpeed = -(0.03 + random() * 0.08)

      const particle: ParticleData = {
        wx, wy, wz,
        dx: (random() - 0.5) * 0.15,
        dy: (random() - 0.5) * 0.1 + 0.06,
        dz: (random() - 0.5) * 0.08,
        ph: random() * Math.PI * 2,
        scale: cfg.scale,
        sizeBoost: cfg.sizeBoost,
        grayHex,
        orbitAngle: orbits[data.length].phase,
        orbitR,
        orbitSpeed,
        _baseSpeed: orbitSpeed,
        scaleMult: 0.4 + random() * 0.9,
        isMainPlanet: false,
        hoverFactor: 0.0,
        orbitTilt: 0,
        flattenY: 1.0,
        wobbleAmp: 0.5 + random() * 1.2,
        wobbleFreq: 0.3 + random() * 0.4,
      }

      data.push(particle)
      grayHexes.push(grayHex)
    }

    // 增量实例只在恒星系统阶段显现，前幕仍保留原 80 个碎片。
    while (data.length < ASTEROID_BELT.count) {
      const source = data[data.length % ASTEROID_BELT.legacyCount]
      data.push({ ...source, orbitAngle: orbits[data.length].phase,
        scale: 0.4 + random() * 0.8, sizeBoost: 0.7 + random() ** 1.5 * 2.8 })
      grayHexes.push(source.grayHex)
    }
    return { particleData: data, debrisGrayHexes: grayHexes }
  }, [orbits])

  // ---- Debris InstancedMesh2 ----
  const debrisMesh = useMemo(() => {
    const geo = new IcosahedronGeometry(0.015, 1)
    const mat = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: layer.transparent,
      depthWrite: layer.depthWrite,
      depthTest: layer.depthTest,
    })
    const mesh = new InstancedMesh2(geo, mat, { capacity: ASTEROID_BELT.count, renderer: gl })
    mesh.name = 'AsteroidBelt'
    mesh.renderOrder = layer.renderOrder
    mesh.sortObjects = true
    mesh.addInstances(ASTEROID_BELT.count)
    return mesh
  }, [gl, layer.depthTest, layer.depthWrite, layer.renderOrder, layer.transparent])

  // Initialize per-instance colors
  useEffect(() => {
    const mesh = debrisMesh
    const _c = new Color()
    for (let i = 0; i < debrisGrayHexes.length; i++) {
      _c.set(debrisGrayHexes[i])
      mesh.setColorAt(i, _c)
    }
    ;(mesh as any).materialsNeedsUpdate?.()
  }, [debrisGrayHexes, debrisMesh])

  useEffect(() => () => {
    debrisMesh.dispose()
    debrisMesh.geometry.dispose()
    const material = debrisMesh.material
    if (!Array.isArray(material)) material.dispose()
  }, [debrisMesh])

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
    const controller = belt.current
    const preparation = beltSceneWeight(sp)
    const beltWeight = controller ? updateBeltScene(controller, sp, focus.mode === 'focus', entryPositions) : 0
    controller?.advance(delta)
    const highlight = preparation * (controller?.visual.highlight ?? ASTEROID_ENTRY_VISUAL.preparedHighlight)
    _entryColor.copy(_entryNight).lerp(_entryDay, getThemeBlend())
    _colorAct3.copy(_cruiseNight).lerp(_cruiseDay, getThemeBlend())
    if (beltWeight > 0 && transition.orbitOpacity > 0) invalidate()
    planetClearances.forEach((entry, i) => {
      const point = readPlanetWorldPoint(i)
      entry.radius = point ? readAnchorValue<number>(planetVisualRadiusAnchorId(i)) ?? 0 : 0
      if (point) entry.point.set(point.x, point.y, point.z)
    })

    for (let i = 0; i < particleData.length; i++) {
      const d = particleData[i]

      const legacy = calcOrbitPosition(d, time, delta, cx, cy, cz, 0)
      _position.set(legacy.x, legacy.y, legacy.z)
      if (controller?.active) controller.sample(i, _beltPosition)
      else _beltPosition.copy(entryPositions[i])
      // 加速开始前先完成 360° 空间交接；不把前幕视锥带入高速段。
      _position.lerp(_beltPosition, preparation)
      const { x: px, y: py, z: pz } = _position

      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(_defaultCamPos)

      const appearance = calcAppearance(d, sp, wof, smooth3, cd, 0)
      // 相对于上轮稳定环带缩小一半，并限制罕见的大碎片。
      const beltStyle = preparation
      const beltScale = Math.min(appearance.scale * 0.82 * ASTEROID_BELT.sizeScale, 0.9)
      appearance.scale += (beltScale - appearance.scale) * beltStyle

      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, appearance.wofFactor).lerp(_colorAct3, appearance.act3Factor)

      const orbit = orbits[i]
      // 种子只决定固定明暗差异；整段入场连续显隐，不逐帧闪烁。
      _instanceEntryColor.copy(_entryColor).multiplyScalar(orbit.highlightGain)
      _scratch2.lerp(_instanceEntryColor, highlight)
      appearance.opacity += (ASTEROID_BELT.cruiseOpacity - appearance.opacity) * preparation
      appearance.opacity += (ASTEROID_ENTRY_VISUAL.peakOpacity - appearance.opacity) * highlight
      _quaternion.setFromAxisAngle(_spinAxis, (time * orbit.spin + orbit.phase) * beltStyle)
      _scale.set(1 + (orbit.shape[0] - 1) * beltStyle, 1 + (orbit.shape[1] - 1) * beltStyle, 1 + (orbit.shape[2] - 1) * beltStyle).multiplyScalar(appearance.scale)
      _matrix.compose(_position, _quaternion, _scale)
      debrisMesh.setMatrixAt(i, _matrix)
      debrisMesh.setColorAt(i, _scratch2)
      // 包络内局部淡出，避免缩放后的卫星/行星环穿过碎片；不改变稳定轨道。
      let clearance = 1
      for (const { point, radius } of planetClearances) {
        if (!point || radius <= 0) continue
        const distance = Math.hypot(px - point.x, py - point.y, pz - point.z)
        clearance = Math.min(clearance, smoothstep(clamped(distance, radius + 0.025, radius + 0.18)))
      }
      const nearCamera = smoothstep(clamped(_position.distanceTo(camera.position), 0.3, 1.2))
      const localVisibility = 1 + (clearance * nearCamera - 1) * beltWeight
      debrisMesh.setOpacityAt(i, appearance.opacity * transition.orbitOpacity * localVisibility * (i < ASTEROID_BELT.legacyCount ? 1 : preparation))
    }

    // Publish camera + debris data to realtime store
    const cam = camera as PerspectiveCamera
    cam.getWorldDirection(_lookDir)
    useRealtimeStore.getState().setCameraData({
      pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      look: { x: _lookDir.x, y: _lookDir.y, z: _lookDir.z },
      fov: cam.fov,
    })
    useRealtimeStore.getState().setDebrisCount(preparation > 0 ? ASTEROID_BELT.count : ASTEROID_BELT.legacyCount)
  })

  return (
    <primitive object={debrisMesh} />
  )
}
