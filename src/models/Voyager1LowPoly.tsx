/**
 * Voyager1LowPoly — NASA Voyager 1 低模版本。
 *
 * 由 scripts/bake-low-poly.sh 从 voyager-1.glb 烘焙生成。
 * 面数：~10.5K 上传顶点（原版 20.4K 的 52%），文件 401 KB（原版 1.69 MB 的 24%）。
 *
 * 来源：illidroid (Sketchfab) · CC BY 4.0
 *
 * 援引：gltf-transform simplify pipeline
 *       drei useGLTF — preload + Suspense 模式
 */
import { useGLTF } from '@react-three/drei'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Voyager1LowPoly(props: Record<string, any>) {
  const { scene } = useGLTF('/models/voyager-1-low-poly.glb')
  return <primitive object={scene} {...props} />
}

useGLTF.preload('/models/voyager-1-low-poly.glb')
