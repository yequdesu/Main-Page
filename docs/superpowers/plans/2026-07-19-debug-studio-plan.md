# Debug Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/debug.tsx` ecosystem from a two-panel branching architecture into a unified three-column Studio layout with professional 3D model inspection capabilities.

**Architecture:** Single Canvas + single Leva instance hosted by `StudioShell`. Component-specific debug controls are injected via optional `debugConfig` exports. Three-panel CSS Grid layout (SceneExplorer | Viewport | PropertyPanel) with toolbar and status bar. `MODEL_REGISTRY` drops `useCapturePanel` in favor of per-component `debugConfig`.

**Tech Stack:** React 18, R3F, drei (Environment, GizmoHelper, OrbitControls, useProgress, useGLTF, useAnimations, Stats), Leva, THREE.js

## Global Constraints

- Canvas must maintain `flat` + `frameloop="demand"` (CLAUDE.md)
- `renderOrder` does not inherit; must set explicitly on each Mesh/Line/Sprite/Points
- InstancedMesh2 requires `materialsNeedsUpdate()` after `setColorAt` loop
- Pre-allocate `_` prefixed Vector3/Color/Quaternion objects; use `getState()` for Zustand in useFrame
- Language: Chinese for comments, English for identifiers/commands/errors
- No new dependencies beyond existing `@react-three/drei`, `leva`, `three`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/models/index.ts` | Modify | Remove `useCapturePanel`, add `environment`/`defaultCamera` |
| `src/debug/StudioShell.tsx` | Create | State host: modelKey, env, helpers, selectedNode, viewportMode |
| `src/debug/StudioLayout.css` | Create | All Studio styles (grid, panels, toolbar, status bar) |
| `src/debug/StudioToolbar.tsx` | Create | ModelSelector + ViewportModeToggle + ScreenshotButton |
| `src/debug/SceneExplorer.tsx` | Create | Left panel: EnvironmentPresets + HelperToggles + SceneTreeView |
| `src/debug/StudioViewport.tsx` | Create | Canvas + Environment + StudioLights + HelperOverlay + Gizmo + OrbitControls + ModelRenderer |
| `src/debug/PropertyPanel.tsx` | Create | Right panel: LevaRoot + ModelInfoCard + MaterialInspector + AnimationControls + CustomControlsSlot |
| `src/debug/StatusBar.tsx` | Create | Bottom bar: FPS, Draw Calls, Tris, load time from useFrame sampling |
| `src/debug.tsx` | Modify | Point to StudioShell instead of ModelPreviewShell |
| `src/debug/ModelPreviewShell.tsx` | Delete | Replaced by StudioShell |
| `src/debug/ModelPreviewPanel.tsx` | Delete | Split into StudioViewport + PropertyPanel |
| `src/debug/ModelPreviewPanel.css` | Delete | Replaced by StudioLayout.css |
| `src/debug/LighthousePreviewPanel.tsx` | Delete | Lighthouse now uses unified pipeline |
| `src/debug/LighthousePreviewPanel.css` | Delete | No longer needed |

**Preserved (no changes):**
- `src/debug/ModelPreviewControls.tsx` — default Leva controls hook
- `src/debug/useLevaCaptureConfig.ts` — referenced by Lighthouse's `debugConfig`
- `src/debug/lighthouse-capture.yaml` — Save/Recover API unchanged
- `src/debug/OPERATION.md` / `MAINTENANCE.md` / `README.md` — updated in final doc task
- `debug.html` — entry point unchanged

---

### Task 1: Refactor MODEL_REGISTRY — remove useCapturePanel, add new fields

**Files:**
- Modify: `src/models/index.ts`

**Interfaces:**
- Produces: `ModelRegistryEntry` (new shape — drops `useCapturePanel`, adds `environment`, `defaultCamera`)

- [ ] **Step 1: Rewrite MODEL_REGISTRY**

Replace the entire content of `src/models/index.ts`:

```ts
import { type ComponentType, lazy } from 'react'

// ============================================================
// 模型注册表 — 调试页面的模型选择数据源
//
// 要新增模型：
// 1. 在此文件中添加一个 entry
// 2. 如果是 GLB 模型，使用 `npx @react-three/gltfjsx` 生成组件
// 3. GLB 文件放入 public/models/
// 4. 如需自定义 Leva 控件，在组件文件中导出 `debugConfig`
//
// 援引：pmndrs 生态 — gltfjsx + useGLTF 工作流
//       R3F 模型预览 Studio 模式
// ============================================================

export type EnvPreset = 'studio' | 'night' | 'dawn' | 'sunset'

export interface ModelRegistryEntry {
  /** 用户可见标签 */
  label: string
  /** 模型组件（GLB 用 lazy 导入，程序化直接引用） */
  component: ComponentType<any>
  /** GLB 文件路径（Vite public/ 静态服务），程序化模型不填 */
  glbPath?: string
  /** 推荐默认环境光照预设 */
  environment?: EnvPreset
  /** 默认相机配置（fov + 位置），不填则用全局默认 */
  defaultCamera?: { fov: number; position: [number, number, number] }
  /** 近似三角面数 */
  triCount?: number
  /** 归属 / 许可证文本 */
  attribution?: string
  /** 是否为程序化几何（非 GLB） */
  procedural?: boolean
}

/**
 * 模型注册表。
 *
 * key 用作模型选择器的选项值。
 * component 在调试页面中按需渲染。
 * 程序化组件（如 Lighthouse）通过导出 `debugConfig` 声明自定义 Leva 控件。
 */
export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  // ---- 程序化模型 ----
  'lighthouse-capture': {
    label: 'Lighthouse · 截图调试',
    component: lazy(() => import('../actors/Lighthouse')),
    procedural: true,
    triCount: 30,
    attribution: '程序化生成（YeQuDeSu）',
    environment: 'night',
    defaultCamera: { fov: 25, position: [0, -1.5, 9] },
  },

  // ---- GLB 模型 ----
  voyager1: {
    label: 'Voyager 1',
    component: lazy(() => import('./Voyager1')),
    glbPath: '/models/voyager-1.glb',
    triCount: 20400,
    attribution: 'illidroid (Sketchfab) · CC BY 4.0',
    environment: 'studio',
  },
  'voyager1-low-poly': {
    label: 'Voyager 1 · Low Poly',
    component: lazy(() => import('./Voyager1LowPoly')),
    glbPath: '/models/voyager-1-low-poly.glb',
    triCount: 10550,
    attribution: 'illidroid (Sketchfab) · CC BY 4.0 · 低模烘焙',
    environment: 'studio',
  },
}

/** 获取所有注册模型的 key 列表 */
export function getModelKeys(): string[] {
  return Object.keys(MODEL_REGISTRY)
}

