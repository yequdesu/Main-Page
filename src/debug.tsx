/**
 * debug.tsx — 3D 模型 Studio 预览调试入口。
 *
 * 独立于 main.tsx，通过 debug.html 加载。
 * 仅在开发环境使用，不参与生产构建（debug.html 不在 Vite 默认入口）。
 *
 * StudioShell 提供统一的三栏 Studio 布局，所有模型（GLB / 程序化）
 * 共享同一套 Canvas + Leva 渲染管道。
 *
 * 援引：pmndrs Studio / gltf.report — 三栏模型查看器范式
 */
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { extend } from '@react-three/fiber'
import { Line as ThreeLine, LineLoop } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import StudioShell from './debug/StudioShell'

// 注册非标准 THREE 类（与 main.tsx 同步，Lighthouse 中的 R3F 渲染依赖这些扩展）
extend({ ThreeLine, LineLoop, InstancedMesh2 })

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={
    <div style={{
      width: '100vw', height: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#050811', color: '#94a3b8',
      fontFamily: "'Courier New', 'Consolas', monospace",
      fontSize: 14,
    }}>
      加载 Studio…
    </div>
  }>
    <StudioShell />
  </Suspense>,
)
