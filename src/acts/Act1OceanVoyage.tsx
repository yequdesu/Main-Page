import { memo } from 'react'
import Lighthouse from '../actors/Lighthouse'
import LightBeam from '../actors/LightBeam'
import OceanWaves from '../actors/OceanWaves'
import LighthouseCapture from '../actors/LighthouseCapture'

/**
 * Act 1 "OceanVoyage" — 暗色海洋、灯塔、光束。
 *
 * 组装：OceanWaves + Lighthouse + LightBeam
 * 通过 visible prop 控制，始终挂载。
 * DustField（粒子/行星）已提升至 Canvas 根层级，不受 Act 可见性限制。
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
      <Lighthouse />
      <LightBeam />
      <LighthouseCapture onCaptureReady={() => {}} />
    </group>
  )
})

export default Act1OceanVoyage
