import { memo } from 'react'
import LightBeam from '../actors/LightBeam'
import OceanWaves from '../actors/OceanWaves'
import LighthouseCapture from '../actors/LighthouseCapture'
import AsteroidBelts from '../actors/AsteroidBelts'
import Lighthouse from '../actors/Lighthouse'
import MiniatureUniverse from '../actors/MiniatureUniverse'

/**
 * Act 1 "OceanVoyage" �?暗色海洋、光束�?
 *
 * 组装：远景 AsteroidBelts + MiniatureUniverse(OceanWaves + LightBeam + Lighthouse)
 * 通过 visible prop 控制，始终挂载�?
 *
 * 援引：R3F visible prop 模式
 */
interface Act1Props {
  visible: boolean
}

const Act1OceanVoyage = memo(function Act1OceanVoyage({ visible }: Act1Props) {
  return (
    <group visible={visible}>
      <AsteroidBelts variant="act1" />
      <MiniatureUniverse>
        <LightBeam />
        <OceanWaves />
        <Lighthouse />
      </MiniatureUniverse>
      <LighthouseCapture onCaptureReady={() => {}} />
    </group>
  )
})

export default Act1OceanVoyage
