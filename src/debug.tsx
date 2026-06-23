/**
 * debug.tsx — LighthouseCapture 预览调试入口。
 *
 * 独立于 main.tsx，通过 debug.html 加载。
 * 仅在开发环境使用，不参与生产构建（debug.html 不在 Vite 默认入口）。
 */
import { createRoot } from 'react-dom/client'
import { extend } from '@react-three/fiber'
import { Line as ThreeLine, LineLoop } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import LighthousePreviewPanel from './debug/LighthousePreviewPanel'

// 注册非标准 THREE 类（与 main.tsx 同步，Lighthouse 中的 R3F 渲染依赖这些扩展）
extend({ ThreeLine, LineLoop, InstancedMesh2 })

createRoot(document.getElementById('root')!).render(<LighthousePreviewPanel />)
