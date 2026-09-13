# Debug Studio — 半专业 3D 模型预览系统设计

## 概述

将当前 `src/debug.tsx` 生态从"双面板分支"模式重构为统一的 **三栏 Studio 布局**，消除程序化模型与 GLB 模型之间的渲染管道割裂，达到接近 gltf.report / Poimandres Studio 的专业程度。

### 动机

- **消除割裂**：`LighthousePreviewPanel` 和 `ModelPreviewPanel` 各自拥有独立的 Canvas + Leva + 灯光，仅因历史原因分支。所有模型应共享同一套渲染基础设施
- **提升专业度**：双栏布局信息密度低，缺乏场景树、环境预设、性能监控等行业标准功能
- **统一注册框架**：`useCapturePanel` 分支标记是 hack。每个模型通过 `debugConfig` 声明自己的特殊需求，注册表只记录元数据

---

## 第一节：整体架构 — 统一渲染管道

### 现状 vs 目标

```
现状（两套管道）：
  ModelPreviewShell
    ├─ useCapturePanel? → 独立 Canvas + 独立 Leva（Lighthouse 专用）
    └─ 其他              → 独立 Canvas + Leva（通用模型）

目标（统一管道）：
  StudioShell
    └─ 单一 Canvas + 单一 Leva 实例
         ├─ 当前模型（component 动态渲染）
         ├─ 灯光系统（通用 + 每模型可扩展）
         ├─ 辅助工具（grid/axes/gizmo，全局）
         └─ 属性面板（根据模型导出的 debugConfig 切换控件组）
```

### 关键变化

1. **Lighthouse 不再特殊** — 它只是一个普通的注册模型组件，导出 `debugConfig` 来声明自己需要截图控件组。Canvas、灯光、布局和其他模型共享
2. **`ModelPreviewShell` → `StudioShell`** — 更名反映专业工具的定位
3. **组件可携带调试配置** — 每个模型组件可选导出 `debugConfig`，注册表聚合时读取。不需要 `useCapturePanel` 分支标记
4. **注册表扩展** — 增加 `environment`、`defaultCamera` 等可选字段，支持配置驱动 UI

```
StudioShell（新）
  ├─ StudioLayout        → 三栏布局容器（CSS Grid）
  ├─ SceneExplorer       → 左栏：场景树 / 环境预设 / 辅助开关
  ├─ StudioViewport      → 中栏：Canvas + OrbitControls + Grid + Axes + Gizmo
  │   └─ ModelRenderer   → 根据 modelKey 动态渲染 component
  ├─ PropertyPanel       → 右栏：Leva 控件组 + 模型信息 + 材质属性 + 动画控制
  └─ StatusBar           → 底部：Stats / FPS / DrawCalls / Tris
```

---

## 第二节：三栏布局设计

```
┌──────────────────────────────────────────────────────────────────┐
│  [模型选择器]  Voyager 1 · Low Poly              [☰] [⛶] [⚙]  │  ← Toolbar (40px)
├──────────┬───────────────────────────────────────┬───────────────┤
│          │                                       │               │
│ SCENE    │                                       │  PROPERTIES   │
│          │                                       │               │
│ ▸ 环境    │                                       │  ┌相机────────┐│
│   ○ Studio│                                       │  │ FOV   45  ││
│   ○ Night │       3D VIEWPORT                    │  │ 距离   8   ││
│   ○ Dawn  │       (Canvas)                       │  └───────────┘│
│          │                                       │               │
│ ▸ 辅助    │                                       │  ┌灯光────────┐│
│   ✓ Grid │                                       │  │ 主光 1.8  ││
│   ✓ Axes │                                       │  │ 补光 0.5  ││
│   □ BBox │                                       │  └───────────┘│
│          │                                       │               │
│ ▸ 场景树  │                                       │  ┌模型信息────┐│
│   ▸ Hull │                                       │  │ 面数 10.5K ││
│     Antenna│                                     │  │ 来源: ...  ││
│     Boom  │                                       │  └───────────┘│
│     Body  │                                       │               │
│          │                                       │  ┌动画────────┐│
│          │                                       │  │ ▶ 播放     ││
│ 260px    │                 1fr                   │  │ ⏺ 进度条   ││
│          │                                       │  └───────────┘│ 280px
├──────────┴───────────────────────────────────────┴───────────────┤
│  ● FPS 60  │  Draw Calls: 12  │  Tris: 20,400  │  模型: 12.5s   │  ← StatusBar (28px)
└──────────────────────────────────────────────────────────────────┘
```

