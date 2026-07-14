import { Canvas as R3FCanvas } from '@react-three/fiber'
import { type ReactNode } from 'react'
import { Color, FogExp2 } from 'three'
import { SCENE_CENTER_Z } from './ScrollRig'
import ScrollInvalidator from './ScrollInvalidator'
import PlanetClickHandler from './PlanetClickHandler'
import SceneLights from '../actors/SceneLights'
import Planets from '../actors/Planets'
import Lighthouse from '../actors/Lighthouse'
import WindChimeLines from '../actors/WindChimeLines'
import CentralStar from '../actors/CentralStar'
import SeaCameraBob from '../actors/SeaCameraBob'
import SeaMist from '../actors/SeaMist'
import { getDomLayer } from '../composition/layerRegistry'

/**
 * R3F Canvas 配置�?
 *
 * frameloop: 'demand' �?仅在 scrollProgress 变化时渲染（GSAP ticker 驱动 invalidate�?
 * 相机参数从原 LighthouseScene.vue 保留：FOV=40, near=0.1, far=150
 *
 * 援引：R3F frameloop 模式（官方文档）
 */
interface CanvasProps {
  children: ReactNode
}

export default function SceneCanvas({ children }: CanvasProps) {
  const canvasLayer = getDomLayer('dom.canvas')

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
        // buildSky(): 初始背景 + �?
        scene.background = new Color('#050811')
        scene.fog = new FogExp2('#050811', 0.02)
      }}
      style={{ position: canvasLayer.position, inset: 0, zIndex: canvasLayer.zIndex }}
    >
      <ScrollInvalidator />
      <SeaCameraBob />
      <PlanetClickHandler />
      <SceneLights />
      <SeaMist />
      <Planets />
      <Lighthouse />
      <WindChimeLines />
      <CentralStar />
      {children}
    </R3FCanvas>
  )
}
