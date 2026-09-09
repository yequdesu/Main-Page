import { PLANET_PREVIEW_LIGHTING } from '../actors/assets/celestialLighting'
import { type ComponentType, lazy } from 'react'

// ============================================================
// 模型注册表 — Debug Studio 的模型选择数据源
//
// 要新增模型：
// 1. 在此文件中添加一个 entry
// 2. 如果是 GLB 模型，使用 `npx @react-three/gltfjsx` 生成组件
// 3. GLB 文件放入 public/models/
// 4. 如需自定义 Leva 控件，设置 debugControls 标记
//
// 援引：pmndrs 生态 — gltfjsx + useGLTF 工作流
//       Debug Studio 统一模型管道
// ============================================================

export type EnvPreset = 'studio' | 'night' | 'dawn' | 'sunset'

export interface ModelRegistryEntry {
  label: string
  component: ComponentType<any>
  glbPath?: string
  environment?: EnvPreset
  /** 模型专属灯光初值；用户调整后的会话配置优先。 */
  previewLighting?: typeof PLANET_PREVIEW_LIGHTING
  attribution?: string
  procedural?: boolean
  /** 工作台独立预览动画的名称；GLB 动画仍从文件读取。 */
  previewAnimation?: string
  /** 自定义 Leva 控件标记 — 当前仅 'lighthouse-capture' */
  debugControls?: 'lighthouse-capture'
}

export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  // ---- 程序化模型 ----
  'lighthouse-capture': {
    label: 'Lighthouse · 截图调试',
    component: lazy(() => import('../actors/Lighthouse')),
    procedural: true,
    attribution: '程序化生成（YeQuDeSu）',
    environment: 'studio',
    debugControls: 'lighthouse-capture',
  },
  'central-star': {
    label: '中央恒星 · 程序化资产',
    component: lazy(() => import('./CelestialPreviews').then(module => ({ default: module.CentralStarPreview }))),
    procedural: true,
    previewAnimation: '光晕呼吸',
    attribution: '程序化生成（YeQuDeSu）',
    environment: 'night',
  },
  'planet': {
    previewLighting: PLANET_PREVIEW_LIGHTING,
    label: '单颗行星 · 程序化资产',
    component: lazy(() => import('./CelestialPreviews').then(module => ({ default: module.PlanetPreview }))),
    procedural: true,
    previewAnimation: '光晕呼吸',
    attribution: '程序化生成（YeQuDeSu）',
    environment: 'night',
  },
  'ringed-planet': {
    previewLighting: PLANET_PREVIEW_LIGHTING,
    label: '带环行星 · 程序化资产',
    component: lazy(() => import('./CelestialPreviews').then(module => ({ default: module.RingedPlanetPreview }))),
    procedural: true,
    previewAnimation: '光晕呼吸',
    attribution: '程序化生成（YeQuDeSu）· 圆环面行星环实验',
    environment: 'studio',
  },

  'satellite-planet': {
    previewLighting: PLANET_PREVIEW_LIGHTING,
    label: '带卫星行星 · 程序化资产',
    component: lazy(() => import('./CelestialPreviews').then(module => ({ default: module.SatellitePlanetPreview }))),
    procedural: true,
    previewAnimation: '卫星公转与光晕呼吸',
    attribution: '程序化生成（YeQuDeSu）· 单卫星圆轨道实验',
    environment: 'studio',
  },

  // ---- GLB 模型 ----
  voyager1: {
    label: 'Voyager 1',
    component: lazy(() => import('./Voyager1')),
    glbPath: '/models/voyager-1.glb',
    attribution: 'illidroid (Sketchfab) · CC BY 4.0',
    environment: 'studio',
  },
  'voyager1-low-poly': {
    label: 'Voyager 1 · Low Poly',
    component: lazy(() => import('./Voyager1LowPoly')),
    glbPath: '/models/voyager-1-low-poly.glb',
    attribution: 'illidroid (Sketchfab) · CC BY 4.0 · 低模烘焙',
    environment: 'studio',
  },
}

export function getModelKeys(): string[] {
  return Object.keys(MODEL_REGISTRY)
}

export function getModelOptions(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(MODEL_REGISTRY).map(([key, entry]) => [key, entry.label]),
  )
}
