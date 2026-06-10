import { useFrame } from '@react-three/fiber'
import Lighthouse from '../actors/Lighthouse'
import LightBeam from '../actors/LightBeam'
import OceanWaves from '../actors/OceanWaves'
import DustField from '../actors/DustField'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { sceneApplyWhiteOut } from '../r3f/ScrollRig'

/**
 * Act 1 "OceanVoyage" — 暗色海洋、灯塔、光束、粒子。
 *
 * 组装：OceanWaves + Lighthouse + LightBeam + DustField
 * 通过 visible prop 控制，始终挂载。
 *
 * 援引：R3F visible prop 模式
 */
interface Act1Props {
  visible: boolean
}

export default function Act1OceanVoyage({ visible }: Act1Props) {
  const { shouldSkip } = useFrameCache()

  useFrame((state, _delta) => {
    if (!visible) return
    const time = state.clock.elapsedTime
    const sp = useScrollStore.getState().scrollProgress
    if (shouldSkip(time, sp)) return
    // Ocean waves, dust, and beam are self-contained with their own useFrame hooks.
    // This hook is for Act-level coordination (white-out transition).
    sceneApplyWhiteOut(state.scene, sp)
  })

  if (!visible) return null

  return (
    <group>
      <OceanWaves />
      <Lighthouse />
      <LightBeam />
      <DustField />
    </group>
  )
}
