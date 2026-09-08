# Debug 系统说明

`src/debug/` 是通用的 3D 模型预览调试系统，基于 Studio 三栏布局架构，支持程序化模型和 GLB/glTF 模型的实时参数调试。当前生产构建只使用主应用入口，`debug.html` 不随默认构建输出。

## pnpm debug vs pnpm dev

两条命令的行为由 `VITE_DEBUG_ONLY` 环境变量 + `vite.config.ts` 中的 `debugOnlyPlugin` 控制。

### pnpm dev

```bash
VITE_DEBUG_ONLY=0（默认） → 插件跳过 302 重定向，保留默认 printUrls
```

- `localhost:5173/` → `index.html` → `main.tsx` → 主应用
- `localhost:5173/debug.html` → 调试面板（手动访问）
- 回显显示 Local + Network + Debug 提示

### pnpm debug

```bash
VITE_DEBUG_ONLY=1 → 插件激活 302 重定向 + 接管 printUrls
```

- `localhost:5173/` → 302 → `/debug.html`（无法访问主应用）
- `localhost:5173/debug.html` → 调试面板（唯一入口）
- 回显仅显示 Debug URL
- 中间件注册顺序：YAML 端点 → 302 重定向（YAML API 不受影响）

### 插件决策树

```
debugOnlyPlugin.configureServer(server)
  │
  ├─ YAML watcher + 端点（dev / debug 都注册）
  │   ├─ GET  /__debug/config
  │   ├─ POST /__debug/save-config
  │   └─ DELETE /__debug/config
  │
  └─ VITE_DEBUG_ONLY ?
       ├─ yes → 302 中间件 + 自定义 printUrls（仅 Debug 行）
       └─ no  → 扩展 printUrls（默认行 + Debug 提示行）
```

### 对比表

| | `pnpm dev` | `pnpm debug` |
|---|---|---|
| 主应用 (`/`) | ✅ 正常访问 | ❌ 302 → `/debug.html` |
| 调试面板 (`/debug.html`) | ✅ 手动访问 | ✅ 唯一入口 |
| `/__debug/*` API | ✅ 可用 | ✅ 可用 |
| YAML HMR | ✅ 文件变更 → full-reload | ✅ 文件变更 → full-reload |
| 回显 | Local + Network + Debug 提示 | 仅 Debug URL |
| 适用场景 | 日常开发，同时调试主应用和截图 | 专注调参，隔离主应用干扰 |

## 系统架构

```
debug.html                              Vite 入口（独立于 index.html）
  └─ src/debug.tsx                      挂载点（extend + Suspense + createRoot）
       └─ StudioShell                   状态宿主（modelKey, env, helpers, selectedNode, viewportMode）
            ├─ StudioToolbar             模型选择器 + 视口模式（single/split/quad）+ 截图导出
            ├─ StudioLayout              CSS Grid 三栏：260px | 1fr | 280px
            │   ├─ SceneExplorer         左栏：环境预设（Studio/Night/Dawn/Sunset）+ 辅助开关（Grid/Axes/BBox/Wireframe）+ 场景树
            │   ├─ StudioViewport        中栏：Canvas + OrbitControls + Environment + Gizmo + ModelRenderer + 多视口布局
            │   └─ PropertyPanel         右栏：模型信息 + 材质检查器 + 动画控制（播放/暂停/速度）
            └─ StatusBar                 底栏：FPS / Draw Calls / Tris

src/models/
  ├─ index.ts                           MODEL_REGISTRY 注册表（添加新模型只需在此加一项）
  │                                     debugControls 标记启用自定义 Leva 面板（如 'lighthouse-capture'）
  ├─ Voyager1.tsx                        Voyager 1 组件（useGLTF）
  ├─ Voyager1LowPoly.tsx                 Voyager 1 低模组件（useGLTF）
  └─ README.md                          模型来源与许可证文档

public/models/
  ├─ voyager-1.glb                       GLB 二进制文件（URL: /models/voyager-1.glb）
  └─ voyager-1-low-poly.glb              低模烘焙 GLB 文件
```

## Studio 三栏布局

Studio 采用固定宽度的三栏 CSS Grid 布局：

- **左栏 - SceneExplorer（260px）**：环境预设选择、辅助工具开关、场景树节点浏览与选择
- **中栏 - StudioViewport（1fr）**：Canvas 渲染区域，支持 single/split/quad 三种视口模式
- **右栏 - PropertyPanel（280px）**：模型信息卡片、选中 Mesh 的材质属性、GLB 动画播放控制

