# 维护指南

## 文件职责矩阵

| 层 | 文件 | 改什么 |
|----|------|--------|
| **Studio 入口** | `debug.html` | HTML 入口标题、meta |
| **Studio 挂载** | `../debug.tsx` | extend 注册、createRoot 渲染 |
| **Studio 状态宿主** | `StudioShell.tsx` | 全局状态管理（modelKey/env/helpers/viewportMode）、布局编排 |
| **Studio 样式** | `StudioLayout.css` | 所有 Studio 组件样式（三栏 Grid、面板、工具栏、视口切换、状态栏） |
| **顶部工具栏** | `StudioToolbar.tsx` | 模型选择器、视口模式切换、截图导出按钮 |
| **左栏** | `SceneExplorer.tsx` | 环境预设面板、辅助工具开关、场景树渲染与节点选择 |
| **中栏** | `StudioViewport.tsx` | Canvas 创建、灯光系统、Environment、Gizmo、HelperOverlay、ModelRenderer、多视口布局（single/split/quad）、RendererStats |
| **右栏** | `PropertyPanel.tsx` | 模型信息卡片、材质检查器（选中 Mesh 显示属性）、GLB 动画控制 |
| **底栏** | `StatusBar.tsx` | FPS 独立采样、Draw Calls / Triangles 定时轮询读取 |
| **通用 Leva 控件** | `ModelPreviewControls.tsx` | 通用模型预览 Leva 参数（相机/灯光/变换/视觉/环境），6 个折叠组 |
| **Lighthouse Leva 控件** | `useLevaCaptureConfig.ts` | Lighthouse 截图专用 Leva 控件（不变） |
| **模型注册表** | `../models/index.ts` | MODEL_REGISTRY 定义、EnvPreset 类型、debugControls 标记 |
| **类型 + 纯函数** | `../actors/LighthouseCaptureTypes.ts` | 新增/修改 Lighthouse 参数时改这里（不变） |
| **生产烘焙** | `../actors/LighthouseCapture.tsx` | 配置合并逻辑（不变） |
| **Vite 插件** | `vite.config.ts` | 中间件端点、HMR、define 注入 |
| **Shader** | `../shaders/EdgeGlowShader.ts` | 顶点/片元 shader 逻辑（不变） |

## Vite 插件：pnpm dev vs pnpm debug

`debugOnlyPlugin` 通过环境变量 `VITE_DEBUG_ONLY` 切换行为。

### 始终执行（dev 和 debug 都有）

1. 注册 YAML 文件 watcher → 变更时 `full-reload`
2. 注册 3 个中间件端点：
   - `GET /__debug/config`
   - `POST /__debug/save-config`
   - `DELETE /__debug/config`
3. `define: __LIGHTHOUSE_CONFIG__`（编译时注入）

### 仅 pnpm debug（`VITE_DEBUG_ONLY=1`）

1. 注册 302 中间件：`/` 和 `/index.html` → `Location: /debug.html`
2. 完全接管 `server.printUrls`：仅输出 Debug URL 行

### 仅 pnpm dev（`VITE_DEBUG_ONLY` 未设置）

1. 扩展 `server.printUrls`：默认 URL 列表末尾追加 Debug 提示行

### 中间件注册顺序

```
middleware 1: YAML 端点（GET/POST/DELETE /__debug/*）
middleware 2: 仅 debug 模式下存在 → 302 重定向
```

YAML 端点必须在 302 之前，否则 Save/Load 请求会被重定向。

## 新增 Studio 特性

### 新增环境预设

1. 在 `src/models/index.ts` 中更新 `EnvPreset` 类型
2. 在 `SceneExplorer.tsx` 的 `ENV_PRESETS` 数组添加新预设
3. 在 `StudioViewport.tsx` 的 `ENV_DREI_PRESETS` 中添加对应的 `drei` preset 和环境光强度

### 新增辅助工具

