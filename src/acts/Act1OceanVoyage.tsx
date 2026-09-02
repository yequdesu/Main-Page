import { memo } from 'react'
import LightBeam from '../actors/LightBeam'
import OceanWaves from '../actors/OceanWaves'
import LighthouseCapture from '../actors/LighthouseCapture'
import AsteroidBelts from '../actors/AsteroidBelts'

/**
 * Act 1 "OceanVoyage" �?暗色海洋、光束�?
 *
 * 组装：OceanWaves + 远景 AsteroidBelts + LightBeam + LighthouseCapture
 * 通过 visible prop 控制，始终挂载�?
 * Lighthouse 已提升至 Canvas 根层级，不受 Act 可见性限制。
 *
 * 援引：R3F visible prop 模式
 */
interface Act1Props {
  visible: boolean
}

const Act1OceanVoyage = memo(function Act1OceanVoyage({ visible }: Act1Props) {
  return (
    <group visible={visible}>
      <OceanWaves />
      <AsteroidBelts variant="act1" />
      <LightBeam />
      <LighthouseCapture onCaptureReady={() => {}} />
    </group>
  )
})

export default Act1OceanVoyage