布局逻辑见 `StudioLayout.css`，使用 `flex: 1` 的 Shell 容器嵌套 CSS Grid。

截图按钮当前导出页面中第一个视口 Canvas 的 PNG；分屏和四视图不会合成为一张截图。实现见 [StudioToolbar.tsx](StudioToolbar.tsx)。

## 模型注册表机制

`src/models/index.ts` 中的 `MODEL_REGISTRY` 是唯一的模型数据源。每个条目：

```ts
{
  label: string           // 下拉菜单显示名
  component: ComponentType // 模型组件（GLB 模型用 lazy 导入）
  glbPath?: string       // GLB 静态资源路径
  environment?: EnvPreset // 默认环境预设（studio/night/dawn/sunset）
  defaultCamera?: { fov: number; position: [number, number, number] } // 默认相机参数
  triCount?: number       // 三角面数
  attribution?: string    // 来源 / 许可证
  procedural?: boolean    // 是否为程序化几何
  debugControls?: 'lighthouse-capture' // 自定义 Leva 控件标记
}
```

要添加新模型：

1. GLB 放入 `public/models/`
2. 运行 `npx @react-three/gltfjsx public/models/模型.glb --transform --types --output src/models/模型.tsx`
3. 在 `MODEL_REGISTRY` 中添加 entry
4. 重启调试页面

## 配置流（Lighthouse 截图专用）

带有 `debugControls: 'lighthouse-capture'` 标记的模型走独立的 Leva 配置面板（`useLevaCaptureConfig`），参数通过 YAML 文件持久化，供 `LighthouseCapture` 生产烘焙使用。

```
调试面板 (Leva)               生产烘焙 (LighthouseCapture)
──────────────                ──────────────────────────────
调整参数                       启动时 define 注入 YAML 配置
  │                                   │
  ├─ Save → POST /__debug/save-config │
  │         → 写入 YAML 文件           │
  │         → Vite watcher full-reload │
  │                                   ↓
  └─ Load ← GET /__debug/config   运行时 fetch 最新 YAML
              → 初始化 Leva 控件    → 合并 DEFAULT → 烘焙截图
```

配置优先级（高→低）：
1. `config` prop（调用方显式传入）
2. YAML 运行时配置（dev 模式 `GET /__debug/config`）
3. YAML 编译时配置（Vite `define` 注入，prod 构建时读取）
4. `DEFAULT_CAPTURE_CONFIG`（`LighthouseCaptureTypes.ts`）

## 文件清单

| 文件 | 职责 |
|------|------|
| `debug.html` | 独立 HTML 入口 |
| `../debug.tsx` | 挂载点，`extend` + `createRoot` → `<StudioShell />` |
| `StudioShell.tsx` | 状态宿主，三栏布局编排，Leva 全局主题 |
| `StudioLayout.css` | 所有 Studio 样式：三栏 Grid、面板、工具栏、视口、状态栏 |
| `StudioToolbar.tsx` | 顶部操作栏：模型选择器、视口模式切换、截图导出 |
| `SceneExplorer.tsx` | 左栏：环境预设、辅助开关、场景树 |
| `StudioViewport.tsx` | 中栏：Canvas、灯光、Environment、Gizmo、多视口（single/split/quad） |
| `PropertyPanel.tsx` | 右栏：模型信息、材质检查器、动画控制 |
| `StatusBar.tsx` | 底栏：FPS / Draw Calls / Tris 性能显示 |
| `ModelPreviewControls.tsx` | 通用模型 Leva 控件 hook（6 个折叠组） |
| `useLevaCaptureConfig.ts` | Lighthouse 截图专用 Leva 控件 hook |
| `../models/index.ts` | 模型注册表 + 类型 + debugControls 标记 |
| `../models/Voyager1.tsx` | Voyager 1 GLB 组件（gltfjsx 生成） |
| `../models/Voyager1LowPoly.tsx` | Voyager 1 低模 GLB 组件 |

## 依赖

- `@react-three/fiber` — R3F Canvas 渲染器
- `@react-three/drei` — GLB 加载（`useGLTF`）、OrbitControls、Environment、GizmoHelper、`useProgress`、`useAnimations`
- `leva` — 参数调试 GUI（pmndrs 出品）
- `@three.ez/instanced-mesh` — InstancedMesh2 扩展注册
- `three` — Three.js 核心库
- `js-yaml` — YAML 读写（devDependency，仅 Vite 插件侧使用）

## 相关文档

- [模型注册表说明](../models/README.md)
- [轨道系统完整文档](../../docs/orbital-system.md)
- [维护指南](./MAINTENANCE.md)
- [操作手册](./OPERATION.md)
