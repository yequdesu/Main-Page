import { useEffect, type ComponentType } from 'react'
import LightBeam from '../actors/LightBeam'
import OceanWaves from '../actors/OceanWaves'
import Lighthouse from '../actors/Lighthouse'
import LighthouseCapture from '../actors/LighthouseCapture'
import { useActorRuntime } from '../composition/actorRuntime'
import { useScrollStore } from '../stores/scrollStore'
import { MINIATURE_PIVOT } from '../behaviors/miniatureUniverse'
import { ACT1_LOCAL_BOUNDS, LEGACY_WORLD_OFFSET, useAct1WorldStore, type Act1SceneId, type Act1WorldProps } from './act1World'
import SunsetWheatWorld from './SunsetWheatWorld'
import { useAnchorStore } from '../composition/anchorStore'

export function LighthouseWorld({ active }: Act1WorldProps) {
  useActorRuntime('lighthouseWorld', active)
  useEffect(() => () => { useAnchorStore.getState().clearProducer('beam') }, [])
  return <group position={LEGACY_WORLD_OFFSET}>
    <LightBeam /><OceanWaves /><Lighthouse />
    <LighthouseCapture onCaptureReady={() => {}} />
  </group>
}

export const ACT1_WORLDS: Record<Act1SceneId, ComponentType<Act1WorldProps>> = {
  lighthouse: LighthouseWorld,
  'sunset-wheat': SunsetWheatWorld,
}

export default function Act1WorldHost({ active }: { active: boolean }) {
  const sceneId = useAct1WorldStore(s => s.sceneId)
  const sceneProgress = useScrollStore(s => s.scrollProgress)
  const World = ACT1_WORLDS[sceneId]
  // MiniatureUniverse supplies a legacy-world offset. Cancel it here so all
  // registered worlds receive cube-local coordinates; only the legacy adapter
  // restores it. The shell and its anchors never remount on selection.
  return <group name="act1-world-local-root" position={MINIATURE_PIVOT}>
    {active && <World key={sceneId} bounds={ACT1_LOCAL_BOUNDS} sceneProgress={sceneProgress} active={active} />}
  </group>
}
