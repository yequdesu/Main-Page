# 操作手册

## 启动

```bash
pnpm debug    # 仅调试面板（根路径 302 → /debug.html）
pnpm dev      # 主应用 + 调试面板（手动访问 /debug.html）
```

### 区别

| | `pnpm dev` | `pnpm debug` |
|---|---|---|
| 访问 `/` | 主应用 | 302 重定向到 `/debug.html` |
| 访问 `/debug.html` | 调试面板 | 调试面板 |
| 何时用 | 日常开发，边滚动边看截图效果 | 专注调参，隔离主应用运行 |

启动后根据回显区分当前模式：

```bash
# pnpm dev — 多行 URL
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.2.124:5173/
➜  Debug:   http://localhost:5173/debug.html

# pnpm debug — 仅一行
➜  Debug:   http://localhost:5173/debug.html
```

## 界面布局

```
┌──────────────────────────┬────────────────────┐
│                          │  Leva 控制面板      │
│   实时 3D Canvas          │  ┌──────────────┐  │
│   （灯塔 + 灯光 + 相机）   │  │ 相机 FOV   … │  │
│                          │  │ 环境光     … │  │
│                          │  │ 主光       … │  │
│                          │  │ 补光       … │  │
│                          │  │ 位移       … │  │
│                          │  └──────────────┘  │
│                          │                    │
│                          │  烘焙预览          │
│                          │  ┌──────────────┐  │
│                          │  │ 512×1024     │  │
│                          │  │ PNG preview  │  │
│                          │  └──────────────┘  │
│                          │  [手动烘焙]         │
│                          │  [保存参数]         │
│                          │  [恢复默认]         │
└──────────────────────────┴────────────────────┘
```

## 参数分组

| 组 | 参数 | 说明 |
|----|------|------|
| **相机** | FOV, 相机 Z, 相机 Y | 视角与构图。FOV=25 接近正交，减少透视畸变 |
| **渲染** | 宽度, 高度, 抗锯齿 | 烘焙画布尺寸。参数变更不写入 YAML |
| **环境光** | 颜色, 强度 | 基础照明，影响暗面亮度。默认 #ffffff / 1.8 |
| **主光 (Key)** | 颜色, 强度, X/Y/Z | 模拟太阳方向。默认 (4,6,8) 强度 2.2 |
| **补光 (Fill)** | 颜色, 强度, X/Y/Z | 减少暗部全黑。默认 (-4,2,4) 冷色调强度 1.0 |
| **位移** | Y 偏移 | 灯塔在画面中的垂直位置。默认 -0.965 |

## 工作流

### 调参并预览

1. 拖拽 Leva 滑块 → 左侧 Canvas 实时响应
2. 如需自由旋转观察，可在 Canvas 配置中启用 OrbitControls（需安装 drei）
3. 右侧 `烘焙预览` 区域自动更新（300ms 防抖），也可点击 `手动烘焙` 立即触发

### 保存参数（应用到主应用）

1. 调好参数后点击 `保存当前参数 (Save)`
2. 参数写入 `src/debug/lighthouse-capture.yaml`
3. Vite 检测到文件变更 → full-reload → 主应用自动刷新
4. 切换到 `localhost:5173` 查看主应用 brand icon 效果

### 恢复默认值

1. 点击 `恢复默认值 (Recover)`
2. 删除 YAML 文件 + 页面重载
3. 参数恢复为 `DEFAULT_CAPTURE_CONFIG`

## 配置文件

```
src/debug/lighthouse-capture.yaml  ← Save 后生成，可 git commit
```

仅保存以下 15 个参数（白名单过滤）：

```yaml
cameraFov: 25
cameraZ: 9
cameraY: 0
ambientColor: '#ffffff'
ambientIntensity: 1.8
keyColor: '#ffffff'
keyIntensity: 2.2
keyX: 4
keyY: 6
keyZ: 8
fillColor: '#c8d6ff'
fillIntensity: 1.0
fillX: -4
fillY: 2
fillZ: 4
cloneY: -0.965
```

渲染参数（`captureW`, `captureH`, `antialias`）不参与持久化，始终使用默认值。

## 终端命令（与主应用共享）

```bash
pnpm dev          # 主应用 + debug（全量）
pnpm debug        # 仅 debug（根路径 302 → /debug.html）
pnpm build        # 生产构建（YAML → define 注入到 bundle）
```
