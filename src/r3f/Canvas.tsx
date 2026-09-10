import { Canvas as R3FCanvas } from '@react-three/fiber'
import { type ReactNode } from 'react'
import { Color, FogExp2 } from 'three'
import { SCENE_CENTER_Z } from './ScrollRig'
import ScrollInvalidator from './ScrollInvalidator'
import { FocusAnimationProvider } from './FocusAnimationContext'
import PlanetClickHandler from './PlanetClickHandler'
import SceneLights from '../actors/SceneLights'
import DustField from '../actors/DustField'
import Planets from '../actors/Planets'
import Lighthouse from '../actors/Lighthouse'
import WindChimeLines from '../actors/WindChimeLines'
import CentralStar from '../actors/CentralStar'

/**
 * R3F Canvas 配置。
 *
 * frameloop: 'demand' — 滚动更新唤醒渲染，行星可见阶段持续 invalidate
 * 相机参数从原 LighthouseScene.vue 保留：FOV=40, near=0.1, far=150
 *
 * 援引：R3F frameloop 模式（官方文档）
 */
interface CanvasProps {
  children: ReactNode
}

export default function SceneCanvas({ children }: CanvasProps) {
  return (
    <R3FCanvas
      frameloop="demand"
      flat
      camera={{
        fov: 40,
        near: 0.1,
        far: 150,
        position: [0, 0.25, 8],
      }}
      onCreated={({ camera, scene }) => {
        camera.lookAt(0, -0.65, SCENE_CENTER_Z - 8)
        // buildSky(): 初始背景 + 雾
        scene.background = new Color('#050811')
        scene.fog = new FogExp2('#050811', 0.02)
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
    >
      <FocusAnimationProvider>
        <ScrollInvalidator />
        <PlanetClickHandler />
        <SceneLights />
        <Planets />
        <DustField />
        <Lighthouse />
        <WindChimeLines />
        <CentralStar />
        {children}
      </FocusAnimationProvider>
    </R3FCanvas>
  )
}
