# Debug Studio

独立的开发用 3D 模型工作台，入口为 [debug.html](../../debug.html) → [debug.tsx](../debug.tsx) → [StudioShell.tsx](StudioShell.tsx)。默认生产构建只输出主应用，不包含 Debug 页面。

## 启动

```bash
pnpm dev      # / 为主页，/debug.html 为 Studio
pnpm debug    # / 与 /index.html 重定向到 /debug.html
```

默认端口为 5173，端口占用时以 Vite 输出为准。两种开发模式都提供图标配置 API。`VITE_DEBUG_ONLY` 非空时启用独立模式，不要将字符串 `0` 当作关闭开关。

## 当前能力

- 左侧对象树：加载完成后生成层级；按名称或类型搜索，选中、聚焦、隐藏、隔离和恢复显示。
- 中间视口：单视图、实体/线框对比、正视/侧视/顶视/透视四视图；模型归一化居中、自动取景，支持适配全部与重置方向。
- 右侧场景：灯光预设、辅助工具、活动相机数值、模型变换、自动旋转和背景；Leva 面板在侧栏内部滚动。
- 右侧对象：来源、节点与只读材质检查；GLB 有动画时显示片段、播放、暂停、停止和速度。
- 灯塔图标：与主页共用烘焙函数，提供日夜预览、PNG 下载、配置保存、重新读取、本地恢复默认与未保存提示。
- 导出：活动视口或全部视口拼图，选择分辨率、透明背景和辅助线框。
- 状态栏：活动视口的实际渲染采样；静止时显示“空闲 · 按需渲染”。

侧栏支持拖动、键盘左右键调整宽度和顶部按钮收起。不宽于 720px 时侧栏默认收起，展开后覆盖在视口上；完整编辑推荐桌面窗口。同一页面内切换模型保留各模型参数、对象显示状态和相机姿态；布局设置沿用工作台当前选择。刷新后重新初始化，只有已保存的图标参数持久化到文件。

## 文件职责

| 文件 | 职责 |
|------|------|
| [StudioShell.tsx](StudioShell.tsx) | 模型会话、共享交互状态、侧栏编排与拼图导出 |
| [StudioToolbar.tsx](StudioToolbar.tsx) | 模型、布局、适配、侧栏和导出入口 |
| [SceneExplorer.tsx](SceneExplorer.tsx) | 搜索、层级、对象选择与显示操作 |
| [StudioViewport.tsx](StudioViewport.tsx) | 独立 Canvas、加载反馈、相机、灯光、选中框与动画 |
| [studioModel.ts](studioModel.ts) | 克隆资源所有权、局部包围盒、稳定节点路径与相机取景 |
| [studioTypes.ts](studioTypes.ts) | 视口句柄与共享状态类型 |
| [PropertyPanel.tsx](PropertyPanel.tsx) | 相机编辑、只读材质检查与动画操作 |
| [ModelPreviewControls.tsx](ModelPreviewControls.tsx) | 工作台灯光、变换、旋转与背景的局部 Leva store |
| [CapturePanel.tsx](CapturePanel.tsx) | 图标草稿、保存状态、读取与实际烘焙预览 |
| [useLevaCaptureConfig.ts](useLevaCaptureConfig.ts) | 图标专用的局部 Leva store |
| [captureSettings.ts](captureSettings.ts) | 前后端共用的保存字段、数值/枚举/颜色校验与脏状态签名 |
| [captureViewport.ts](captureViewport.ts) | 显式离屏渲染、像素读回与临时状态恢复 |
| [StatusBar.tsx](StatusBar.tsx) | 读取活动视口实际帧数和绘制统计 |
| [studioUI.ts](studioUI.ts)、[StudioLayout.css](StudioLayout.css) | 主题、下载工具、布局与交互样式 |

模型接入见 [模型说明](../models/README.md)。预览场景参数与灯塔图标参数分别管理；主视口的线框、隐藏和变换不会写入主页图标配置。

## 图标配置流

```text
图标参数草稿 → offscreenCapture → 实际 PNG / 品牌效果预览
      │ 保存
      ↓
POST /__debug/save-config → lighthouse-capture.yaml
      ├─ GET /__debug/config → 编辑器重新加载
      ├─ 自定义 HMR 事件 → 已打开的主页刷新，Studio 保留编辑状态
      └─ 下次生产构建 → __LIGHTHOUSE_CONFIG__ 注入
```

默认参数在 [LighthouseCaptureTypes.ts](../actors/LighthouseCaptureTypes.ts)，覆盖文件为 [lighthouse-capture.yaml](lighthouse-capture.yaml)。保存字段由 [captureSettings.ts](captureSettings.ts) 定义；预览分辨率、抗锯齿及相机裁剪面不保存。配置合并仍由 [LighthouseCapture.tsx](../actors/LighthouseCapture.tsx) 负责。

## 文档

- [操作手册](OPERATION.md)：实际使用流程。
- [维护指南](MAINTENANCE.md)：状态边界、资源生命周期、API、扩展和验证。
- [本轮治理与验收记录](../../docs/dev-blog/debug-studio-governance.md)：变更原因与本次验证范围。
