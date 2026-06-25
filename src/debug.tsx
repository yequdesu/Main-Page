/**
 * debug.tsx — 通用 3D 模型预览调试入口。
 *
 * 独立于 main.tsx，通过 debug.html 加载。
 * 仅在开发环境使用，不参与生产构建（debug.html 不在 Vite 默认入口）。
 *
 * 通过 ModelPreviewShell 的 Leva 下拉菜单切换预览模型：
 *   - lighthouse-capture → LighthousePreviewPanel（专用截图面板）
 *   - voyager1 / 其他    → ModelPreviewPanel（通用模型查看器）
 *
 * 援引：pmndrs 模型预览面板模式 — drei + leva + R3F
 */
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { extend } from '@react-three/fiber'
import { Line as ThreeLine, LineLoop } from 'three'
import { InstancedMesh2 } from '@three.ez/instanced-mesh'
import ModelPreviewShell from './debug/ModelPreviewShell'

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
      加载调试面板…
    </div>
  }>
    <ModelPreviewShell />
  </Suspense>,
)
