# 维护指南

## 文件职责矩阵

| �?| 文件 | 改什�?|
|----|------|--------|
| **类型 + 纯函�?* | `src/actors/LighthouseCaptureTypes.ts` | 新增/修改参数时改这里 |
| **Leva 控件** | `src/debug/useLevaCaptureConfig.ts` | 新增控件时同步这�?|
| **Vite 插件** | `vite.config.ts` | 中间件端点、HMR、define 注入 |
| **生产烘焙** | `src/actors/LighthouseCapture.tsx` | 配置合并逻辑 |
| **调试面板** | `src/debug/LighthousePreviewPanel.tsx` | UI 布局、按钮逻辑 |
| **调试面板样式** | `src/debug/LighthousePreviewPanel.css` | 布局、颜�?|
| **Shader** | `src/shaders/EdgeGlowShader.ts` | 顶点/片元 shader 逻辑 |

## Vite 插件：pnpm dev vs pnpm debug

`debugOnlyPlugin` 通过环境变量 `VITE_DEBUG_ONLY` 切换行为�?

### 始终执行（dev �?debug 都有�?

1. 注册 YAML 文件 watcher �?变更�?`full-reload`
2. 注册 3 个中间件端点�?
   - `GET /__debug/config`
   - `POST /__debug/save-config`
   - `DELETE /__debug/config`
3. `define: __LIGHTHOUSE_CONFIG__`（编译时注入�?

### �?pnpm debug（`VITE_DEBUG_ONLY=1`�?

1. 注册 302 中间件：`/` �?`/index.html` �?`Location: /debug.html`
2. 完全接管 `server.printUrls`：仅输出 Debug URL �?

### �?pnpm dev（`VITE_DEBUG_ONLY` 未设置）

1. 扩展 `server.printUrls`：默�?URL 列表末尾追加 Debug 提示�?

### 中间件注册顺�?

```
middleware 1: YAML 端点（GET/POST/DELETE /__debug/*�?
middleware 2: �?debug 模式下存�?�?302 重定�?
```

YAML 端点必须�?302 之前，否�?Save/Load 请求会被重定向�?

## 新增可调参数

以新�?`keyColorTemperature` 为例�?

### 1. 类型定义（`LighthouseCaptureTypes.ts`�?

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

### 2. Leva 控件（`useLevaCaptureConfig.ts`�?

```ts
'主光 (Key)': folder({
  // ... existing ...
  keyColorTemperature: { value: defaults.keyColorTemperature, min: 1000, max: 10000, step: 100, label: '色温' },
}),
```

### 3. 离屏渲染（`LighthouseCaptureTypes.ts` �?`offscreenCapture()`�?

如果新参数影响渲染逻辑�?

```ts
export function offscreenCapture(config, lighthouseGroup) {
  // ... existing ...
  // 应用 keyColorTemperature 到光源或材质
}
```

### 4. 预览 Canvas 灯光（`LighthousePreviewPanel.tsx` �?`PreviewLights`�?

```tsx
function PreviewLights({ config }) {
  return (
    <>
      {/* ... existing ... */}
      {/* 如需�?Canvas 中可视化色温效果，在此添�?*/}
    </>
  )
}
```

### 5. YAML 白名单（`vite.config.ts` �?`SAVABLE_KEYS`�?

```ts
const SAVABLE_KEYS = [
  // ... existing ...
  'keyColorTemperature',  // 新增
] as const
```

### 6. 文档更新

更新本文�?+ [操作手册](./OPERATION.md) 中的参数表�?

如果新参数涉�?YAML 持久化，还需�?`vite.config.ts` �?`SAVABLE_KEYS` 中追加字段名�?

## YAML 端点

三个端点均在 `vite.config.ts` �?`debugOnlyPlugin` 中注册：

| 方法 | 路径 | 核心函数 |
|------|------|---------|
| GET | `/__debug/config` | `readYamlConfig()` �?`js-yaml.load()` |
| POST | `/__debug/save-config` | `pickSavalable()` �?`writeYamlConfig()` �?`js-yaml.dump()` |
| DELETE | `/__debug/config` | `fs.unlinkSync()` |

`pickSavalable()` 通过 `SAVABLE_KEYS` 白名单过滤，只保留允许持久化的字段�?

## 配置流向

```
                    ┌──────────────────�?
                    �?  调试面板 (dev)   �?
                    �?  Leva useControls �?
                    └────────┬─────────�?
                             �?Save 按钮
                             �?
                  POST /__debug/save-config
                             �?
                             �?
              ┌──────────────────────────�?
              �?lighthouse-capture.yaml   �? �?文件系统
              └──────────┬───────────────�?
                         �?
          ┌──────────────┼──────────────�?
          �?             �?             �?
          �?             �?             �?
    调试面板 Load    Vite define    Vite watcher
    (GET /config)   (编译时注�?    (变更 �?reload)
          �?             �?             �?
          �?             �?             �?
    Leva 初始�?  生产烘焙配置    自动刷新页面
    useControls   __LIGHTHOUSE__
```

## 生产构建注意事项

- `__LIGHTHOUSE_CONFIG__` �?`vite.config.ts` �?`define` 中注�?
- 仅在 `pnpm build` �?`pnpm dev` 启动时读取一�?
- �?YAML 文件时注入空对象 `{}`
- `CaptureConfig` 中不存在的字段会�?white-label 过滤（`SAVABLE_KEYS`），不会意外写入

## 依赖

- `leva` �?生产依赖（debug 页面用，tree-shaking 排除主应用）
- `js-yaml` + `@types/js-yaml` �?devDependency（仅 Vite 插件�?Node.js 使用�?
