import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { centralStarWorldAnchorId, pointFromVector3, setCoreAnchor } from '../composition/coreAnchors'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { SCENE_CENTER_Z, clamped, smoothstep } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
import { WC_ANCHOR_Y, WC_DROP_END, getWindChimeProgress } from '../behaviors/useWindChime'
import { createCentralStarAsset } from './assets/centralStar'

const GROUP_POSITION_Y = -1.0

/** 主页恒星：视觉资产与滚动/风铃编排分离，Studio 直接复用视觉工厂。 */
export default function CentralStar() {
  useActorRuntime('centralStar', true)
  const asset = useMemo(() => {
    const created = createCentralStarAsset()
    const layer = getWebglLayer('webgl.star')
    for (const object of [created.core, created.glow, created.nearHalo, created.farHalo]) object.renderOrder = layer.renderOrder
    for (const object of [created.glow, created.nearHalo, created.farHalo]) {
      object.material.transparent = layer.transparent
      object.material.depthWrite = layer.depthWrite
      object.material.depthTest = layer.depthTest
    }
    created.root.position.set(0, GROUP_POSITION_Y, SCENE_CENTER_Z)
    return created
  }, [])
  useEffect(() => () => asset.dispose(), [asset])

  useFrame((state) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    // 到达出现阈值后，从风铃锚点下落。
    const VISIBLE_START = TIMELINE.planetVisible.start
    const visible = sp >= VISIBLE_START
    const wc = getWindChimeProgress(sp)
    touchActorFrame('centralStar', Math.round(time * 60), visible)
    asset.root.visible = visible
    // Y：比风铃更早下落，到 WC_DROP_END 到位。
    if (sp >= VISIBLE_START && sp < WC_DROP_END) {
      const dropOnly = clamped(sp, VISIBLE_START, WC_DROP_END)
      asset.root.position.y = WC_ANCHOR_Y + (GROUP_POSITION_Y - WC_ANCHOR_Y) * smoothstep(dropOnly)
    } else if (sp >= WC_DROP_END) {
      asset.root.position.y = GROUP_POSITION_Y
    }
    asset.root.position.z = SCENE_CENTER_Z + 6 * wc.smoothP

    setCoreAnchor(centralStarWorldAnchorId, pointFromVector3(asset.root.position), 'world', 'centralStar', visible)
    const GLOW_START = TIMELINE.orbitGlow.start
    const act3Progress = clamped(sp, GLOW_START, 1.0)
    const smooth3 = smoothstep(act3Progress)
    asset.updateGlow(time, smooth3)
  })

  return <primitive object={asset.root} dispose={null} />
}
