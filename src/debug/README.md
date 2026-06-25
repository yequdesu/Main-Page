# Debug 系统说明

`src/debug/` 是通用的 3D 模型预览调试系统，支持程序化模型和 GLB/glTF 模型的实时参数调试。

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
  └─ src/debug.tsx                      挂载点（R3F extend 注册 + Suspense + createRoot）
       └─ ModelPreviewShell             顶层路由（Leva 模型选择器 + 面板派发）
            ├─ LighthousePreviewPanel   专用 Lighthouse 截图调试面板（useCapturePanel: true）
            └─ ModelPreviewPanel         通用模型预览面板（OrbitControls + 动态灯光 + Leva）
                 ├─ useModelPreviewControls   Leva 控件 hook（相机 / 灯光 / 变换 / 视觉 / 环境）
                 └─ MODEL_REGISTRY 模型加载   （gltfjsx 生成的组件或程序化组件）

src/models/
  ├─ index.ts                           MODEL_REGISTRY 注册表（添加新模型只需在此加一项）
  ├─ Voyager1.tsx                        gltfjsx 生成的 Voyager 1 组件（useGLTF）
  └─ README.md                          模型来源与许可证文档

public/models/
  └─ Voyager1.glb                        GLB 二进制文件（Vite 静态服务，URL: /models/Voyager1.glb）
```

## 模型注册表机制

`src/models/index.ts` 中的 `MODEL_REGISTRY` 是唯一的模型数据源。每个条目：

```ts
{
  label: string           // Leva 下拉菜单显示名
  component: ComponentType // 模型组件（GLB 模型用 lazy 导入）
  triCount?: number       // 三角面数
  attribution?: string    // 来源 / 许可证
  procedural?: boolean    // 是否为程序化几何
  useCapturePanel?: boolean // 使用专用调试面板（Lighthouse 截图）
}
```

要添加新模型：
1. GLB 放入 `public/models/`
2. 运行 `npx @react-three/gltfjsx public/models/模型.glb --transform --types --output src/models/模型.tsx`
3. 在 `MODEL_REGISTRY` 中添加 entry
4. 重启调试页面

## 配置流（Lighthouse 截图专用）

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
| `../debug.tsx` | 挂载点，`createRoot` → `<ModelPreviewShell />` |
| `ModelPreviewShell.tsx` | 顶层路由，Leva 模型选择器 + 面板派发 |
| `ModelPreviewPanel.tsx` | 通用模型预览：R3F Canvas + OrbitControls + 模型信息 |
| `ModelPreviewPanel.css` | 双栏布局样式 |
| `ModelPreviewControls.tsx` | Leva `useControls` hook，6 个折叠组 18 个参数 |
| `LighthousePreviewPanel.tsx` | 专用 Lighthouse 截图调试面板（不变） |
| `LighthousePreviewPanel.css` | Lighthouse 面板样式（不变） |
| `useLevaCaptureConfig.ts` | Lighthouse 截图 Leva 控件（不变） |
| `../models/index.ts` | 模型注册表 + 类型 |
| `../models/Voyager1.tsx` | Voyager 1 GLB 组件（gltfjsx 生成） |
| `../models/README.md` | 模型来源文档 |

## 依赖

- `@react-three/drei` — GLB 加载（`useGLTF`）、OrbitControls、`useProgress`
- `leva` — 参数调试 GUI（pmndrs 出品）
- `js-yaml` — YAML 读写（devDependency，仅 Vite 插件侧使用）

## 相关文档

- [模型注册表说明](../models/README.md)
- [轨道系统完整文档](../../docs/orbital-system.md)
- [维护指南](../../docs/MAINTENANCE.md)
