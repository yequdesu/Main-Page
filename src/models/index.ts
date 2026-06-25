import { type ComponentType, lazy } from 'react'

// ============================================================
// 模型注册表 — 调试页面的模型选择数据源
//
// 要新增模型：
// 1. 在此文件中添加一个 entry
// 2. 如果来自 GLB，使用 `npx @react-three/gltfjsx` 生成组件
// 3. GLB 文件放入 public/models/
//
// 援引：pmndrs 生态 — gltfjsx + useGLTF 工作流
// ============================================================

export interface ModelRegistryEntry {
  /** 用户可见标签（Leva 下拉菜单显示） */
  label: string
  /** 模型组件（GLB 模型用 lazy 导入，程序化模型直接引用） */
  component: ComponentType<any>
  /** GLB 文件路径（Vite public/ 静态服务），程序化模型不填 */
  glbPath?: string
  /** 近似三角面数 */
  triCount?: number
  /** 归属 / 许可证文本 */
  attribution?: string
  /** 是否为程序化几何（非 GLB） */
  procedural?: boolean
  /** 是否使用专用调试面板（如 Lighthouse 截图面板） */
  useCapturePanel?: boolean
}

/**
 * 模型注册表。
 *
 * key 用作 Leva select 选项值和 URL hash。
 * component 在调试页面中按需渲染。
 */
export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  // ---- 程序化模型（专用面板） ----
  'lighthouse-capture': {
    label: 'Lighthouse · 截图调试',
    // Lighthouse 是同步程序化组件，不用 lazy
    component: (() => { throw new Error('Lighthouse 通过 useCapturePanel 标记使用专用面板') }) as any,
    procedural: true,
    triCount: 30,
    attribution: '程序化生成（YeQuDeSu）',
    useCapturePanel: true,
  },

  // ---- GLB 模型 ----
  voyager1: {
    label: 'Voyager 1',
    component: lazy(() => import('./Voyager1')),
    glbPath: '/models/voyager-1.glb',
    triCount: 20400,
    attribution: 'illidroid (Sketchfab) · CC BY 4.0',
  },
  'voyager1-low-poly': {
    label: 'Voyager 1 · Low Poly',
    component: lazy(() => import('./Voyager1LowPoly')),
    glbPath: '/models/voyager-1-low-poly.glb',
    triCount: 10550,
    attribution: 'illidroid (Sketchfab) · CC BY 4.0 · 低模烘焙',
  },
}

/** 获取所有注册模型的 key 列表（供 Leva select 使用） */
export function getModelKeys(): string[] {
  return Object.keys(MODEL_REGISTRY)
}

/** 获取模型选择选项（供 Leva select 使用） */
export function getModelOptions(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(MODEL_REGISTRY).map(([key, entry]) => [key, entry.label]),
  )
}