### 布局规则

- **CSS Grid** 实现三栏：`grid-template-columns: 260px 1fr 280px`
- **Toolbar** 顶部横条：模型选择器（取代当前原生 `<select>`）+ 右侧工具按钮
- **左栏 (260px)**：Scene Explorer — 环境预设 + 辅助工具开关 + 场景树
- **中栏 (1fr)**：Viewport — Canvas 撑满，无溢出
- **右栏 (280px)**：Property Panel — Leva 控件 + 模型信息 + 动画控制（可滚动）
- **底部状态栏 (28px)**：性能指标 + 加载时间
- 左右两栏各自 `overflow-y: auto` 独立滚动
- 左侧环境预设用卡片/缩略图选择
- 工具栏用暗色背景，与 Canvas 和面板视觉区分
- 所有 UI 字体沿用项目现有的 `'Courier New', 'Consolas', monospace`

---

## 第三节：功能模块清单

### 左栏 — Scene Explorer

| 模块 | 内容 | 交互 |
|---|---|---|
| **环境预设** | Studio / Night / Dawn / Sunset 四套 HDR 环境贴图（drei `<Environment>`），缩略图选择 | 单选切换，立即生效 |
| **辅助工具** | Grid（地平面网格）、Axes（RGB 坐标轴）、BoundingBox（包围盒）、Wireframe（全局线框叠加） | Checkbox 开关 |
| **场景树** | 遍历 `modelRef.current` 的子节点，显示 mesh 层级。点击节点高亮对应 mesh（变色或 outline） | 可展开/折叠，点击选中 |

### 中栏 — Viewport

| 模块 | 内容 | 交互 |
|---|---|---|
| **OrbitControls** | 现有功能保留 | 鼠标旋转/缩放/平移 |
| **GizmoHelper** | drei 的 `GizmoHelper` + `GizmoViewport`，右上角显示当前相机朝向 | 点击 Gizmo 面切换正交视角 |
| **多视口** | 工具栏按钮切换：单视口 / 左右分屏（实体 + 线框）/ 四宫格（正视图+侧视图+顶视图+透视） | 按钮切换 |
| **截图导出** | 工具栏按钮，当前 Canvas 截图 → PNG 下载（透明背景可选） | 点击触发下载 |

### 右栏 — Property Panel

| 模块 | 内容 | 交互 |
|---|---|---|
| **相机组** | FOV、距离、方位角、仰角 | Leva folder，可折叠 |
| **灯光组** | 主光/补光/环境光 颜色+强度+位置。环境光强度随环境预设切换联动 | Leva folder |
| **模型信息** | label、三角面数、GLB 路径、来源（从 `MODEL_REGISTRY` 自动读取） | 只读展示 |
| **变换组** | position / scale / rotation | Leva folder |
| **材质属性** | 选中节点后的材质信息（color、metalness、roughness 等，仅 PBR 材质有效） | 只读展示，选中节点后动态填充 |
| **动画控制** | 播放/暂停、速度滑块、时间轴（若模型有 animation clips） | 自动检测，无动画则隐藏 |
| **模型专属控件** | 如 Lighthouse 的截图参数，由组件的 `debugConfig` 注入 | 动态追加到面板底部 |

### 底部状态栏

| 指标 | 来源 |
|---|---|
| **FPS** | drei `<Stats>` 或自定义 useFrame 采样 |
| **Draw Calls** | `renderer.info.render.calls` |
| **Triangles** | `renderer.info.render.triangles` |
| **加载时间** | 模型开始加载 → `useProgress` 完成的时间差 |

### 不在本期范围（明确排除）

- 模型编辑/导出（这是查看器，不是编辑器）
- 材质编辑（保持只读，编辑能力复杂度太高）
- 自定义 HDR 上传（预设够用）

---

## 第四节：模型注册表重构

### 组件导出模式

