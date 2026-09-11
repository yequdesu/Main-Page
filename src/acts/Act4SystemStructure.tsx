import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group } from 'three'
import { createPlanetAsset, createPlanetHaloTexture, PLANET_BASE_RADIUS, PLANET_CONTENT_COLOR } from '../actors/assets/planet'
import { createSatellitePlanetAsset } from '../actors/assets/satellitePlanet'
import { createRingedPlanetAsset } from '../actors/assets/ringedPlanet'
import { createCentralStarAsset, CENTRAL_STAR_CORE_RADIUS } from '../actors/assets/centralStar'
import { createStellarRadiation } from '../actors/assets/stellarRadiation'
import { configureStellarCloseup } from '../actors/assets/stellarCloseup'
import { getStructureLayout, STRUCTURE_LAYOUT } from '../behaviors/structureLayout'
import { useScrollStore } from '../stores/scrollStore'
import { PLANET_ORBIT_SPEEDS } from '../types'

const RINGED_SPIN_PERIOD_RATIO = 0.7

/** 同一 Canvas 中的结构视图：独立资产实例，不改变 Act 3 的轨道与焦点。 */
export default function Act4SystemStructure({ visible }: { visible: boolean }) {
  const size = useThree(state => state.size)
  const layout = useMemo(() => getStructureLayout(size.width / size.height), [size.width, size.height])
  const assets = useMemo(() => {
    const texture = createPlanetHaloTexture()
    const ringedPlanet = createRingedPlanetAsset(2, texture)
    const planets = [createPlanetAsset(0, texture), createSatellitePlanetAsset(1, texture), ringedPlanet]
    const sun = createCentralStarAsset({ segments: 128 })
    const radiation = createStellarRadiation()
    const sunCloseup = configureStellarCloseup(sun)
    // 日面特写仍保留完整恒星资产，收窄大尺度柔光，避免覆盖行星列。
    sun.nearHalo.scale.multiplyScalar(0.25)
    sun.farHalo.scale.multiplyScalar(0.18)
    const root = new Group()
    root.name = 'Act 4 · 恒星系统结构'
    root.position.set(0, STRUCTURE_LAYOUT.centerY, STRUCTURE_LAYOUT.planeZ)
    root.add(radiation.points, sun.root, ...planets.map(planet => planet.root))
    root.traverse(object => object.layers.set(STRUCTURE_LAYOUT.layer))
    for (const planet of planets) {
      planet.core.material.color.set(PLANET_CONTENT_COLOR)
      planet.core.material.opacity = 1
      planet.root.rotation.x = 0.32
    }
    return { root, sun, sunCloseup, radiation, planets, ringedPlanet, dispose() { planets.forEach(planet => planet.dispose()); sun.dispose(); radiation.dispose(); texture.dispose() } }
  }, [])
  useEffect(() => () => assets.dispose(), [assets])
  useEffect(() => {
    assets.radiation.layout(layout)
    assets.sun.root.position.x = layout.sunX
    assets.sun.root.scale.setScalar(layout.sunRadius / CENTRAL_STAR_CORE_RADIUS)
    assets.planets.forEach((planet, i) => {
      planet.root.position.x = layout.planets[i].x
      planet.core.scale.setScalar(layout.planets[i].radius / PLANET_BASE_RADIUS)
    })
  }, [assets, layout])
  useFrame(state => {
    if (useScrollStore.getState().structureProgress <= 0) return
    assets.radiation.update(state.clock.elapsedTime, state.gl.getPixelRatio())
    assets.sunCloseup.update(state.clock.elapsedTime)
    // updateGlow 先重设 pulse 缩放；按当前视口约束峰值，窄屏也不遮住首颗行星。
    const maxGlowScale = layout.sunGlowRadius / (assets.sun.glow.geometry.parameters.radius * assets.sun.root.scale.x)
    assets.sun.glow.scale.setScalar(Math.min(assets.sun.glow.scale.x * 0.7, maxGlowScale))
    assets.planets.forEach((planet, i) => {
      const radius = layout.planets[i].radius
      planet.updateAppearance(state.clock.elapsedTime, i, radius / PLANET_BASE_RADIUS, 1, 0.65, radius * 5)
    })
    assets.ringedPlanet.updateSpin(state.clock.elapsedTime, PLANET_ORBIT_SPEEDS[2], RINGED_SPIN_PERIOD_RATIO, true)
    state.invalidate() // 卫星公转、光晕呼吸；仍使用 demand 渲染。
  })
  return <primitive object={assets.root} visible={visible} dispose={null} />
}