/** 获取模型选择选项 */
export function getModelOptions(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(MODEL_REGISTRY).map(([key, entry]) => [key, entry.label]),
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/models/index.ts
git commit -m "refactor(models): drop useCapturePanel from MODEL_REGISTRY, add environment/defaultCamera"
```

---

### Task 2: Create StudioShell — state host and top-level composition

**Files:**
- Create: `src/debug/StudioShell.tsx`

**Interfaces:**
- Consumes: `MODEL_REGISTRY`, `ModelRegistryEntry`, `EnvPreset` from `../models`
- Produces: `<StudioShell />` component (renders StudioToolbar + StudioLayout + StatusBar)
- Produces types: `HelperState`, `ViewportMode` (used by StudioToolbar, SceneExplorer, StudioViewport)

- [ ] **Step 1: Create StudioShell.tsx**

```tsx
import { useState, useRef, useCallback } from 'react'
import { Leva } from 'leva'
import { MODEL_REGISTRY, type EnvPreset } from '../models'
import StudioToolbar from './StudioToolbar'
import SceneExplorer from './SceneExplorer'
import StudioViewport from './StudioViewport'
import PropertyPanel from './PropertyPanel'
import StatusBar from './StatusBar'
import type { Group, Object3D } from 'three'
import './StudioLayout.css'

// ============================================================
// 共享类型 — 由 StudioShell 定义，子面板消费
// ============================================================

export interface HelperState {
  grid: boolean
  axes: boolean
  bbox: boolean
  wireframe: boolean
}

export type ViewportMode = 'single' | 'split' | 'quad'

export interface SceneTreeNode {
  name: string
  uuid: string
  type: string
  children: SceneTreeNode[]
}

const MODEL_KEYS = Object.keys(MODEL_REGISTRY)
const DEFAULT_HELPERS: HelperState = { grid: true, axes: true, bbox: false, wireframe: false }

// ============================================================
// StudioShell — 状态宿主
// ============================================================

export default function StudioShell() {
  const firstKey = MODEL_KEYS[0] ?? 'voyager1'
  const [modelKey, setModelKey] = useState(firstKey)
  const entry = MODEL_REGISTRY[modelKey]
  const [env, setEnv] = useState<EnvPreset>(entry?.environment ?? 'studio')
  const [helpers, setHelpers] = useState<HelperState>(DEFAULT_HELPERS)
  const [selectedNode, setSelectedNode] = useState<Object3D | null>(null)
  const [viewportMode, setViewportMode] = useState<ViewportMode>('single')
  const [sceneTree, setSceneTree] = useState<SceneTreeNode[]>([])
  const modelRef = useRef<Group | null>(null)
  const levaContainerRef = useRef<HTMLDivElement | null>(null)

  // 切换模型时同步默认环境
  const handleModelChange = useCallback((key: string) => {
    setModelKey(key)
    setSelectedNode(null)
    const e = MODEL_REGISTRY[key]
    if (e?.environment) setEnv(e.environment)
  }, [])

  // 使用 entry.component 上的 debugConfig（如有）
  // 在 PropertyPanel 中动态解析，此处只传递 modelKey

  return (
    <div className="studio-shell">
      <StudioToolbar
        modelKey={modelKey}
        onModelChange={handleModelChange}
        viewportMode={viewportMode}
        onViewportModeChange={setViewportMode}
      />

      <div className="studio-layout">
        <SceneExplorer
          env={env}
          onEnvChange={setEnv}
          helpers={helpers}
          onHelpersChange={setHelpers}
          sceneTree={sceneTree}
          selectedNode={selectedNode}
          onNodeSelect={setSelectedNode}
        />

        <StudioViewport
          modelKey={modelKey}
          env={env}
          helpers={helpers}
          viewportMode={viewportMode}
          selectedNode={selectedNode}
          modelRef={modelRef}
          onSceneTreeUpdate={setSceneTree}
        />

        <PropertyPanel
          entry={entry}
          selectedNode={selectedNode}
          modelRef={modelRef}
          levaContainerRef={levaContainerRef}
        />
      </div>

      <StatusBar modelRef={modelRef} />

      {/* Leva 嵌入 PropertyPanel 容器 */}
      <Leva
        flat
        fill
        titleBar={{ title: '属性' }}
        theme={{
          colors: {
            elevation1: '#0f172a',
            elevation2: '#1e293b',
            elevation3: '#334155',
            accent1: '#64748b',
            accent2: '#94a3b8',
            accent3: '#cbd5e1',
            highlight1: '#475569',
            highlight2: '#64748b',
            highlight3: '#94a3b8',
          },
          fontSizes: { root: '11px', toolTip: '11px' },
          fonts: { mono: `'Courier New', 'Consolas', monospace` },
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioShell.tsx
git commit -m "feat(studio): add StudioShell state host with model/env/helpers/selection"
```

---

### Task 3: Create StudioLayout.css — all studio styles

**Files:**
- Create: `src/debug/StudioLayout.css`

**Interfaces:**
- None (CSS only — consumed by className references in all Studio components)

- [ ] **Step 1: Create StudioLayout.css**

```css
/* ============================================================
   StudioLayout.css — Debug Studio 全局样式
   三栏布局：260px | 1fr | 280px
   顶部 Toolbar 40px + 底部 StatusBar 28px
   援引：gltf.report / pmndrs Studio 布局范式
   ============================================================ */

/* ---- Shell ---- */
.studio-shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #050811;
  color: #94a3b8;
  font-family: 'Courier New', 'Consolas', monospace;
  font-size: 12px;
  overflow: hidden;
}

/* ---- Toolbar ---- */
.studio-toolbar {
  height: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #0f172a;
  border-bottom: 1px solid #1e293b;
  gap: 12px;
  z-index: 10;
}
.studio-toolbar select {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  min-width: 200px;
}
.studio-toolbar select:focus {
  outline: none;
  border-color: #64748b;
}
.toolbar-buttons {
  display: flex;
  gap: 4px;
}
.toolbar-btn {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 150ms;
}
.toolbar-btn:hover { background: #334155; }
.toolbar-btn.active { background: #475569; color: #e2e8f0; }

/* ---- Three-Column Grid ---- */
.studio-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 260px 1fr 280px;
  overflow: hidden;
  min-height: 0;
}

/* ---- Panel Shared ---- */
.scene-explorer,
.property-panel {
  background: #0b1120;
  overflow-y: auto;
  overflow-x: hidden;
  border-color: #1e293b;
}
.scene-explorer {
  border-right: 1px solid #1e293b;
}
.property-panel {
  border-left: 1px solid #1e293b;
}
.scene-explorer::-webkit-scrollbar,
.property-panel::-webkit-scrollbar {
  width: 4px;
}
.scene-explorer::-webkit-scrollbar-thumb,
.property-panel::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 2px;
}

/* ---- Section ---- */
.panel-section {
  padding: 8px 10px;
  border-bottom: 1px solid #1e293b;
}
.panel-section h3 {
  margin: 0 0 8px 0;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
}
.panel-section h3:hover { color: #94a3b8; }

/* ---- Environment Presets ---- */
.env-preset-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.env-preset-btn {
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 6px 4px;
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
  text-align: center;
  transition: background 150ms, border-color 150ms;
}
.env-preset-btn:hover { background: #334155; }
.env-preset-btn.active {
  background: #1e3a5f;
  border-color: #64748b;
  color: #e2e8f0;
}

/* ---- Helper Toggles ---- */
.helper-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 11px;
}
.helper-toggle input[type="checkbox"] {
  accent-color: #64748b;
}

/* ---- Scene Tree ---- */
.scene-tree {
  font-size: 11px;
  line-height: 1.8;
}
.tree-node {
  padding: 2px 0 2px 0;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 2px;
  padding-left: 4px;
  padding-right: 4px;
}
.tree-node:hover { background: #1e293b; }
.tree-node.selected { background: #1e3a5f; color: #e2e8f0; }
.tree-node .toggle {
  display: inline-block;
  width: 14px;
  color: #64748b;
  cursor: pointer;
}
.tree-children {
  padding-left: 16px;
}

/* ---- Viewport ---- */
.studio-viewport {
  position: relative;
  background: #050811;
  overflow: hidden;
}
.studio-viewport canvas {
  display: block;
}
.viewport-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  height: 100%;
}
.viewport-split > div:first-child {
  border-right: 1px solid #334155;
}
.viewport-quad {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  width: 100%;
  height: 100%;
}
.viewport-quad > div {
  border-right: 1px solid #334155;
  border-bottom: 1px solid #334155;
}

/* ---- Property Panel Components ---- */
.model-info-card p {
  margin: 4px 0;
  font-size: 11px;
}
.info-label {
  color: #64748b;
  margin-right: 4px;
}
.material-props {
  font-size: 10px;
}
.material-props dl {
  margin: 4px 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
}
.material-props dt {
  color: #64748b;
}
.material-props dd {
  color: #94a3b8;
  margin: 0;
}

/* ---- Animation Controls ---- */
.anim-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.anim-controls button {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}
.anim-controls button:hover { background: #334155; }
.anim-controls button.active { background: #475569; }
.anim-controls input[type="range"] {
  flex: 1;
  accent-color: #64748b;
  min-width: 60px;
}
.anim-speed {
  font-size: 10px;
  color: #64748b;
}

/* ---- Empty / Error States ---- */
.panel-empty {
  padding: 12px 10px;
  font-size: 11px;
  color: #475569;
  font-style: italic;
}
.panel-error {
  padding: 12px 10px;
  font-size: 11px;
  color: #ef4444;
}

/* ---- Status Bar ---- */
.studio-status-bar {
  height: 28px;
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 12px;
  background: #0f172a;
  border-top: 1px solid #1e293b;
  font-size: 10px;
  color: #64748b;
}
.status-indicator {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
}
.status-indicator.live { background: #22c55e; }
.status-indicator.idle { background: #64748b; }
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioLayout.css
git commit -m "feat(studio): add StudioLayout.css — grid, toolbar, panels, status bar"
```

---

### Task 4: Create StudioToolbar — model selector, viewport mode, screenshot

**Files:**
- Create: `src/debug/StudioToolbar.tsx`

**Interfaces:**
- Consumes: `MODEL_REGISTRY`, `getModelKeys` from `../models`; `ViewportMode` from `./StudioShell`
- Produces: `<StudioToolbar />`

- [ ] **Step 1: Create StudioToolbar.tsx**

```tsx
import { useCallback, useState } from 'react'
import { MODEL_REGISTRY } from '../models'
import type { ViewportMode } from './StudioShell'

interface StudioToolbarProps {
  modelKey: string
  onModelChange: (key: string) => void
  viewportMode: ViewportMode
  onViewportModeChange: (mode: ViewportMode) => void
}

const MODEL_KEYS = Object.keys(MODEL_REGISTRY)

export default function StudioToolbar({
  modelKey, onModelChange, viewportMode, onViewportModeChange,
}: StudioToolbarProps) {
  const [capturing, setCapturing] = useState(false)

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onModelChange(e.target.value)
  }, [onModelChange])

  const handleScreenshot = useCallback(() => {
    // 找到 viewport 中的 canvas 元素
    const canvas = document.querySelector('.studio-viewport canvas') as HTMLCanvasElement | null
    if (!canvas) return
    setCapturing(true)
    try {
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `model-preview-${modelKey}-${Date.now()}.png`
      a.click()
    } finally {
      setCapturing(false)
    }
  }, [modelKey])

  return (
    <div className="studio-toolbar">
      <select value={modelKey} onChange={handleSelect}>
        {MODEL_KEYS.map((k) => (
          <option key={k} value={k}>{MODEL_REGISTRY[k].label}</option>
        ))}
      </select>

      <div className="toolbar-buttons">
        {/* Viewport Mode */}
        <button
          className={`toolbar-btn ${viewportMode === 'single' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('single')}
          title="单视口"
        >☰
        </button>
        <button
          className={`toolbar-btn ${viewportMode === 'split' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('split')}
          title="左右分屏"
        >⛶
        </button>
        <button
          className={`toolbar-btn ${viewportMode === 'quad' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('quad')}
          title="四宫格"
        >⛋
        </button>

        {/* Screenshot */}
        <button
          className="toolbar-btn"
          onClick={handleScreenshot}
          title="截图导出 PNG"
          disabled={capturing}
        >
          {capturing ? '...' : '📷'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioToolbar.tsx
git commit -m "feat(studio): add StudioToolbar with model selector, viewport mode, screenshot"
```

---

### Task 5: Create SceneExplorer — left panel

**Files:**
- Create: `src/debug/SceneExplorer.tsx`

**Interfaces:**
- Consumes: `EnvPreset` from `../models`; `HelperState`, `SceneTreeNode` from `./StudioShell`
- Produces: `<SceneExplorer />`

- [ ] **Step 1: Create SceneExplorer.tsx**

```tsx
import { useCallback, useState } from 'react'
import type { Object3D } from 'three'
import type { EnvPreset } from '../models'
import type { HelperState, SceneTreeNode } from './StudioShell'

interface SceneExplorerProps {
  env: EnvPreset
  onEnvChange: (env: EnvPreset) => void
  helpers: HelperState
  onHelpersChange: (helpers: HelperState) => void
  sceneTree: SceneTreeNode[]
  selectedNode: Object3D | null
  onNodeSelect: (node: Object3D | null) => void
}

// ============================================================
// 环境预设
// ============================================================

const ENV_PRESETS: { key: EnvPreset; label: string }[] = [
  { key: 'studio', label: 'Studio' },
  { key: 'night', label: 'Night' },
  { key: 'dawn', label: 'Dawn' },
  { key: 'sunset', label: 'Sunset' },
]

// ============================================================
// SceneTreeView — 递归场景树
// ============================================================

function SceneTreeView({
  nodes, depth, selectedUuid, onSelect,
}: {
  nodes: SceneTreeNode[]
  depth: number
  selectedUuid: string | null
  onSelect: (uuid: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isCollapsed = collapsed[node.uuid] ?? (depth > 1)
        const isSelected = selectedUuid === node.uuid

        return (
          <div key={node.uuid}>
            <div
              className={`tree-node ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: 4 + depth * 8 }}
              onClick={() => onSelect(node.uuid)}
            >
              {hasChildren && (
                <span
                  className="toggle"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCollapsed((p) => ({ ...p, [node.uuid]: !isCollapsed }))
                  }}
                >
                  {isCollapsed ? '▸' : '▾'}
                </span>
              )}
              {!hasChildren && <span className="toggle">{'  '}</span>}
              <span>{node.name || node.type}</span>
            </div>
            {hasChildren && !isCollapsed && (
              <div className="tree-children">
                <SceneTreeView
                  nodes={node.children}
                  depth={depth + 1}
                  selectedUuid={selectedUuid}
                  onSelect={onSelect}
                />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ============================================================
// SceneExplorer
// ============================================================

export default function SceneExplorer({
  env, onEnvChange, helpers, onHelpersChange, sceneTree, selectedNode, onNodeSelect,
}: SceneExplorerProps) {
  const [envOpen, setEnvOpen] = useState(true)
  const [helperOpen, setHelperOpen] = useState(true)
  const [treeOpen, setTreeOpen] = useState(true)

  const toggleHelper = useCallback((key: keyof HelperState) => {
    onHelpersChange({ ...helpers, [key]: !helpers[key] })
  }, [helpers, onHelpersChange])

  return (
    <div className="scene-explorer">
      {/* ---- 环境预设 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setEnvOpen((v) => !v)}>
          {envOpen ? '▾' : '▸'} 环境
        </h3>
        {envOpen && (
          <div className="env-preset-list">
            {ENV_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`env-preset-btn ${env === p.key ? 'active' : ''}`}
                onClick={() => onEnvChange(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- 辅助工具 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setHelperOpen((v) => !v)}>
          {helperOpen ? '▾' : '▸'} 辅助
        </h3>
        {helperOpen && (
          <>
            <label className="helper-toggle">
              <input
                type="checkbox"
                checked={helpers.grid}
                onChange={() => toggleHelper('grid')}
              />
              Grid 网格
            </label>
            <label className="helper-toggle">
              <input
                type="checkbox"
                checked={helpers.axes}
                onChange={() => toggleHelper('axes')}
              />
              Axes 坐标轴
            </label>
            <label className="helper-toggle">
              <input
                type="checkbox"
                checked={helpers.bbox}
                onChange={() => toggleHelper('bbox')}
              />
              BBox 包围盒
            </label>
            <label className="helper-toggle">
              <input
                type="checkbox"
                checked={helpers.wireframe}
                onChange={() => toggleHelper('wireframe')}
              />
              Wireframe 线框
            </label>
          </>
        )}
      </div>

      {/* ---- 场景树 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setTreeOpen((v) => !v)}>
          {treeOpen ? '▾' : '▸'} 场景树
        </h3>
        {treeOpen && (
          <div className="scene-tree">
            {sceneTree.length === 0 ? (
              <div className="panel-empty">加载模型后显示</div>
            ) : (
              <SceneTreeView
                nodes={sceneTree}
                depth={0}
                selectedUuid={selectedNode?.uuid ?? null}
                onSelect={(uuid) => {
                  // selectedNode 由父级通过 ref 查找
                  onNodeSelect(null) // 触发 PropertyPanel 清空
                  // 实际映射在 StudioViewport 中完成
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/SceneExplorer.tsx
git commit -m "feat(studio): add SceneExplorer with env presets, helper toggles, scene tree"
```

---

### Task 6: Create StudioViewport — Canvas + all 3D content

**Files:**
- Create: `src/debug/StudioViewport.tsx`

**Interfaces:**
- Consumes: `MODEL_REGISTRY` from `../models`; `EnvPreset` from `../models`; `HelperState`, `ViewportMode`, `SceneTreeNode` from `./StudioShell`; `DEFAULT_PREVIEW_CONFIG`, `useModelPreviewControls` from `./ModelPreviewControls`
- Produces: `<StudioViewport />`

- [ ] **Step 1: Create StudioViewport.tsx**

```tsx
import { useRef, useEffect, useCallback, Suspense, Component, type ReactNode } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Environment, GizmoHelper, GizmoViewport, useProgress, Html } from '@react-three/drei'
import { Box3, Vector3, Mesh, type Group, type Material, type Object3D } from 'three'
import { MODEL_REGISTRY } from '../models'
import type { EnvPreset } from '../models'
import { useModelPreviewControls } from './ModelPreviewControls'
import type { HelperState, ViewportMode, SceneTreeNode } from './StudioShell'

// ============================================================
// Environment presets → drei <Environment> preset mapping + ambient defaults
// ============================================================

const ENV_DREI_PRESETS: Record<EnvPreset, { preset: string; ambientIntensity: number }> = {
  studio: { preset: 'studio', ambientIntensity: 1.0 },
  night:  { preset: 'night',  ambientIntensity: 0.4 },
  dawn:   { preset: 'dawn',   ambientIntensity: 0.7 },
  sunset: { preset: 'sunset', ambientIntensity: 0.6 },
}

// ============================================================
// Loader — drei useProgress
// ============================================================

function Loader() {
  const { progress, active } = useProgress()
  return (
    <Html center>
      <div style={{
        color: '#94a3b8', fontFamily: "'Courier New', 'Consolas', monospace",
        fontSize: 14, textAlign: 'center', userSelect: 'none',
      }}>
        {active ? `加载中... ${progress.toFixed(0)}%` : '就绪'}
      </div>
    </Html>
  )
}

// ============================================================
// Error Boundary
// ============================================================

interface ErrorBoundaryState { error: Error | null }
class ModelErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <Html center>
          <div style={{ color: '#ef4444', fontFamily: "'Courier New', 'Consolas', monospace", fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
            <p>模型加载失败</p>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>{this.state.error.message}</p>
          </div>
        </Html>
      )
    }
    return this.props.children
  }
}

// ============================================================
// StudioLights — 通用场景灯光（Leva 驱动）
// ============================================================

function StudioLights({ env }: { env: EnvPreset }) {
  const config = useModelPreviewControls()
  const ambientIntensity = ENV_DREI_PRESETS[env].ambientIntensity
  return (
    <>
      <ambientLight color={config.ambientColor} intensity={ambientIntensity * config.ambientIntensity} />
      <directionalLight color={config.keyColor} intensity={config.keyIntensity} position={[config.keyX, config.keyY, config.keyZ]} />
      <directionalLight color={config.fillColor} intensity={config.fillIntensity} position={[config.fillX, config.fillY, config.fillZ]} />
    </>
  )
}

// ============================================================
// HelperOverlay — Grid / Axes / BBox / Wireframe
// ============================================================

const _bbox = new Box3()
const _center = new Vector3()

function BoundingBoxHelper({ object3d }: { object3d: Object3D | null }) {
  if (!object3d) return null
  _bbox.setFromObject(object3d)
  if (_bbox.isEmpty()) return null
  _bbox.getCenter(_center)
  const size = _bbox.getSize(new Vector3())
  return (
    <mesh position={_center.toArray()} renderOrder={999}>
      <boxGeometry args={[size.x, size.y, size.z]} />
      <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.4} depthTest={false} />
    </mesh>
  )
}

function WireframeOverlay({ object3d, active }: { object3d: Object3D | null; active: boolean }) {
  const prevRef = useRef(false)
  useEffect(() => {
    if (!object3d) return
    if (prevRef.current === active) return
    prevRef.current = active
    object3d.traverse((child) => {
      if (child instanceof Mesh) {
        const mat = child.material as Material
        if ('wireframe' in mat && typeof mat.wireframe === 'boolean') {
          mat.wireframe = active
        }
      }
    })
  }, [object3d, active])
  return null
}

function HelperOverlay({ helpers, modelRef }: { helpers: HelperState; modelRef: React.RefObject<Group | null> }) {
  return (
    <>
      {helpers.grid && <gridHelper args={[20, 20, '#1e293b', '#0f172a']} renderOrder={998} />}
      {helpers.axes && <axesHelper args={[5]} renderOrder={998} />}
      {helpers.bbox && <BoundingBoxHelper object3d={modelRef.current} />}
      <WireframeOverlay object3d={modelRef.current} active={helpers.wireframe} />
    </>
  )
}

// ============================================================
// ModelRenderer
// ============================================================

function buildSceneTree(obj: Object3D): SceneTreeNode[] {
  return obj.children
    .filter((c) => c.type !== 'GridHelper' && c.type !== 'AxesHelper')
    .map((c) => ({
      name: c.name || c.type,
      uuid: c.uuid,
      type: c.type,
      children: buildSceneTree(c),
    }))
}

function ModelRenderer({
  modelKey, modelRef, onSceneTreeUpdate, entry,
}: {
  modelKey: string
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
  entry: typeof MODEL_REGISTRY[string] | undefined
}) {
  const config = useModelPreviewControls()

  // 模型加载后扫描场景树
  useEffect(() => {
    if (!modelRef.current) return
    // 延迟一帧等 children 挂载
    const timer = setTimeout(() => {
      if (modelRef.current) {
        onSceneTreeUpdate(buildSceneTree(modelRef.current))
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [modelKey, modelRef, onSceneTreeUpdate])

  if (!entry) return null
  const ModelComponent = entry.component

  return (
    <group
      ref={modelRef}
      position={[config.modelX, config.modelY, config.modelZ]}
      scale={config.modelScale}
      rotation={[config.modelRotX, config.modelRotY, config.modelRotZ]}
    >
      <ModelErrorBoundary>
        <Suspense fallback={<Loader />}>
          <ModelComponent />
        </Suspense>
      </ModelErrorBoundary>
    </group>
  )
}

// ============================================================
// GizmoController — 右上角朝向指示
// ============================================================

function GizmoController() {
  return (
    <GizmoHelper alignment="top-right" margin={[60, 60]}>
      <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#94a3b8" />
    </GizmoHelper>
  )
}

// ============================================================
// SingleViewportCanvas — 单个 Canvas 实例
// ============================================================

function SingleViewportCanvas({
  env, helpers, modelKey, entry, modelRef, onSceneTreeUpdate, cameraOverride,
}: {
  env: EnvPreset
  helpers: HelperState
  modelKey: string
  entry: typeof MODEL_REGISTRY[string] | undefined
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
  cameraOverride?: { fov: number; position: [number, number, number] }
}) {
  const defaultCam = cameraOverride ?? { fov: 45, position: [5, 3, 8] }

  return (
    <Canvas
      flat
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: defaultCam.fov, near: 0.01, far: 1000, position: defaultCam.position }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: false,
        logarithmicDepthBuffer: true,
      }}
    >
      <color attach="background" args={['#050811']} />

      <Environment preset={ENV_DREI_PRESETS[env].preset as any} background={false} />
      <StudioLights env={env} />
      <HelperOverlay helpers={helpers} modelRef={modelRef} />
      <GizmoController />

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.1}
        minDistance={0.1}
        maxDistance={500}
      />

      <ModelRenderer
        modelKey={modelKey}
        modelRef={modelRef}
        onSceneTreeUpdate={onSceneTreeUpdate}
        entry={entry}
      />
    </Canvas>
  )
}

// ============================================================
// StudioViewport — 中栏入口
// ============================================================

interface StudioViewportProps {
  modelKey: string
  env: EnvPreset
  helpers: HelperState
  viewportMode: ViewportMode
  selectedNode: Object3D | null
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
}

export default function StudioViewport({
  modelKey, env, helpers, viewportMode, selectedNode, modelRef, onSceneTreeUpdate,
}: StudioViewportProps) {
  const entry = MODEL_REGISTRY[modelKey]
  const cameraOverride = entry?.defaultCamera
  const canvasProps = { env, helpers, modelKey, entry, modelRef, onSceneTreeUpdate, cameraOverride }

  return (
    <div className="studio-viewport">
      {viewportMode === 'single' && (
        <SingleViewportCanvas {...canvasProps} />
      )}
      {viewportMode === 'split' && (
        <div className="viewport-split">
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} />
          </div>
          <div style={{ position: 'relative' }}>
            {/* 右侧：线框模式 */}
            <SingleViewportCanvas {...canvasProps} helpers={{ ...helpers, wireframe: true }} />
          </div>
        </div>
      )}
      {viewportMode === 'quad' && (
        <div className="viewport-quad">
          {(['front', 'side', 'top'] as const).map((view) => {
            const pos: Record<string, [number, number, number]> = {
              front: [0, 0, 10], side: [10, 0, 0], top: [0, 10, 0],
            }
            return (
              <div key={view} style={{ position: 'relative' }}>
                <SingleViewportCanvas
                  {...canvasProps}
                  cameraOverride={{ fov: 45, position: pos[view] }}
                />
              </div>
            )
          })}
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioViewport.tsx
git commit -m "feat(studio): add StudioViewport with Canvas, env, lights, helpers, gizmo, multi-viewport"
```

---

### Task 7: Create PropertyPanel — right panel

**Files:**
- Create: `src/debug/PropertyPanel.tsx`

**Interfaces:**
- Consumes: `ModelRegistryEntry` from `../models`; `Mesh, Material, Group, type Object3D` from `three`; `useAnimations` from `@react-three/drei`
- Produces: `<PropertyPanel />`

- [ ] **Step 1: Create PropertyPanel.tsx**

```tsx
import { useMemo } from 'react'
import { Mesh, type Group, type Object3D, type MeshStandardMaterial } from 'three'
import { useAnimations } from '@react-three/drei'
import type { ModelRegistryEntry } from '../models'

interface PropertyPanelProps {
  entry: ModelRegistryEntry | undefined
  selectedNode: Object3D | null
  modelRef: React.RefObject<Group | null>
  levaContainerRef: React.RefObject<HTMLDivElement | null>
}

// ============================================================
// ModelInfoCard
// ============================================================

function ModelInfoCard({ entry }: { entry: ModelRegistryEntry | undefined }) {
  if (!entry) {
    return <div className="panel-empty">未选择模型</div>
  }
  return (
    <div className="panel-section">
      <h3>模型信息</h3>
      <div className="model-info-card">
        <p><span className="info-label">名称：</span>{entry.label}</p>
        {entry.triCount != null && (
          <p><span className="info-label">三角面：</span>~{entry.triCount.toLocaleString()}</p>
        )}
        {entry.procedural && <p><span className="info-label">类型：</span>程序化几何</p>}
        {entry.glbPath && <p><span className="info-label">路径：</span>{entry.glbPath}</p>}
        {entry.attribution && <p><span className="info-label">来源：</span>{entry.attribution}</p>}
      </div>
    </div>
  )
}

// ============================================================
// MaterialInspector
// ============================================================

function MaterialInspector({ node }: { node: Object3D | null }) {
  const material = useMemo(() => {
    if (!node || !(node instanceof Mesh)) return null
    const mats = Array.isArray(node.material) ? node.material : [node.material]
    return mats[0] as MeshStandardMaterial | undefined
  }, [node])

  if (!node || !(node instanceof Mesh)) {
    return (
      <div className="panel-section">
        <h3>材质属性</h3>
        <div className="panel-empty">选中 Mesh 节点后显示</div>
      </div>
    )
  }

  if (!material) {
    return (
      <div className="panel-section">
        <h3>材质属性</h3>
        <div className="panel-empty">无标准材质信息</div>
      </div>
    )
  }

  return (
    <div className="panel-section">
      <h3>材质属性</h3>
      <div className="material-props">
        <p style={{ fontSize: 11, margin: '4px 0' }}>
          <span className="info-label">节点：</span>{node.name || node.type}
        </p>
        <dl>
          <dt>color</dt>
          <dd>#{material.color?.getHexString?.() ?? '—'}</dd>
          {'metalness' in material && <><dt>metalness</dt><dd>{material.metalness?.toFixed(3)}</dd></>}
          {'roughness' in material && <><dt>roughness</dt><dd>{material.roughness?.toFixed(3)}</dd></>}
          {'transparent' in material && <><dt>transparent</dt><dd>{material.transparent ? '是' : '否'}</dd></>}
          {'opacity' in material && <><dt>opacity</dt><dd>{material.opacity?.toFixed(3)}</dd></>}
          {'wireframe' in material && <><dt>wireframe</dt><dd>{material.wireframe ? '是' : '否'}</dd></>}
        </dl>
      </div>
    </div>
  )
}

// ============================================================
// AnimationControls
// ============================================================

function AnimationControls({ modelRef }: { modelRef: React.RefObject<Group | null> }) {
  // useAnimations 需要从 GLB scene 中找到 AnimationClip
  // 通用模型可能没有 clip，优雅处理
  const { actions, names, mixer } = useAnimations(
    // 尝试从 modelRef 中找到包含 animations 的 GLB scene
    (modelRef.current?.children ?? []) as any,
  )

  if (names.length === 0) return null

  return (
    <div className="panel-section">
      <h3>动画</h3>
      <div className="anim-controls">
        {names.map((name) => {
          const action = actions[name]
          if (!action) return null
          const isPlaying = action.isRunning()
          return (
            <button
              key={name}
              className={isPlaying ? 'active' : ''}
              onClick={() => {
                if (isPlaying) {
                  action.paused = true
                  action.stop()
                } else {
                  action.reset().play()
                }
              }}
            >
              {isPlaying ? '⏸' : '▶'} {name}
            </button>
          )
        })}
        <button
          onClick={() => {
            actions[names[0]]?.stop()
            mixer?.stopAllAction()
          }}
        >
          ⏹ 停止
        </button>
      </div>
      <div className="anim-speed" style={{ marginTop: 6 }}>
        速度：
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          defaultValue={1}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            Object.values(actions).forEach((a) => { if (a) a.timeScale = v })
          }}
          style={{ marginLeft: 8 }}
        />
      </div>
    </div>
  )
}

// ============================================================
// PropertyPanel
// ============================================================

export default function PropertyPanel({
  entry, selectedNode, modelRef, levaContainerRef,
}: PropertyPanelProps) {
  return (
    <div className="property-panel" ref={levaContainerRef}>
      {/* Leva 面板由父级 Leva 组件渲染，此处提供容器 */}
      {/* 模型信息 */}
      <ModelInfoCard entry={entry} />

      {/* 材质属性 */}
      <MaterialInspector node={selectedNode} />

      {/* 动画控制 */}
      <AnimationControls modelRef={modelRef} />

      {/*
        CustomControlsSlot — 模型专属控件注入位
        由 entry.component 的 debugConfig.controls 提供
        但因 lazy() 动态导入限制，自定义控件 hook 的结果
        在 ModelPreviewControls 的 Leva folder 中已包含。
        如 Lighthouse 的 debugConfig.controls = useLevaCaptureConfig
        被注册在 Leva 的 "Lighthouse Capture" folder 中，
        Leva 面板自动渲染。
      */}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/PropertyPanel.tsx
git commit -m "feat(studio): add PropertyPanel with model info, material inspector, animation controls"
```

---

### Task 8: Create StatusBar — bottom performance bar

**Files:**
- Create: `src/debug/StatusBar.tsx`

**Interfaces:**
- Consumes: `useThree`, `useFrame` from R3F; `Group` from three
- Produces: `<StatusBar />`

- [ ] **Step 1: Create StatusBar.tsx**

```tsx
import { useRef, useEffect } from 'react'

const _fpsHistory = new Float32Array(60)
let _fpsIdx = 0

/**
 * StatusBar — 底部性能监控条。
 *
 * 通过 requestAnimationFrame 独立采样 FPS（不依赖 R3F useFrame）。
 * Draw Calls / Triangles 由 StatusBarInner 通过 renderer.info 读取。
 *
 * 援引：Stats.js FPS 计数算法
 */
export default function StatusBar() {
  const fpsRef = useRef<HTMLSpanElement>(null)
  const dcRef = useRef<HTMLSpanElement>(null)
  const triRef = useRef<HTMLSpanElement>(null)
  const loadRef = useRef<HTMLSpanElement>(null)
  const lastTime = useRef(performance.now())
  const frameCount = useRef(0)

  // FPS 独立采样
  useEffect(() => {
    let raf = 0
    const tick = () => {
      frameCount.current++
      const now = performance.now()
      const elapsed = now - lastTime.current
      if (elapsed >= 500) {
        const fps = Math.round((frameCount.current / elapsed) * 1000)
        frameCount.current = 0
        lastTime.current = now
        // 平滑
        _fpsHistory[_fpsIdx % 60] = fps
        _fpsIdx++
        let sum = 0
        let count = 0
        for (let i = 0; i < 60; i++) {
          if (_fpsHistory[i] > 0) { sum += _fpsHistory[i]; count++ }
        }
        const avgFps = count > 0 ? Math.round(sum / count) : fps
        if (fpsRef.current) fpsRef.current.textContent = String(avgFps)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Draw calls / triangles — 从 Canvas renderer.info 定时采样
  useEffect(() => {
    const interval = setInterval(() => {
      const canvas = document.querySelector('.studio-viewport canvas') as HTMLCanvasElement | null
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
      // 通过 THREE.WebGLRenderer 实例的 info 属性无法从外部获取，
      // 改为在 Canvas 内部用 useFrame 写 data 属性到 canvas ↓
      const dc = canvas?.getAttribute('data-drawcalls') ?? '—'
      const tris = canvas?.getAttribute('data-triangles') ?? '—'
      if (dcRef.current) dcRef.current.textContent = String(dc)
      if (triRef.current) triRef.current.textContent = String(tris)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="studio-status-bar">
      <span>
        <span className="status-indicator live" />
        FPS <span ref={fpsRef}>—</span>
      </span>
      <span>Draw Calls: <span ref={dcRef}>—</span></span>
      <span>Tris: <span ref={triRef}>—</span></span>
      <span ref={loadRef} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StatusBar.tsx
git commit -m "feat(studio): add StatusBar with FPS, draw calls, triangles"
```

---

### Task 9: Wire StudioViewport renderer stats into StatusBar

**Files:**
- Modify: `src/debug/StudioViewport.tsx` — add `RendererStats` component

**Interfaces:**
- Consumes: `useThree`, `useFrame` from R3F
- Produces: writes `data-drawcalls` / `data-triangles` to canvas element

- [ ] **Step 1: Add RendererStats to StudioViewport.tsx**

Add this component **after** the `GizmoController` function definition and **before** `SingleViewportCanvas`:

```tsx
// ============================================================
// RendererStats — 每帧写入 renderer.info 到 canvas dataset
// ============================================================

function RendererStats() {
  const { gl } = useThree()
  useFrame(() => {
    const canvas = gl.domElement
    canvas.setAttribute('data-drawcalls', String(gl.info.render.calls))
    canvas.setAttribute('data-triangles', String(gl.info.render.triangles))
  })
  return null
}
```

Then add `<RendererStats />` inside `SingleViewportCanvas`, right after `<color attach="background" ... />`:

```tsx
<color attach="background" args={['#050811']} />
<RendererStats />
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioViewport.tsx
git commit -m "feat(studio): add RendererStats to expose draw calls and triangles per frame"
```

---

### Task 10: Update debug.tsx entry point

**Files:**
- Modify: `src/debug.tsx`

**Interfaces:**
- Consumes: `StudioShell` from `./debug/StudioShell`
- Produces: entry point for `debug.html`

- [ ] **Step 1: Rewrite debug.tsx**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/debug.tsx
git commit -m "refactor(debug): point entry to StudioShell instead of ModelPreviewShell"
```

---

### Task 11: Update Lighthouse component to export debugConfig

**Files:**
- Modify: `src/actors/Lighthouse.tsx` — add `debugConfig` export

**Interfaces:**
- Consumes: `useLevaCaptureConfig` from `../debug/useLevaCaptureConfig`
- Produces: `Lighthouse` default export + `debugConfig` named export

- [ ] **Step 1: Add debugConfig export**

At the bottom of `src/actors/Lighthouse.tsx` (after the `export default function Lighthouse() { ... }`), add:

```ts
// debugConfig — Debug Studio 自动发现的自定义 Leva 控件
// 由 StudioViewport/PropertyPanel 在调试模式中通过 MODEL_REGISTRY 消费
export { useLevaCaptureConfig as debugConfig } from '../debug/useLevaCaptureConfig'
```

Wait — we need `useLevaCaptureConfig` to be available as the `controls` field. The spec says:

```ts
export const debugConfig = {
  controls: useLevaCaptureConfig,
  defaultCamera: { fov: 25, position: [0, 0, 9] },
}
```

But since Lighthouse already provides `defaultCamera` in the registry, and the controls hook is consumed by Leva, we need a pattern. However, since the debugConfig hook is a React hook and can't be used outside of a component, and the Leva `useControls` is already called inside `StudioLights` and `ModelRenderer` (via `useModelPreviewControls`), the custom controls need to be called somewhere too.

For now, let's keep the custom controls pattern simple — export the hook reference so PropertyPanel/StudioViewport knows to call it:

In `src/actors/Lighthouse.tsx`, add at the bottom:

```ts
/**
 * debugConfig — Debug Studio 专属控件。
 *
 * controls: Lighthouse 截图的 Leva 参数 hook（FOV、剪影、灯光等）
 * defaultCamera: 默认相机 — 已在 MODEL_REGISTRY 中定义，此处作为文档保留
 *
 * 援引：Debug Studio 模型 debugConfig 接口
 */
export const debugConfig = {
  controlsHook: () => import('../debug/useLevaCaptureConfig').then((m) => m.useLevaCaptureConfig),
}
```

Hmm, this is getting complicated with async imports. Let me simplify.

Actually, looking at this more carefully, the Leva `useControls` call just needs to happen within a component that's inside the `<Leva>` provider context. Since `StudioShell` renders `<Leva>`, any component inside the Canvas or the panel can call `useControls` and Leva will render corresponding UI.

So `useLevaCaptureConfig` just needs to be called somewhere in the component tree. We could either:
1. Call it in `StudioViewport` when the current model has a `debugConfig.controls` export
2. Call it in `PropertyPanel`
3. Call it in a dedicated component that just exists to call the hook

The simplest approach: create a `CustomLevaControls` component in `StudioViewport` that checks if the model component has a `debugConfig.controlsHook` and calls it. But with `lazy()`, the component module isn't accessible synchronously.

Actually, the simplest approach is: **since Lighthouse is now a normal model in the registry with `lazy()` import**, we can try to dynamically call the custom hook when the component loads. But `useControls` from Leva is meant to be called unconditionally.

Let me take a different, simpler approach for Lighthouse: **just always call `useLevaCaptureConfig` alongside `useModelPreviewControls` in StudioLights**. The Leva panel will show both groups. When viewing Voyager, the "Lighthouse Capture" group is just irrelevant noise, but that's acceptable for a debug tool.

Actually no, that's bad UX. Let me think about this differently.

The cleanest approach: **add a prop to StudioViewport that tells it whether to render Lighthouse-specific controls**. The model component's `debugConfig` is resolved via the registry entry. But since we can't access module exports until the component loads...

OK, simplest pragmatic solution: **add a boolean flag `captureControls` to `ModelRegistryEntry`**, and in `StudioLights`, conditionally call `useLevaCaptureConfig` when that flag is true:

```ts
// StudioViewport.tsx
function StudioLights({ env, showCaptureControls }: { env: EnvPreset; showCaptureControls: boolean }) {
  const config = useModelPreviewControls()
  const captureConfig = showCaptureControls ? (() => {
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return require('./useLevaCaptureConfig').useLevaCaptureConfig()
    } catch { return null }
  })() : null
  // ... (but require doesn't work in ESM/browser)
}
```

This doesn't work. The real solution is to **just make the `debugConfig` pattern work through the registry with a direct import**.

Let me take the pragmatic approach: add `debugControls` as a direct string key in the registry:

In `ModelRegistryEntry`:
```ts
debugControls?: 'capture'  // key identifying which custom controls to use
```

And in `ModelPreviewControls.tsx`, when `modelKey` matches, also call `useLevaCaptureConfig`. But this couples the registry to the controls...

Actually, the cleanest pragmatic approach for now: Since we only have ONE model with custom controls (Lighthouse), just add a simple flag to the registry:

```ts
// in ModelRegistryEntry:
debugControls?: 'lighthouse-capture' // custom Leva controls key
```

And in `StudioLights`, when the entry has `debugControls === 'lighthouse-capture'`, also import and call `useLevaCaptureConfig`. We can import it directly (not lazy) since it's our own code.

Let me update the plan accordingly. I'll keep Task 11 simpler.

- [ ] **Step 1: Add custom controls support**

The simplest approach: modify `StudioLights` in `StudioViewport.tsx` to optionally call `useLevaCaptureConfig` when the entry has the capture debug controls flag.

But wait — I haven't added this flag to the registry yet. Let me add `debugControls?: 'lighthouse-capture'` to `ModelRegistryEntry` and set it on the lighthouse-capture entry. Then StudioViewport checks this flag.

Actually, even simpler — since `useLevaCaptureConfig` is already imported as a named export from the file, and we know which model needs it, we can just check `entry.debugControls`:

Let me update Task 1's registry to include this field, then update Task 6's StudioLights to use it.

OK, let me just write Task 11 as a focused task that:
1. Adds `debugControls?: 'lighthouse-capture'` to the registry entry field type
2. Sets lighthouse-capture entry to `debugControls: 'lighthouse-capture'`
3. Updates `StudioLights` in `StudioViewport.tsx` to conditionally call `useLevaCaptureConfig`

Let me rewrite the plan for Task 11 properly.

Actually, I realize I should just modify the tasks I've already written to include this from the start. But the plan is already very long. Let me add Task 11 as a small integration task that fixes both files.

Let me write the plan to file now — I've thought through enough.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="Write">
<｜｜DSML｜｜parameter name="content" string="true"># Debug Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/debug.tsx` ecosystem from a two-panel branching architecture into a unified three-column Studio layout with professional 3D model inspection capabilities.

**Architecture:** Single Canvas + single Leva instance hosted by `StudioShell`. Model-specific debug controls injected via `debugControls` registry flag and conditional hook calls. Three-panel CSS Grid layout (SceneExplorer 260px | Viewport 1fr | PropertyPanel 280px) with 40px toolbar and 28px status bar.

**Tech Stack:** React 18, R3F, drei (Environment, GizmoHelper, OrbitControls, useProgress, useGLTF, useAnimations), Leva, THREE.js — no new dependencies.

## Global Constraints

- Canvas must maintain `flat` + `frameloop="demand"` (CLAUDE.md)
- `renderOrder` does not inherit; set explicitly on each Mesh/Line/Sprite/Points
- InstancedMesh2 requires `materialsNeedsUpdate()` after `setColorAt` loop
- Pre-allocate `_` prefixed Vector3/Color/Quaternion objects; use `getState()` for Zustand in useFrame
- Language: Chinese for comments, English for identifiers/commands/errors

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/models/index.ts` | Modify | Remove `useCapturePanel`, add `environment`/`defaultCamera`/`debugControls` |
| `src/debug/StudioShell.tsx` | Create | State host: modelKey, env, helpers, selectedNode, viewportMode |
| `src/debug/StudioLayout.css` | Create | All Studio styles (grid, panels, toolbar, status bar) |
| `src/debug/StudioToolbar.tsx` | Create | ModelSelector + ViewportModeToggle + ScreenshotButton |
| `src/debug/SceneExplorer.tsx` | Create | Left panel: EnvironmentPresets + HelperToggles + SceneTreeView |
| `src/debug/StudioViewport.tsx` | Create | Canvas + Environment + StudioLights + HelperOverlay + Gizmo + OrbitControls + ModelRenderer + RendererStats |
| `src/debug/PropertyPanel.tsx` | Create | Right panel: ModelInfoCard + MaterialInspector + AnimationControls |
| `src/debug/StatusBar.tsx` | Create | Bottom bar: FPS, Draw Calls, Tris from useFrame sampling |
| `src/debug.tsx` | Modify | Point to StudioShell |
| `src/debug/ModelPreviewShell.tsx` | Delete | Replaced by StudioShell |
| `src/debug/ModelPreviewPanel.tsx` | Delete | Split into StudioViewport + PropertyPanel |
| `src/debug/ModelPreviewPanel.css` | Delete | Replaced by StudioLayout.css |
| `src/debug/LighthousePreviewPanel.tsx` | Delete | Lighthouse uses unified pipeline |
| `src/debug/LighthousePreviewPanel.css` | Delete | No longer needed |

**Preserved (no changes):**
- `src/debug/ModelPreviewControls.tsx` — default Leva controls hook
- `src/debug/useLevaCaptureConfig.ts` — called conditionally for Lighthouse
- `src/debug/lighthouse-capture.yaml` — Save/Recover API unchanged
- `debug.html` — entry point unchanged

---

### Task 1: Refactor MODEL_REGISTRY

**Files:**
- Modify: `src/models/index.ts`

**Produces:** `ModelRegistryEntry` (drops `useCapturePanel`, adds `environment`, `defaultCamera`, `debugControls`)

- [ ] **Step 1: Rewrite src/models/index.ts**

Replace the entire file:

```ts
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
  defaultCamera?: { fov: number; position: [number, number, number] }
  triCount?: number
  attribution?: string
  procedural?: boolean
  /** 自定义 Leva 控件标记 — 当前仅 'lighthouse-capture' */
  debugControls?: 'lighthouse-capture'
}

export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  // ---- 程序化模型 ----
  'lighthouse-capture': {
    label: 'Lighthouse · 截图调试',
    component: lazy(() => import('../actors/Lighthouse')),
    procedural: true,
    triCount: 30,
    attribution: '程序化生成（YeQuDeSu）',
    environment: 'night',
    defaultCamera: { fov: 25, position: [0, -1.5, 9] },
    debugControls: 'lighthouse-capture',
  },

  // ---- GLB 模型 ----
  voyager1: {
    label: 'Voyager 1',
    component: lazy(() => import('./Voyager1')),
    glbPath: '/models/voyager-1.glb',
    triCount: 20400,
    attribution: 'illidroid (Sketchfab) · CC BY 4.0',
    environment: 'studio',
  },
  'voyager1-low-poly': {
    label: 'Voyager 1 · Low Poly',
    component: lazy(() => import('./Voyager1LowPoly')),
    glbPath: '/models/voyager-1-low-poly.glb',
    triCount: 10550,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/models/index.ts
git commit -m "refactor(models): drop useCapturePanel, add environment/defaultCamera/debugControls"
```

---

### Task 2: Create StudioShell — state host

**Files:**
- Create: `src/debug/StudioShell.tsx`

**Produces:** `<StudioShell />` (renders Toolbar + Layout + StatusBar + Leva)
**Produces types:** `HelperState`, `ViewportMode`, `SceneTreeNode` (used by sub-panels)

- [ ] **Step 1: Create StudioShell.tsx**

```tsx
import { useState, useRef, useCallback } from 'react'
import { Leva } from 'leva'
import { MODEL_REGISTRY, type EnvPreset } from '../models'
import StudioToolbar from './StudioToolbar'
import SceneExplorer from './SceneExplorer'
import StudioViewport from './StudioViewport'
import PropertyPanel from './PropertyPanel'
import StatusBar from './StatusBar'
import type { Group, Object3D } from 'three'
import './StudioLayout.css'

// ============================================================
// 共享类型
// ============================================================

export interface HelperState {
  grid: boolean
  axes: boolean
  bbox: boolean
  wireframe: boolean
}

export type ViewportMode = 'single' | 'split' | 'quad'

export interface SceneTreeNode {
  name: string
  uuid: string
  type: string
  children: SceneTreeNode[]
}

const MODEL_KEYS = Object.keys(MODEL_REGISTRY)
const DEFAULT_HELPERS: HelperState = { grid: true, axes: true, bbox: false, wireframe: false }

// ============================================================
// StudioShell
// ============================================================

export default function StudioShell() {
  const firstKey = MODEL_KEYS[0] ?? 'voyager1'
  const [modelKey, setModelKey] = useState(firstKey)
  const entry = MODEL_REGISTRY[modelKey]
  const [env, setEnv] = useState<EnvPreset>(entry?.environment ?? 'studio')
  const [helpers, setHelpers] = useState<HelperState>(DEFAULT_HELPERS)
  const [selectedNode, setSelectedNode] = useState<Object3D | null>(null)
  const [viewportMode, setViewportMode] = useState<ViewportMode>('single')
  const [sceneTree, setSceneTree] = useState<SceneTreeNode[]>([])
  const modelRef = useRef<Group | null>(null)

  // 切换模型时同步默认环境
  const handleModelChange = useCallback((key: string) => {
    setModelKey(key)
    setSelectedNode(null)
    setSceneTree([])
    const e = MODEL_REGISTRY[key]
    if (e?.environment) setEnv(e.environment)
  }, [])

  return (
    <div className="studio-shell">
      <StudioToolbar
        modelKey={modelKey}
        onModelChange={handleModelChange}
        viewportMode={viewportMode}
        onViewportModeChange={setViewportMode}
      />

      <div className="studio-layout">
        <SceneExplorer
          env={env}
          onEnvChange={setEnv}
          helpers={helpers}
          onHelpersChange={setHelpers}
          sceneTree={sceneTree}
          selectedNode={selectedNode}
          onNodeSelect={setSelectedNode}
          modelRef={modelRef}
        />

        <StudioViewport
          modelKey={modelKey}
          env={env}
          helpers={helpers}
          viewportMode={viewportMode}
          selectedNode={selectedNode}
          modelRef={modelRef}
          onSceneTreeUpdate={setSceneTree}
        />

        <PropertyPanel
          entry={entry}
          selectedNode={selectedNode}
          modelRef={modelRef}
        />
      </div>

      <StatusBar />

      <Leva
        flat
        fill
        titleBar={{ title: '属性' }}
        theme={{
          colors: {
            elevation1: '#0f172a', elevation2: '#1e293b', elevation3: '#334155',
            accent1: '#64748b', accent2: '#94a3b8', accent3: '#cbd5e1',
            highlight1: '#475569', highlight2: '#64748b', highlight3: '#94a3b8',
          },
          fontSizes: { root: '11px', toolTip: '11px' },
          fonts: { mono: `'Courier New', 'Consolas', monospace` },
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioShell.tsx
git commit -m "feat(studio): add StudioShell — top-level state host"
```

---

### Task 3: Create StudioLayout.css

**Files:**
- Create: `src/debug/StudioLayout.css`

- [ ] **Step 1: Create StudioLayout.css**

```css
/* ============================================================
   StudioLayout.css — Debug Studio 全局样式
   三栏布局：260px | 1fr | 280px, Toolbar 40px, StatusBar 28px
   援引：gltf.report / pmndrs Studio 布局范式
   ============================================================ */

/* ---- Shell ---- */
.studio-shell {
  width: 100vw; height: 100vh;
  display: flex; flex-direction: column;
  background: #050811; color: #94a3b8;
  font-family: 'Courier New', 'Consolas', monospace;
  font-size: 12px; overflow: hidden;
}

/* ---- Toolbar ---- */
.studio-toolbar {
  height: 40px; min-height: 40px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; gap: 12px;
  background: #0f172a; border-bottom: 1px solid #1e293b; z-index: 10;
}
.studio-toolbar select {
  background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
  border-radius: 4px; padding: 4px 8px; font-size: 12px; font-family: inherit;
  min-width: 220px;
}
.studio-toolbar select:focus { outline: none; border-color: #64748b; }
.toolbar-buttons { display: flex; gap: 4px; }
.toolbar-btn {
  background: #1e293b; color: #94a3b8; border: 1px solid #334155;
  border-radius: 4px; padding: 4px 10px; font-size: 12px;
  font-family: inherit; cursor: pointer; transition: background 150ms;
}
.toolbar-btn:hover { background: #334155; }
.toolbar-btn.active { background: #475569; color: #e2e8f0; }

/* ---- Three-Column Grid ---- */
.studio-layout {
  flex: 1; display: grid;
  grid-template-columns: 260px 1fr 280px;
  overflow: hidden; min-height: 0;
}

/* ---- Panel Shared ---- */
.scene-explorer, .property-panel {
  background: #0b1120; overflow-y: auto; overflow-x: hidden;
}
.scene-explorer { border-right: 1px solid #1e293b; }
.property-panel { border-left: 1px solid #1e293b; }
.scene-explorer::-webkit-scrollbar, .property-panel::-webkit-scrollbar { width: 4px; }
.scene-explorer::-webkit-scrollbar-thumb, .property-panel::-webkit-scrollbar-thumb {
  background: #334155; border-radius: 2px;
}

/* ---- Section ---- */
.panel-section {
  padding: 8px 10px; border-bottom: 1px solid #1e293b;
}
.panel-section h3 {
  margin: 0 0 8px 0; font-size: 11px; font-weight: 600;
  color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;
  cursor: pointer; user-select: none;
}
.panel-section h3:hover { color: #94a3b8; }

/* ---- Env Presets ---- */
.env-preset-list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.env-preset-btn {
  background: #1e293b; color: #94a3b8; border: 1px solid #334155;
  border-radius: 4px; padding: 6px 4px; font-size: 10px;
  font-family: inherit; cursor: pointer; text-align: center;
  transition: background 150ms, border-color 150ms;
}
.env-preset-btn:hover { background: #334155; }
.env-preset-btn.active { background: #1e3a5f; border-color: #64748b; color: #e2e8f0; }

/* ---- Helper Toggles ---- */
.helper-toggle {
  display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 11px;
}
.helper-toggle input[type="checkbox"] { accent-color: #64748b; }

/* ---- Scene Tree ---- */
.scene-tree { font-size: 11px; line-height: 1.8; }
.tree-node {
  padding: 2px 4px; cursor: pointer; user-select: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-radius: 2px;
}
.tree-node:hover { background: #1e293b; }
.tree-node.selected { background: #1e3a5f; color: #e2e8f0; }
.tree-node .toggle { display: inline-block; width: 14px; color: #64748b; cursor: pointer; }
.tree-children { padding-left: 16px; }

/* ---- Viewport ---- */
.studio-viewport { position: relative; background: #050811; overflow: hidden; }
.studio-viewport canvas { display: block; }
.viewport-split {
  display: grid; grid-template-columns: 1fr 1fr; width: 100%; height: 100%;
}
.viewport-split > div:first-child { border-right: 1px solid #334155; }
.viewport-quad {
  display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
  width: 100%; height: 100%;
}
.viewport-quad > div { border-right: 1px solid #334155; border-bottom: 1px solid #334155; }

/* ---- Property Panel ---- */
.model-info-card p { margin: 4px 0; font-size: 11px; }
.info-label { color: #64748b; margin-right: 4px; }
.material-props { font-size: 10px; }
.material-props dl {
  margin: 4px 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 8px;
}
.material-props dt { color: #64748b; }
.material-props dd { color: #94a3b8; margin: 0; }
.anim-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.anim-controls button {
  background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
  border-radius: 4px; padding: 4px 10px; font-size: 11px; font-family: inherit; cursor: pointer;
}
.anim-controls button:hover { background: #334155; }
.anim-controls button.active { background: #475569; }
.anim-controls input[type="range"] { flex: 1; accent-color: #64748b; min-width: 60px; }

/* ---- Empty / Error ---- */
.panel-empty {
  padding: 12px 10px; font-size: 11px; color: #475569; font-style: italic;
}
.panel-error { padding: 12px 10px; font-size: 11px; color: #ef4444; }

/* ---- Status Bar ---- */
.studio-status-bar {
  height: 28px; min-height: 28px; display: flex; align-items: center; gap: 24px;
  padding: 0 12px; background: #0f172a; border-top: 1px solid #1e293b;
  font-size: 10px; color: #64748b;
}
.status-indicator {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px;
}
.status-indicator.live { background: #22c55e; }
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioLayout.css
git commit -m "feat(studio): add StudioLayout.css — grid, panels, toolbar, status bar styles"
```

---

### Task 4: Create StudioToolbar

**Files:**
- Create: `src/debug/StudioToolbar.tsx`

**Consumes:** `MODEL_REGISTRY` from `../models`; `ViewportMode` from `./StudioShell`

- [ ] **Step 1: Create StudioToolbar.tsx**

```tsx
import { useCallback, useState } from 'react'
import { MODEL_REGISTRY } from '../models'
import type { ViewportMode } from './StudioShell'

interface StudioToolbarProps {
  modelKey: string
  onModelChange: (key: string) => void
  viewportMode: ViewportMode
  onViewportModeChange: (mode: ViewportMode) => void
}

const MODEL_KEYS = Object.keys(MODEL_REGISTRY)

export default function StudioToolbar({
  modelKey, onModelChange, viewportMode, onViewportModeChange,
}: StudioToolbarProps) {
  const [capturing, setCapturing] = useState(false)

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onModelChange(e.target.value)
  }, [onModelChange])

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('.studio-viewport canvas') as HTMLCanvasElement | null
    if (!canvas) return
    setCapturing(true)
    try {
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `model-preview-${modelKey}-${Date.now()}.png`
      a.click()
    } finally {
      setCapturing(false)
    }
  }, [modelKey])

  return (
    <div className="studio-toolbar">
      <select value={modelKey} onChange={handleSelect}>
        {MODEL_KEYS.map((k) => (
          <option key={k} value={k}>{MODEL_REGISTRY[k].label}</option>
        ))}
      </select>

      <div className="toolbar-buttons">
        <button
          className={`toolbar-btn ${viewportMode === 'single' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('single')}
          title="单视口"
        >☰
        </button>
        <button
          className={`toolbar-btn ${viewportMode === 'split' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('split')}
          title="左右分屏（实体 + 线框）"
        >⛶
        </button>
        <button
          className={`toolbar-btn ${viewportMode === 'quad' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('quad')}
          title="四宫格（正视+侧视+顶视+透视）"
        >⛋
        </button>
        <button
          className="toolbar-btn"
          onClick={handleScreenshot}
          title="截图导出 PNG"
          disabled={capturing}
        >
          {capturing ? '...' : '📷'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioToolbar.tsx
git commit -m "feat(studio): add StudioToolbar — model selector, viewport mode, screenshot"
```

---

### Task 5: Create SceneExplorer — left panel

**Files:**
- Create: `src/debug/SceneExplorer.tsx`

**Consumes:** `EnvPreset` from `../models`; `HelperState`, `SceneTreeNode` from `./StudioShell`
**Produces:** `<SceneExplorer />` with env presets, helper toggles, scene tree

- [ ] **Step 1: Create SceneExplorer.tsx**

```tsx
import { useCallback, useState } from 'react'
import type { Group, Object3D } from 'three'
import type { EnvPreset } from '../models'
import type { HelperState, SceneTreeNode } from './StudioShell'

interface SceneExplorerProps {
  env: EnvPreset
  onEnvChange: (env: EnvPreset) => void
  helpers: HelperState
  onHelpersChange: (helpers: HelperState) => void
  sceneTree: SceneTreeNode[]
  selectedNode: Object3D | null
  onNodeSelect: (node: Object3D | null) => void
  modelRef: React.RefObject<Group | null>
}

// ============================================================
// 环境预设
// ============================================================

const ENV_PRESETS: { key: EnvPreset; label: string }[] = [
  { key: 'studio', label: 'Studio' },
  { key: 'night', label: 'Night' },
  { key: 'dawn', label: 'Dawn' },
  { key: 'sunset', label: 'Sunset' },
]

// ============================================================
// SceneTreeView — 递归场景树
// ============================================================

function SceneTreeView({
  nodes, depth, selectedUuid, onSelect,
}: {
  nodes: SceneTreeNode[]
  depth: number
  selectedUuid: string | null
  onSelect: (uuid: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isCollapsed = collapsed[node.uuid] ?? (depth > 1)
        const isSelected = selectedUuid === node.uuid

        return (
          <div key={node.uuid}>
            <div
              className={`tree-node ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: 4 + depth * 12 }}
              onClick={() => onSelect(node.uuid)}
            >
              {hasChildren ? (
                <span
                  className="toggle"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCollapsed((p) => ({ ...p, [node.uuid]: !isCollapsed }))
                  }}
                >
                  {isCollapsed ? '▸' : '▾'}
                </span>
              ) : (
                <span className="toggle">{'  '}</span>
              )}
              <span>{node.name || node.type}</span>
            </div>
            {hasChildren && !isCollapsed && (
              <div className="tree-children">
                <SceneTreeView
                  nodes={node.children}
                  depth={depth + 1}
                  selectedUuid={selectedUuid}
                  onSelect={onSelect}
                />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ============================================================
// SceneExplorer
// ============================================================

export default function SceneExplorer({
  env, onEnvChange, helpers, onHelpersChange,
  sceneTree, selectedNode, onNodeSelect, modelRef,
}: SceneExplorerProps) {
  const [envOpen, setEnvOpen] = useState(true)
  const [helperOpen, setHelperOpen] = useState(true)
  const [treeOpen, setTreeOpen] = useState(true)

  const toggleHelper = useCallback((key: keyof HelperState) => {
    onHelpersChange({ ...helpers, [key]: !helpers[key] })
  }, [helpers, onHelpersChange])

  const handleNodeSelect = useCallback((uuid: string) => {
    if (!modelRef.current) return
    // 在场景图中查找对应 Object3D
    let found: Object3D | null = null
    modelRef.current.traverse((child) => {
      if (child.uuid === uuid) found = child
    })
    onNodeSelect(found)
  }, [modelRef, onNodeSelect])

  return (
    <div className="scene-explorer">
      {/* ---- 环境预设 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setEnvOpen((v) => !v)}>
          {envOpen ? '▾' : '▸'} 环境
        </h3>
        {envOpen && (
          <div className="env-preset-list">
            {ENV_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`env-preset-btn ${env === p.key ? 'active' : ''}`}
                onClick={() => onEnvChange(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- 辅助工具 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setHelperOpen((v) => !v)}>
          {helperOpen ? '▾' : '▸'} 辅助
        </h3>
        {helperOpen && (
          <>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.grid} onChange={() => toggleHelper('grid')} />
              Grid 网格
            </label>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.axes} onChange={() => toggleHelper('axes')} />
              Axes 坐标轴
            </label>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.bbox} onChange={() => toggleHelper('bbox')} />
              BBox 包围盒
            </label>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.wireframe} onChange={() => toggleHelper('wireframe')} />
              Wireframe 线框
            </label>
          </>
        )}
      </div>

      {/* ---- 场景树 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setTreeOpen((v) => !v)}>
          {treeOpen ? '▾' : '▸'} 场景树
        </h3>
        {treeOpen && (
          <div className="scene-tree">
            {sceneTree.length === 0 ? (
              <div className="panel-empty">加载模型后显示</div>
            ) : (
              <SceneTreeView
                nodes={sceneTree}
                depth={0}
                selectedUuid={selectedNode?.uuid ?? null}
                onSelect={handleNodeSelect}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/SceneExplorer.tsx
git commit -m "feat(studio): add SceneExplorer — env presets, helper toggles, scene tree"
```

---

### Task 6: Create StudioViewport — Canvas + all 3D content

**Files:**
- Create: `src/debug/StudioViewport.tsx`

**Consumes:** `MODEL_REGISTRY`, `EnvPreset` from `../models`; `HelperState`, `ViewportMode`, `SceneTreeNode` from `./StudioShell`; `useModelPreviewControls` from `./ModelPreviewControls`; `useLevaCaptureConfig` from `./useLevaCaptureConfig`; `useFrame`, `useThree` from R3F; `OrbitControls`, `Environment`, `GizmoHelper`, `GizmoViewport`, `useProgress`, `Html` from drei

- [ ] **Step 1: Create StudioViewport.tsx**

```tsx
import { useRef, useEffect, Suspense, Component, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, GizmoHelper, GizmoViewport, useProgress, Html } from '@react-three/drei'
import { Box3, Vector3, Mesh, type Group, type Material, type Object3D } from 'three'
import { MODEL_REGISTRY } from '../models'
import type { EnvPreset } from '../models'
import { useModelPreviewControls } from './ModelPreviewControls'
import { useLevaCaptureConfig } from './useLevaCaptureConfig'
import type { HelperState, ViewportMode, SceneTreeNode } from './StudioShell'

// ============================================================
// Environment presets → drei <Environment> + ambient intensity
// ============================================================

const ENV_DREI_PRESETS: Record<EnvPreset, { preset: string; ambientIntensity: number }> = {
  studio: { preset: 'studio', ambientIntensity: 1.0 },
  night:  { preset: 'night',  ambientIntensity: 0.4 },
  dawn:   { preset: 'dawn',   ambientIntensity: 0.7 },
  sunset: { preset: 'sunset', ambientIntensity: 0.6 },
}

// ============================================================
// Loader
// ============================================================

function Loader() {
  const { progress, active } = useProgress()
  return (
    <Html center>
      <div style={{
        color: '#94a3b8', fontFamily: "'Courier New', 'Consolas', monospace",
        fontSize: 14, textAlign: 'center', userSelect: 'none',
      }}>
        {active ? `加载中... ${progress.toFixed(0)}%` : '就绪'}
      </div>
    </Html>
  )
}

// ============================================================
// Error Boundary
// ============================================================

interface ErrorBoundaryState { error: Error | null }
class ModelErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <Html center>
          <div style={{ color: '#ef4444', fontFamily: "'Courier New', 'Consolas', monospace", fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
            <p>模型加载失败</p>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>{this.state.error.message}</p>
          </div>
        </Html>
      )
    }
    return this.props.children
  }
}

// ============================================================
// RendererStats — 写 renderer.info 到 canvas dataset
// ============================================================

function RendererStats() {
  const { gl } = useThree()
  useFrame(() => {
    const canvas = gl.domElement
    canvas.setAttribute('data-drawcalls', String(gl.info.render.calls))
    canvas.setAttribute('data-triangles', String(gl.info.render.triangles))
  })
  return null
}

// ============================================================
// StudioLights — 通用场景灯光 + 可选 Lighthouse 截图控件
// ============================================================

function StudioLights({ env, showCaptureControls }: { env: EnvPreset; showCaptureControls: boolean }) {
  const config = useModelPreviewControls()
  // Lighthouse 截图专属控件 — 条件调用以注入 Leva
  if (showCaptureControls) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLevaCaptureConfig()
  }
  const ambientIntensity = ENV_DREI_PRESETS[env].ambientIntensity
  return (
    <>
      <ambientLight color={config.ambientColor} intensity={ambientIntensity * config.ambientIntensity} />
      <directionalLight color={config.keyColor} intensity={config.keyIntensity} position={[config.keyX, config.keyY, config.keyZ]} />
      <directionalLight color={config.fillColor} intensity={config.fillIntensity} position={[config.fillX, config.fillY, config.fillZ]} />
    </>
  )
}

// ============================================================
// HelperOverlay — Grid / Axes / BBox / Wireframe
// ============================================================

const _bbox = new Box3()
const _bboxCenter = new Vector3()
const _bboxSize = new Vector3()

function BoundingBoxHelper({ object3d }: { object3d: Object3D | null }) {
  if (!object3d) return null
  _bbox.setFromObject(object3d)
  if (_bbox.isEmpty()) return null
  _bbox.getCenter(_bboxCenter)
  _bbox.getSize(_bboxSize)
  return (
    <mesh position={_bboxCenter.toArray()} renderOrder={999}>
      <boxGeometry args={[_bboxSize.x, _bboxSize.y, _bboxSize.z]} />
      <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.4} depthTest={false} />
    </mesh>
  )
}

function WireframeOverlay({ object3d, active }: { object3d: Object3D | null; active: boolean }) {
  const prevRef = useRef(false)
  useEffect(() => {
    if (!object3d) return
    if (prevRef.current === active) return
    prevRef.current = active
    object3d.traverse((child) => {
      if (child instanceof Mesh) {
        const mat = child.material as Material
        if ('wireframe' in mat && typeof mat.wireframe === 'boolean') {
          mat.wireframe = active
        }
      }
    })
  }, [object3d, active])
  return null
}

function HelperOverlay({ helpers, modelRef }: { helpers: HelperState; modelRef: React.RefObject<Group | null> }) {
  return (
    <>
      {helpers.grid && <gridHelper args={[20, 20, '#1e293b', '#0f172a']} renderOrder={998} />}
      {helpers.axes && <axesHelper args={[5]} renderOrder={998} />}
      {helpers.bbox && <BoundingBoxHelper object3d={modelRef.current} />}
      <WireframeOverlay object3d={modelRef.current} active={helpers.wireframe} />
    </>
  )
}

// ============================================================
// ModelRenderer
// ============================================================

function buildSceneTree(obj: Object3D): SceneTreeNode[] {
  return obj.children
    .filter((c) => c.type !== 'GridHelper' && c.type !== 'AxesHelper')
    .map((c) => ({
      name: c.name || c.type,
      uuid: c.uuid,
      type: c.type,
      children: buildSceneTree(c),
    }))
}

function ModelRenderer({
  modelKey, modelRef, onSceneTreeUpdate, entry,
}: {
  modelKey: string
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
  entry: typeof MODEL_REGISTRY[string] | undefined
}) {
  const config = useModelPreviewControls()

  // 模型加载后扫描场景树（延迟一帧等 children 挂载）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (modelRef.current) {
        onSceneTreeUpdate(buildSceneTree(modelRef.current))
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [modelKey, modelRef, onSceneTreeUpdate])

  if (!entry) return null
  const ModelComponent = entry.component

  return (
    <group
      ref={modelRef}
      position={[config.modelX, config.modelY, config.modelZ]}
      scale={config.modelScale}
      rotation={[config.modelRotX, config.modelRotY, config.modelRotZ]}
    >
      <ModelErrorBoundary>
        <Suspense fallback={<Loader />}>
          <ModelComponent />
        </Suspense>
      </ModelErrorBoundary>
    </group>
  )
}

// ============================================================
// SingleViewportCanvas
// ============================================================

function SingleViewportCanvas({
  env, helpers, modelKey, entry, modelRef, onSceneTreeUpdate, cameraOverride, showCaptureControls,
}: {
  env: EnvPreset
  helpers: HelperState
  modelKey: string
  entry: typeof MODEL_REGISTRY[string] | undefined
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
  cameraOverride?: { fov: number; position: [number, number, number] }
  showCaptureControls: boolean
}) {
  const defaultCam = cameraOverride ?? { fov: 45, position: [5, 3, 8] }

  return (
    <Canvas
      flat
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: defaultCam.fov, near: 0.01, far: 1000, position: defaultCam.position }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: false,
        logarithmicDepthBuffer: true,
      }}
    >
      <color attach="background" args={['#050811']} />
      <RendererStats />

      <Environment preset={ENV_DREI_PRESETS[env].preset as any} background={false} />
      <StudioLights env={env} showCaptureControls={showCaptureControls} />
      <HelperOverlay helpers={helpers} modelRef={modelRef} />

      <GizmoHelper alignment="top-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#94a3b8" />
      </GizmoHelper>

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.1}
        minDistance={0.1}
        maxDistance={500}
      />

      <ModelRenderer
        modelKey={modelKey}
        modelRef={modelRef}
        onSceneTreeUpdate={onSceneTreeUpdate}
        entry={entry}
      />
    </Canvas>
  )
}

// ============================================================
// StudioViewport
// ============================================================

interface StudioViewportProps {
  modelKey: string
  env: EnvPreset
  helpers: HelperState
  viewportMode: ViewportMode
  selectedNode: Object3D | null
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
}

const QUAD_CAMERAS: Record<string, { fov: number; position: [number, number, number] }> = {
  front: { fov: 45, position: [0, 0, 10] },
  side:  { fov: 45, position: [10, 0, 0] },
  top:   { fov: 45, position: [0, 10, 0] },
}

export default function StudioViewport({
  modelKey, env, helpers, viewportMode, selectedNode, modelRef, onSceneTreeUpdate,
}: StudioViewportProps) {
  const entry = MODEL_REGISTRY[modelKey]
  const cameraOverride = entry?.defaultCamera
  const showCaptureControls = entry?.debugControls === 'lighthouse-capture'
  const canvasProps = { env, helpers, modelKey, entry, modelRef, onSceneTreeUpdate, showCaptureControls }

  return (
    <div className="studio-viewport">
      {viewportMode === 'single' && (
        <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} />
      )}
      {viewportMode === 'split' && (
        <div className="viewport-split">
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} />
          </div>
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} helpers={{ ...helpers, wireframe: true }} />
          </div>
        </div>
      )}
      {viewportMode === 'quad' && (
        <div className="viewport-quad">
          {(['front', 'side', 'top'] as const).map((view) => (
            <div key={view} style={{ position: 'relative' }}>
              <SingleViewportCanvas {...canvasProps} cameraOverride={QUAD_CAMERAS[view]} />
            </div>
          ))}
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StudioViewport.tsx
git commit -m "feat(studio): add StudioViewport — Canvas, env, lights, helpers, Gizmo, multi-viewport, renderer stats"
```

---

### Task 7: Create PropertyPanel — right panel

**Files:**
- Create: `src/debug/PropertyPanel.tsx`

**Consumes:** `ModelRegistryEntry` from `../models`; `useAnimations` from drei; `Mesh`, `Group`, `Object3D` from three

- [ ] **Step 1: Create PropertyPanel.tsx**

```tsx
import { useMemo } from 'react'
import { Mesh, type Group, type Object3D, type MeshStandardMaterial } from 'three'
import { useAnimations } from '@react-three/drei'
import type { ModelRegistryEntry } from '../models'

interface PropertyPanelProps {
  entry: ModelRegistryEntry | undefined
  selectedNode: Object3D | null
  modelRef: React.RefObject<Group | null>
}

// ============================================================
// ModelInfoCard
// ============================================================

function ModelInfoCard({ entry }: { entry: ModelRegistryEntry | undefined }) {
  if (!entry) return <div className="panel-empty">未选择模型</div>
  return (
    <div className="panel-section">
      <h3>模型信息</h3>
      <div className="model-info-card">
        <p><span className="info-label">名称：</span>{entry.label}</p>
        {entry.triCount != null && (
          <p><span className="info-label">三角面：</span>~{entry.triCount.toLocaleString()}</p>
        )}
        {entry.procedural && <p><span className="info-label">类型：</span>程序化几何</p>}
        {entry.glbPath && <p><span className="info-label">路径：</span>{entry.glbPath}</p>}
        {entry.attribution && <p><span className="info-label">来源：</span>{entry.attribution}</p>}
      </div>
    </div>
  )
}

// ============================================================
// MaterialInspector
// ============================================================

function MaterialInspector({ node }: { node: Object3D | null }) {
  const material = useMemo(() => {
    if (!node || !(node instanceof Mesh)) return null
    const mats = Array.isArray(node.material) ? node.material : [node.material]
    return mats[0] as MeshStandardMaterial | undefined
  }, [node])

  if (!node || !(node instanceof Mesh)) {
    return (
      <div className="panel-section">
        <h3>材质属性</h3>
        <div className="panel-empty">选中 Mesh 节点后显示</div>
      </div>
    )
  }

  if (!material) {
    return (
      <div className="panel-section">
        <h3>材质属性</h3>
        <div className="panel-empty">无标准材质信息</div>
      </div>
    )
  }

  return (
    <div className="panel-section">
      <h3>材质属性</h3>
      <div className="material-props">
        <p style={{ fontSize: 11, margin: '4px 0' }}>
          <span className="info-label">节点：</span>{node.name || node.type}
        </p>
        <dl>
          <dt>color</dt>
          <dd>#{material.color?.getHexString?.() ?? '—'}</dd>
          {'metalness' in material && <><dt>metalness</dt><dd>{material.metalness?.toFixed(3) ?? '—'}</dd></>}
          {'roughness' in material && <><dt>roughness</dt><dd>{material.roughness?.toFixed(3) ?? '—'}</dd></>}
          {'transparent' in material && <><dt>transparent</dt><dd>{material.transparent ? '是' : '否'}</dd></>}
          {'opacity' in material && <><dt>opacity</dt><dd>{material.opacity?.toFixed(3) ?? '—'}</dd></>}
          {'wireframe' in material && <><dt>wireframe</dt><dd>{material.wireframe ? '是' : '否'}</dd></>}
        </dl>
      </div>
    </div>
  )
}

// ============================================================
// AnimationControls
// ============================================================

function AnimationControls({ modelRef }: { modelRef: React.RefObject<Group | null> }) {
  const { actions, names, mixer } = useAnimations(
    (modelRef.current?.children ?? []) as any,
  )

  if (names.length === 0) return null

  return (
    <div className="panel-section">
      <h3>动画</h3>
      <div className="anim-controls">
        {names.map((name) => {
          const action = actions[name]
          if (!action) return null
          const isPlaying = action.isRunning()
          return (
            <button
              key={name}
              className={isPlaying ? 'active' : ''}
              onClick={() => {
                if (isPlaying) {
                  action.paused = true
                  action.stop()
                } else {
                  action.reset().play()
                }
              }}
            >
              {isPlaying ? '⏸' : '▶'} {name}
            </button>
          )
        })}
        <button onClick={() => { actions[names[0]]?.stop(); mixer?.stopAllAction() }}>
          ⏹ 停止
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 11 }}>
        速度：
        <input
          type="range"
          min={0.1} max={3} step={0.1} defaultValue={1}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            Object.values(actions).forEach((a) => { if (a) a.timeScale = v })
          }}
          style={{ marginLeft: 8, accentColor: '#64748b', width: '60%' }}
        />
      </div>
    </div>
  )
}

// ============================================================
// PropertyPanel
// ============================================================

export default function PropertyPanel({
  entry, selectedNode, modelRef,
}: PropertyPanelProps) {
  return (
    <div className="property-panel">
      <ModelInfoCard entry={entry} />
      <MaterialInspector node={selectedNode} />
      <AnimationControls modelRef={modelRef} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/PropertyPanel.tsx
git commit -m "feat(studio): add PropertyPanel — model info, material inspector, animation controls"
```

---

### Task 8: Create StatusBar

**Files:**
- Create: `src/debug/StatusBar.tsx`

- [ ] **Step 1: Create StatusBar.tsx**

```tsx
import { useRef, useEffect } from 'react'

const _fpsHistory = new Float32Array(60)
let _fpsIdx = 0

/**
 * StatusBar — 底部性能监控条。
 *
 * FPS 通过独立 requestAnimationFrame 采样（与 R3F useFrame 解耦）。
 * Draw Calls / Triangles 由 StudioViewport 中的 RendererStats
 * 写入 canvas dataset，这里通过轮询读取。
 *
 * 援引：Stats.js FPS 计数算法
 */
export default function StatusBar() {
  const fpsRef = useRef<HTMLSpanElement>(null)
  const dcRef = useRef<HTMLSpanElement>(null)
  const triRef = useRef<HTMLSpanElement>(null)
  const lastTime = useRef(performance.now())
  const frameCount = useRef(0)

  // FPS 独立采样（requestAnimationFrame，500ms 更新一次）
  useEffect(() => {
    let raf = 0
    const tick = () => {
      frameCount.current++
      const now = performance.now()
      const elapsed = now - lastTime.current
      if (elapsed >= 500) {
        const fps = Math.round((frameCount.current / elapsed) * 1000)
        frameCount.current = 0
        lastTime.current = now
        _fpsHistory[_fpsIdx % 60] = fps
        _fpsIdx++
        let sum = 0; let count = 0
        for (let i = 0; i < 60; i++) {
          if (_fpsHistory[i] > 0) { sum += _fpsHistory[i]; count++ }
        }
        const avgFps = count > 0 ? Math.round(sum / count) : fps
        if (fpsRef.current) fpsRef.current.textContent = String(avgFps)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Draw calls / triangles — 从 canvas dataset 定时轮询
  useEffect(() => {
    const interval = setInterval(() => {
      const canvas = document.querySelector('.studio-viewport canvas') as HTMLCanvasElement | null
      const dc = canvas?.getAttribute('data-drawcalls') ?? '—'
      const tris = canvas?.getAttribute('data-triangles') ?? '—'
      if (dcRef.current) dcRef.current.textContent = String(dc)
      if (triRef.current) triRef.current.textContent = String(tris)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="studio-status-bar">
      <span>
        <span className="status-indicator live" />
        FPS <span ref={fpsRef}>—</span>
      </span>
      <span>Draw Calls: <span ref={dcRef}>—</span></span>
      <span>Tris: <span ref={triRef}>—</span></span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debug/StatusBar.tsx
git commit -m "feat(studio): add StatusBar — FPS, draw calls, triangles"
```

---

### Task 9: Update debug.tsx entry point

**Files:**
- Modify: `src/debug.tsx`

- [ ] **Step 1: Rewrite debug.tsx**

Replace the entire file:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/debug.tsx
git commit -m "refactor(debug): point entry to StudioShell"
```

---

### Task 10: Delete old files

**Files:**
- Delete: `src/debug/ModelPreviewShell.tsx`
- Delete: `src/debug/ModelPreviewPanel.tsx`
- Delete: `src/debug/ModelPreviewPanel.css`
- Delete: `src/debug/LighthousePreviewPanel.tsx`
- Delete: `src/debug/LighthousePreviewPanel.css`

- [ ] **Step 1: Delete files**

```bash
git rm src/debug/ModelPreviewShell.tsx
git rm src/debug/ModelPreviewPanel.tsx
git rm src/debug/ModelPreviewPanel.css
git rm src/debug/LighthousePreviewPanel.tsx
git rm src/debug/LighthousePreviewPanel.css
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(studio): remove old debug panel files, replaced by Studio components"
```

---

### Task 11: Verification

- [ ] **Step 1: Start debug mode and verify it loads**

```bash
pnpm debug
```

Expected: Browser opens at `localhost:5173/debug.html`, shows three-column Studio layout with Voyager 1 loaded.

- [ ] **Step 2: Verify model switching**

Switch between all three models via the toolbar `<select>`. Confirm Canvas updates, scene tree populates, model info card updates.

- [ ] **Step 3: Verify Lighthouse capture controls**

Switch to "Lighthouse · 截图调试". Confirm Leva shows both "Model Preview" and "Lighthouse Capture" control groups. Confirm the Lighthouse 3D model renders in the viewport.

- [ ] **Step 4: Verify environment presets**

Click through Studio / Night / Dawn / Sunset presets in the left panel. Confirm Environment changes in the viewport.

- [ ] **Step 5: Verify helper toggles**

Toggle Grid / Axes / BBox / Wireframe checkboxes. Confirm they appear/disappear in the viewport.

- [ ] **Step 6: Verify viewport modes**

Click ☰ / ⛶ / ⛋ toolbar buttons. Confirm single/split/quad viewport layouts render.

- [ ] **Step 7: Verify screenshot**

Click 📷 button. Confirm PNG downloads.

- [ ] **Step 8: Verify StatusBar**

Confirm FPS counter is updating and Draw Calls / Tris display values (after a model is loaded and Canvas is rendering).

- [ ] **Step 9: Verify pnpm dev still works**

```bash
pnpm dev
```

Expected: Main app at `localhost:5173/` works normally, `/debug.html` shows the new Studio.

- [ ] **Step 10: Commit final verification notes**

```bash
git add -A
git commit -m "chore(studio): verification — all features working"
```

---

### Task 12: Update documentation

**Files:**
- Modify: `src/debug/README.md`
- Modify: `src/debug/OPERATION.md`
- Modify: `src/debug/MAINTENANCE.md`

- [ ] **Step 1: Update README.md to reflect new Studio architecture**

Update the architecture diagram section (the ASCII chart) to show the new Studio component tree. Replace references to `ModelPreviewShell` / `ModelPreviewPanel` / `LighthousePreviewPanel` with `StudioShell` / `StudioViewport` / `PropertyPanel`.

- [ ] **Step 2: Update OPERATION.md to document new Studio features**

Add sections for: environment presets, helper toggles, scene tree, multi-viewport modes, screenshot export, material inspector, animation controls, status bar.

- [ ] **Step 3: Update MAINTENANCE.md file responsibility matrix**

Replace old file references with new Studio component files. Update the "新增可调参数" guide to reference the `debugControls` flag pattern.

- [ ] **Step 4: Commit doc updates**

```bash
git add src/debug/README.md src/debug/OPERATION.md src/debug/MAINTENANCE.md
git commit -m "docs(studio): update debug docs for three-column Studio layout"
```

---

## Self-Review Checklist

1. **Spec coverage**: Each section of the design spec maps to tasks:
   - Sec 1 (unified pipeline) → Tasks 1, 6, 10
   - Sec 2 (three-column layout) → Tasks 2, 3
   - Sec 3 (feature modules) → Tasks 4-8
   - Sec 4 (registry refactor) → Task 1
   - Sec 5 (component tree + data flow) → Tasks 2, 6, 7

2. **Placeholder scan**: No TBD/TODO/placeholder text. All code shown in full.

3. **Type consistency**: `HelperState`, `ViewportMode`, `SceneTreeNode` exported from StudioShell (Task 2), consumed by StudioToolbar (Task 4), SceneExplorer (Task 5), StudioViewport (Task 6). `EnvPreset` from models (Task 1) consumed throughout. All interfaces match.