每个模型组件文件（无论 GLB 还是程序化）可选导出 `debugConfig`：

```ts
// src/models/Voyager1.tsx  — GLB 模型，无特殊控件
export default function Voyager1() { /* useGLTF 渲染 */ }
// 通用模型可以不导出 debugConfig（走默认控件组）
```

```ts
// src/models/Lighthouse.tsx  — 程序化模型，带截图专属控件
export default function Lighthouse() { /* 程序化几何 */ }

export const debugConfig = {
  controls: useLevaCaptureConfig,   // 自定义 Leva hook
  defaultCamera: { fov: 25, position: [0, 0, 9] },
}
```

### 注册表新结构

```ts
export interface ModelRegistryEntry {
  label: string
  component: ComponentType<any>
  glbPath?: string
  environment?: 'studio' | 'night' | 'dawn' | 'sunset'  // 推荐默认环境
  defaultCamera?: { fov: number; position: [number, number, number] }
  triCount?: number
  attribution?: string
  procedural?: boolean
}
```

`useCapturePanel` 移除。Lighthouse 不再特殊，只是通过 `debugConfig` 告知 Studio："我有多一套 Leva 控件组"。

### 光照预设与环境贴图

用 drei `<Environment>` 的 `presets` 字段，四套内置：

```ts
const ENV_PRESETS = [
  { key: 'studio', label: 'Studio', preset: 'studio' },
  { key: 'night',  label: 'Night',  preset: 'night' },
  { key: 'dawn',   label: 'Dawn',   preset: 'dawn' },
  { key: 'sunset', label: 'Sunset', preset: 'sunset' },
] as const
```

环境光强度随预设联动 — 每个预设自带一个推荐 ambient intensity，切换时自动调整。

---

## 第五节：组件树与数据流

### 完整组件树

```
debug.tsx
  └─ StudioShell                              ← 状态宿主（modelKey, 环境, 辅助开关）
       ├─ StudioToolbar                       ← 模型选择器 + 工具按钮
       │    ├─ ModelSelector                  ← 下拉选择（从 MODEL_REGISTRY 读取）
       │    ├─ ViewportModeToggle             ← 单视口 / 双分屏 / 四宫格
       │    └─ ScreenshotButton               ← 截图导出
       │
       ├─ StudioLayout                        ← CSS Grid 三栏容器
       │    ├─ SceneExplorer (左栏)           ← props: env, helpers, sceneTree, onSelect
       │    │    ├─ EnvironmentPresets        ← 四套 HDR 缩略图选择
       │    │    ├─ HelperToggles             ← Grid/Axes/BBox/Wireframe 开关
       │    │    └─ SceneTreeView             ← 递归展开 mesh 层级
       │    │
       │    ├─ StudioViewport (中栏)           ← props: modelKey, env, viewportMode
       │    │    └─ Canvas
       │    │         ├─ Environment           ← drei <Environment preset={env}>
       │    │         ├─ StudioLights          ← 通用 PreviewLights + Leva 驱动
       │    │         ├─ HelperOverlay         ← Grid / Axes / BoundingBox / Wireframe
       │    │         ├─ GizmoHelper           ← drei 右上角朝向指示
       │    │         ├─ OrbitControls
       │    │         └─ ModelRenderer         ← 根据 modelKey 渲染 component
       │    │              └─ ModelErrorBoundary
       │    │                   └─ <Suspense>
       │    │                        └─ <entry.component />
       │    │
       │    └─ PropertyPanel (右栏)            ← props: config, entry, selectedNode
       │         ├─ LevaRoot                   ← Leva 面板渲染在此
       │         ├─ ModelInfoCard              ← label/triCount/attribution（只读）
       │         ├─ MaterialInspector          ← 选中 mesh 的材质属性（只读）
       │         ├─ AnimationControls          ← 有 animation 时才渲染
       │         └─ CustomControlsSlot         ← 模型 debugConfig.controls 注入位
       │
       └─ StatusBar (底部)                     ← renderer.info 定时采样
```

### 数据流

