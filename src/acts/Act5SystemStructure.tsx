import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group } from 'three'
import { createPlanetAsset, createPlanetHaloTexture, PLANET_BASE_RADIUS, PLANET_CONTENT_COLOR } from '../actors/assets/planet'
import { createSatellitePlanetAsset } from '../actors/assets/satellitePlanet'
import { createRingedPlanetAsset } from '../actors/assets/ringedPlanet'
import { createStellarRadiation } from '../actors/assets/stellarRadiation'
import { createStellarActivity } from '../actors/assets/stellarActivity'
import { createStellarActivityChannels, createStellarActivityTimeline } from '../behaviors/stellarActivity'
import { createStellarTransitionPose } from '../behaviors/stellarTransition'
import { useStellarTransition } from '../r3f/StellarTransitionContext'
import { getStructureLayout, STRUCTURE_LAYOUT } from '../behaviors/structureLayout'
import { useScrollStore } from '../stores/scrollStore'
import { PLANET_ORBIT_SPEEDS } from '../types'

const RINGED_SPIN_PERIOD_RATIO = 0.7

/** 同一 Canvas 中的结构视图：独立资产实例，不改变 Act 3 的轨道与焦点。 */
export default function Act5SystemStructure({ visible }: { visible: boolean }) {
  const size = useThree(state => state.size)
  const layout = useMemo(() => getStructureLayout(size.width / size.height), [size.width, size.height])
  const activityTimeline = useRef<ReturnType<typeof createStellarActivityTimeline> | null>(null)
  const transition = useStellarTransition()
  const samplePose = useMemo(createStellarTransitionPose, [])
  const assets = useMemo(() => {
    const texture = createPlanetHaloTexture()
    const ringedPlanet = createRingedPlanetAsset(2, texture)
    const planets = [createPlanetAsset(0, texture), createSatellitePlanetAsset(1, texture), ringedPlanet]
    const radiation = createStellarRadiation()
    const activityChannels = createStellarActivityChannels()
    const activity = createStellarActivity(activityChannels)
    const root = new Group()
    root.name = 'Act 5 · 恒星系统结构'
    root.position.set(0, STRUCTURE_LAYOUT.centerY, STRUCTURE_LAYOUT.planeZ)
    root.add(radiation.points, activity.root, ...planets.map(planet => planet.root))
    root.traverse(object => object.layers.set(STRUCTURE_LAYOUT.layer))
    for (const planet of planets) {
      planet.core.material.color.set(PLANET_CONTENT_COLOR)
      planet.core.material.opacity = 1
      planet.root.rotation.x = 0.32
    }
    return { root, radiation, activity, activityChannels, planets, ringedPlanet, dispose() { planets.forEach(planet => planet.dispose()); radiation.dispose(); activity.dispose(); texture.dispose() } }
  }, [])
  useEffect(() => () => assets.dispose(), [assets])
  useEffect(() => {
    const timeline = createStellarActivityTimeline(assets.activityChannels)
    activityTimeline.current = timeline
    return () => { timeline.dispose(); activityTimeline.current = null }
  }, [assets])
  useEffect(() => {
    assets.radiation.layout(layout)
    assets.activity.layout(layout, size.width, size.height)
    assets.planets.forEach((planet, i) => {
      planet.root.position.x = layout.planets[i].x
      planet.core.scale.setScalar(layout.planets[i].radius / PLANET_BASE_RADIUS)
    })
  }, [assets, layout, size.width, size.height])
  useFrame((state, delta) => {
    if (useScrollStore.getState().structureProgress <= 0) return
    const pose = samplePose(transition, size.width / size.height)
    assets.root.scale.setScalar(pose.structureScale)
    assets.root.position.copy(pose.star)
    assets.root.position.x -= layout.sunX * pose.structureScale
    assets.activity.root.visible = transition.activity > 0
    assets.radiation.points.visible = transition.radiation > 0
    if (visible && transition.activity > 0) activityTimeline.current?.advance(delta)
    assets.activity.setDetail(transition.activityDetail)
    assets.activity.update(state.camera)
    assets.activity.setVisibility(transition.activity)
    assets.radiation.update(state.clock.elapsedTime, state.gl.getPixelRatio(), transition.radiation)
    assets.planets.forEach((planet, i) => {
      const radius = layout.planets[i].radius
      const entry = transition.planets[i]
      const outsideX = layout.width * 0.65 + radius * planet.visualRadiusScale
      planet.root.position.x = layout.planets[i].x + (outsideX - layout.planets[i].x) * (1 - entry)
      planet.root.visible = entry > 0
      planet.updateAppearance(state.clock.elapsedTime, i, radius / PLANET_BASE_RADIUS, 1, 0.65, radius * 5)
    })
    assets.ringedPlanet.updateSpin(state.clock.elapsedTime, PLANET_ORBIT_SPEEDS[2], RINGED_SPIN_PERIOD_RATIO, true)
    state.invalidate() // 卫星公转、光晕呼吸、日珥与抛射；仍使用 demand 渲染。
  })
  return <primitive object={assets.root} visible={visible} dispose={null} />
}
