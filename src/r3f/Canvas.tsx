import { Canvas as R3FCanvas } from '@react-three/fiber'
import { type ReactNode } from 'react'
import { SCENE_CENTER_Z } from './ScrollRig'
import ScrollInvalidator from './ScrollInvalidator'

/**
 * R3F Canvas 配置。
 *
 * frameloop: 'demand' — 仅在 scrollProgress 变化时渲染（GSAP ticker 驱动 invalidate）
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
      camera={{
        fov: 40,
        near: 0.1,
        far: 150,
        position: [0, 0.25, 8],
      }}
      onCreated={({ camera }) => {
        camera.lookAt(0, -0.65, SCENE_CENTER_Z - 8)
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
    >
      <ScrollInvalidator />
      {children}
    </R3FCanvas>
  )
}
