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
┌─────────────────────────────────────────────────────────────────┐
│  StudioToolbar: [模型选择器 ▼]       [☰][⛶][⛋] [📷]             │
├──────────────┬──────────────────────────────────┬───────────────┤
│  SceneExplorer│  StudioViewport                  │  PropertyPanel│
│  ───────────  │  ┌────────────────────────────┐  │  ───────────  │
│  环境         │  │          3D Canvas          │  │  模型信息     │
│  [Studio]     │  │  (OrbitControls + Gizmo)    │  │  名称        │
│  [Night]      │  │  (Environment + lights)     │  │  三角面      │
│  [Dawn]       │  │  (Model + helpers)          │  │  来源        │
│  [Sunset]     │  │                             │  │              │
│              │  │                             │  │  材质属性     │
│  辅助         │  │                             │  │  color       │
│  ☐ Grid 网格  │  │                             │  │  metalness   │
│  ☐ Axes 轴   │  │                             │  │  roughness   │
│  ☐ BBox 包围盒│  │                             │  └──────────────┘
│  ☐ Wireframe │  └────────────────────────────┘  │
│              │                                   │  动画          │
│  场景树       │                                   │  [▶] action_0  │
│  ▾ Mesh      │                                   │  [⏹] 停止      │
│    child_1   │                                   │  速度: ═══●══  │
│    child_2   │                                   │                │
├──────────────┴──────────────────────────────────┴───────────────┤
│  StatusBar: ● FPS 60    Draw Calls: 12    Tris: 20,400          │
└─────────────────────────────────────────────────────────────────┘
```

## 环境预设

左栏顶部提供四种环境预设，切换时同步更新 `StudioViewport` 中的 `<Environment>` 和环境光强度：

| 预设 | `drei` 预设值 | 环境光强度 | 适合场景 |
|------|---------------|-----------|----------|
| Studio | `studio` | 1.0 | 均匀柔光，适合展示材质细节 |
| Night | `night` | 0.4 | 暗调，适合发光材质或强调轮廓 |
| Dawn | `dawn` | 0.7 | 暖调低对比，柔和展示 |
| Sunset | `sunset` | 0.6 | 暖色高对比，戏剧化效果 |

点击预设按钮即可切换，环境光强度与 Leva 中的 `ambientIntensity` 参数相乘。

## 辅助工具

左栏提供四个辅助开关：

- **Grid 网格** — 启用地平面网格（`gridHelper`，20x20）
- **Axes 坐标轴** — 显示 RGB 坐标轴指示器（`axesHelper`）
- **BBox 包围盒** — 选中模型的轴对齐包围盒（半透明线框）
- **Wireframe 线框** — 切换当前模型所有 Mesh 的 wireframe 渲染模式

## 场景树

左栏底部展示当前加载模型的对象层级结构：

- 点击节点展开/折叠子节点
- 单击节点选中对应的 Mesh 对象
- 选中后右栏材质检查器同步显示该 Mesh 的材质属性
- 节点名称为 `Object3D.name` 或 `type` 的回退

## 视口模式

工具栏提供三种视口模式：

| 模式 | 按钮 | 说明 |
|------|------|------|
| **Single** | ☰ | 单一透视视口，含 OrbitControls、Gizmo、Environment |
| **Split** | ⛶ | 左右分屏：左侧实体渲染，右侧 Wireframe 线框渲染 |
| **Quad** | ⛋ | 四宫格：正视+侧视+顶视+透视，四个独立 Canvas |

Layout 由 `StudioLayout.css` 中的 `.viewport-split` 和 `.viewport-quad` class 控制。

## 截图导出

点击工具栏上的 📷 按钮导出当前视口 Canvas 为 PNG：

1. 查找 `.studio-viewport canvas` 元素
2. 调用 `canvas.toDataURL('image/png')`
3. 自动下载名为 `model-preview-{模型key}-{时间戳}.png` 的文件

## 材质检查器

右栏材质检查器在选中场景树中的 Mesh 节点后显示：

- **节点名称**：选中 Mesh 的 `name` 或 `type`
- **color**：材质漫反射颜色 hex 值
- **metalness**：金属度（0–1）
- **roughness**：粗糙度（0–1）
- **transparent**：透明 / 不透明
- **opacity**：透明度（0–1）
- **wireframe**：线框模式状态

未选中任何 Mesh 时显示提示信息。

## 动画控制

如果加载的 GLB 模型包含动画数据（`AnimationClip`），右栏底部显示动画控制面板：

- **播放/暂停按钮** — 点击切换每个动画片段的播放状态
- **停止按钮** — 停止所有动画
- **速度滑块** — 统一调节所有动画的 `timeScale`（0.1–3.0）

使用 `@react-three/drei` 的 `useAnimations` hook，依赖模型组 `ref` 的子对象。

## 状态栏

底栏实时显示渲染性能指标：

- **FPS** — 独立于 R3F 渲染循环的 `requestAnimationFrame` 采样，60 帧滑动平均，每 500ms 更新
- **Draw Calls** — 从 `gl.info.render.calls` 读取，由 `StudioViewport` 中的 `RendererStats` 组件写入 canvas `dataset`
- **Tris** — 从 `gl.info.render.triangles` 读取，同上

## 工作流

### 调参并预览

1. 在左栏选择模型、环境预设、切换辅助工具
2. 右侧 Leva 面板实时调节相机、灯光、变换参数
3. 拖拽视口中模型观察效果
4. 选中场景树节点查看材质属性

### 保存参数（应用到主应用 — Lighthouse 截图专用）

1. 选择 "Lighthouse · 截图调试" 模型
2. 调好 Leva 参数后点击 `保存当前参数 (Save)`
3. 参数写入 `src/debug/lighthouse-capture.yaml`
4. Vite 检测到文件变更 → full-reload → 主应用自动刷新
5. 切换到 `localhost:5173` 查看主应用 brand icon 效果

### 恢复默认值

1. 选择 "Lighthouse · 截图调试" 模型
2. 点击 `恢复默认值 (Recover)`
3. 删除 YAML 文件 + 页面重载
4. 参数恢复为 `DEFAULT_CAPTURE_CONFIG`

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
silhouetteType: solid
outlineType: silhouette
edgeGlowIntensity: 0.7
edgeGlowColor: '#ffffff'
edgeGlowThickness: 3
```

渲染参数（`captureW`, `captureH`, `antialias`）不参与持久化，始终使用默认值。

## 终端命令（与主应用共享）

```bash
pnpm dev          # 主应用 + debug（全量）
pnpm debug        # 仅 debug（根路径 302 → /debug.html）
pnpm build        # 生产构建（YAML → define 注入到 bundle）
```