1. 在 `StudioShell.tsx` 的 `HelperState` 接口添加新字段
2. 在 `SceneExplorer.tsx` 中添加对应的 toggle UI
3. 在 `StudioViewport.tsx` 的 `HelperOverlay` 中实现渲染逻辑

### 新增文件清单同步

修改 `StudioToolbar.tsx` 中的模型选择器后，同步更新 `README.md` 的[文件清单]。

## 新增 Lighthouse 可调参数

以新增 `keyColorTemperature` 为例：

### 1. 类型定义（`LighthouseCaptureTypes.ts`）

```ts
export interface CaptureConfig {
  // ... existing fields ...
  keyColorTemperature: number  // 新增
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  // ... existing ...
  keyColorTemperature: 6500,  // 默认色温
}
```

### 2. Leva 控件（`useLevaCaptureConfig.ts`）

```ts
'主光 (Key)': folder({
  // ... existing ...
  keyColorTemperature: { value: defaults.keyColorTemperature, min: 1000, max: 10000, step: 100, label: '色温' },
}),
```

### 3. 离屏渲染（`LighthouseCaptureTypes.ts` 中 `offscreenCapture()`）

如果新参数影响渲染逻辑：

```ts
export function offscreenCapture(config, lighthouseGroup) {
  // ... existing ...
  // 应用 keyColorTemperature 到光源或材质
}
```

### 4. 预览 Canvas 灯光（`StudioViewport.tsx` 中 `StudioLights`）

```tsx
function StudioLights({ env, showCaptureControls }: { env: EnvPreset; showCaptureControls: boolean }) {
  const config = useModelPreviewControls()
  if (showCaptureControls) useLevaCaptureConfig()
  // ... 如需在 Canvas 中可视化色温效果，在此添加
}
```

### 5. YAML 白名单（`vite.config.ts` 中 `SAVABLE_KEYS`）

```ts
const SAVABLE_KEYS = [
  // ... existing ...
  'keyColorTemperature',  // 新增
] as const
```

### 6. 文档更新

更新 [操作手册](./OPERATION.md) 中的参数表。

如果新参数涉及 YAML 持久化，还需在 `vite.config.ts` 的 `SAVABLE_KEYS` 中追加字段名。

## YAML 端点

三个端点均在 `vite.config.ts` 的 `debugOnlyPlugin` 中注册：

| 方法 | 路径 | 核心函数 |
|------|------|---------|
| GET | `/__debug/config` | `readYamlConfig()` → `js-yaml.load()` |
| POST | `/__debug/save-config` | `pickSavalable()` → `writeYamlConfig()` → `js-yaml.dump()` |
| DELETE | `/__debug/config` | `fs.unlinkSync()` |

`pickSavalable()` 通过 `SAVABLE_KEYS` 白名单过滤，只保留允许持久化的字段。

## 配置流向

```
                    ┌──────────────────┐
                    │   调试面板 (dev)   │
                    │   Leva useControls │
                    └────────┬─────────┘
                             │ Save 按钮
                             ▼
                  POST /__debug/save-config
                             │
                             ▼
              ┌──────────────────────────┐
              │ lighthouse-capture.yaml   │  ← 文件系统
              └──────────┬───────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    调试面板 Load    Vite define    Vite watcher
    (GET /config)   (编译时注入)    (变更 → reload)
          │              │              │
          ▼              ▼              ▼
    Leva 初始化   生产烘焙配置    自动刷新页面
    useControls   __LIGHTHOUSE__
```

## 生产构建注意事项

- `__LIGHTHOUSE_CONFIG__` 在 `vite.config.ts` 的 `define` 中注入
- 仅在 `pnpm build` 或 `pnpm dev` 启动时读取一次
- 无 YAML 文件时注入空对象 `{}`
- `CaptureConfig` 中不存在的字段会被 white-label 过滤（`SAVABLE_KEYS`），不会意外写入

## 依赖

- `leva` — 生产依赖（debug 页面用，tree-shaking 排除主应用）
- `js-yaml` + `@types/js-yaml` — devDependency（仅 Vite 插件侧 Node.js 使用）
