# Debug 系统说明

`src/debug/` 目录包含 LighthouseCapture 离线烘焙截图的实时参数调试工具。

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
debug.html                         Vite 入口（独立于 index.html）
  └─ src/debug.tsx                 挂载点（R3F extend 注册 + createRoot）
       └─ LighthousePreviewPanel   双栏调试面板

vite.config.ts                     Vite 插件
  ├─ GET  /__debug/config         读取 YAML → JSON（供面板初始化）
  ├─ POST /__debug/save-config    保存当前参数 → YAML
  ├─ DELETE /__debug/config       删除 YAML（恢复默认值）
  ├─ define: __LIGHTHOUSE_CONFIG__ 编译时注入（供生产烘焙读取）
  └─ watcher: full-reload          YAML 变更时自动刷新主应用
```

## 配置流

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
| `debug.html` | 独立 HTML 入口，`<script type="module" src="/src/debug.tsx">` |
| `../debug.tsx` | 挂载点，`createRoot` → `<LighthousePreviewPanel />` |
| `LighthousePreviewPanel.tsx` | 双栏面板：左侧 R3F Canvas + 右侧 Leva + 烘焙预览 |
| `LighthousePreviewPanel.css` | 双栏布局样式 |
| `useLevaCaptureConfig.ts` | Leva `useControls` hook，6 个折叠组 17 个参数 |
| `../actors/LighthouseCaptureTypes.ts` | `CaptureConfig` 类型 + `DEFAULT_CAPTURE_CONFIG` + `offscreenCapture()` 纯函数 |
| `../actors/LighthouseCapture.tsx` | 生产烘焙组件，消费 YAML 配置 |

## 依赖

- `leva` — 参数调试 GUI（pmndrs 出品）
- `js-yaml` — YAML 读写（devDependency，仅 Vite 插件侧使用）

## 相关文档

- [操作手册](./OPERATION.md) — 如何使用调试面板
- [维护指南](./MAINTENANCE.md) — 如何扩展和维护