```
                    ┌─────────────────────┐
                    │    StudioShell       │  单一状态宿主
                    │  modelKey, env,     │  useState + MODEL_REGISTRY
                    │  helpers, selected  │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
    SceneExplorer        StudioViewport      PropertyPanel
    (只读 props)         (只读 props)        (只读 props)
          │                    │                    │
          │ 选中节点            │ 渲染               │ Leva 双向绑定
          │ onSelect ──────────┼──► selected       │ useControls
          │                    │                    │
                               │
                        MODEL_REGISTRY
                        entry.component
                        entry.debugConfig?.controls
```

### 状态分布原则

| 状态 | 宿主 | 原因 |
|---|---|---|
| `modelKey` | `StudioShell` useState | 切换时触发 Viewport + Right Panel 同时更新 |
| `env` (当前环境预设) | `StudioShell` useState | 左栏选择和 Canvas 渲染都需要 |
| `helpers` (Grid/Axes/…) | `StudioShell` useState | 扩散到 Viewport，可选持久化 localStorage |
| `selectedNode` (场景树选中) | `StudioShell` useState | 左栏点击 → 中栏高亮 + 右栏材质显示 |
| Leva 控件值 | Leva 内部 (useControls) | 由 useLevaCaptureConfig/useModelPreviewControls 管理，不提升 |
| 动画状态 | `AnimationControls` 内部 | 播放/暂停/进度 — 局部状态，无外部依赖 |
| 状态栏指标 | useFrame 采样 ref | 避免 React re-render，直接写 DOM 或单独 store |

### Leva 的位置

Leva 嵌入右栏 PropertyPanel 内部，使用 Leva 的 `fill` + `flat` 模式 + 容器约束，不再浮在整个页面上。

```tsx
<div className="property-panel" ref={levaContainerRef}>
  <Leva flat fill parent={levaContainerRef} ... />
</div>
```

---

## 实现注意事项

### R3F 约束（继承自 CLAUDE.md）

- Canvas 必须保持 `flat` + `frameloop="demand"`
- `renderOrder` 不继承，每个 Mesh/Line 需显式设置
- InstancedMesh2 初始化后需调用 `materialsNeedsUpdate()`
- 预分配 `_` 前缀 Vector3/Color 对象，useFrame 中使用 `getState()` 读 Zustand

### Canvas 配置

```tsx
<Canvas
  flat
  frameloop="demand"
  dpr={[1, 2]}
  camera={{ fov: 45, near: 0.01, far: 1000, position: [5, 3, 8] }}
  gl={{
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
    logarithmicDepthBuffer: true,
  }}
>
```

### 兼容性

| 模块路径 | 操作 |
|---|---|
| `src/debug/ModelPreviewShell.tsx` | 删除，由 `StudioShell` 替代 |
| `src/debug/ModelPreviewPanel.tsx` | 拆分为 `StudioLayout` + `StudioViewport` + `PropertyPanel` |
| `src/debug/LighthousePreviewPanel.tsx` | 删除，Lighthouse 走统一管道 |
| `src/debug/LighthousePreviewPanel.css` | 删除 |
| `src/debug/ModelPreviewPanel.css` | 重构为 Studio 全局样式 |
| `src/debug/ModelPreviewControls.tsx` | 保留，继承为通用控件 hook |
| `src/debug/useLevaCaptureConfig.ts` | 保留，Lighthouse 组件通过 debugConfig 引用 |
| `src/debug/lighthouse-capture.yaml` | 保留，Save/Recover API 不变 |
| `src/models/index.ts` | 重构，移除 `useCapturePanel`，增加 `environment`/`defaultCamera` |
| `src/debug.tsx` | 轻量更新，指向 `StudioShell` |

### 依赖

- `@react-three/drei` — `<Environment>`, `<GizmoHelper>`, `<GizmoViewport>`, `<Stats>`, `<OrbitControls>`, `useProgress`, `useGLTF`, `useAnimations`
- `leva` — 参数调试 GUI（已有）
- `three` — `renderer.info` 用于状态栏采样
- 无需新增依赖

### 相关文档

- [操作手册](../debug/OPERATION.md) — 实现完成后更新
- [维护指南](../debug/MAINTENANCE.md) — 实现完成后更新
- [Debug 系统说明](../debug/README.md) — 实现完成后更新
- [模型注册表说明](../models/README.md) — 实现完成后更新
