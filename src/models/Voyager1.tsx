/**
 * Voyager1 — NASA Voyager 1 航天器 3D 模型。
 *
 * 来源：illidroid (Sketchfab) · CC BY 4.0
 * 格式：GLB Binary glTF，~20.4K 三角面
 *
 * 使用 drei useGLTF 加载，preload 在模块加载时启动 HTTP 请求。
 * dispose={null} 防止 Suspense fallback 触发时 GLTF 缓存被清空。
 *
 * 援引：gltf.pmnd.rs — pmndrs 官方 GLB→JSX 工作流
 *       drei useGLTF docs — preload + Suspense 模式
 */
import { useGLTF } from '@react-three/drei'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Voyager1(props: Record<string, any>) {
  const { scene } = useGLTF('/models/voyager-1.glb')
  return <primitive object={scene} {...props} />
}

// 模块加载时预加载 GLB，减少首次渲染的等待时间
useGLTF.preload('/models/voyager-1.glb')
