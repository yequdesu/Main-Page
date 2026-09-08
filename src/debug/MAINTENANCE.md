# Debug Studio 维护指南

模块地图见 [README](README.md)，使用方式见 [操作手册](OPERATION.md)。当前实现以 `StudioShell` 的模型会话为状态宿主，普通控件和图标控件各用局部 Leva store，避免全局面板重复注册与覆盖。

## 场景、相机与所有权

- 每个视口拥有自己的 Canvas、相机、OrbitControls、对象节点、骨骼、材质和 AnimationMixer；只共享 GLTF 缓存中的几何体与贴图。`cloneForViewport` 使用 SkeletonUtils 克隆骨骼关系，卸载仅释放克隆材质，`primitive` 设置 `dispose={null}`。
- 模型自己的局部包围盒用于居中归一化，最大边长按 4 个场景单位显示；用户变换在归一化之外。自动取景按包围盒投影和当前宽高比计算，正交视图使用正确的 frustum。
- `LoadedAsset` 挂载完成后报告对象层级，没有固定延迟扫描。节点标识使用子节点路径；模型层级不变时跨实例一致。
- 选择、隐藏、隔离与辅助显示从单一状态映射到各视口。材质只读检查以主透视实例为来源。
- 视口通过 `ViewHandle` 注册 fit、pose、setPose、capture 和统计。相机 pose 包含距离、角度、平移目标和正交缩放；数值控制与 OrbitControls 操作共用此接口。
- 灯塔以 `standalone` 模式挂载，不写 `_lighthouseGroupRef`，不执行主页滚动可见性逻辑。默认模式保持主页行为。
- Canvas 保留 `flat`、`frameloop="demand"`。OrbitControls 会请求渲染，模型/辅助状态更新显式 invalidate；动画用 mixer 更新并请求下一帧。渲染在有优先级的 useFrame 内显式执行，统计紧随本次 render 读取。

三角面数从活动视口读取，不在注册表中手写。环境预设只用本地环境光与方向光，不依赖外部 HDR 服务。

设计依据：[R3F 对象与释放](https://r3f.docs.pmnd.rs/api/objects)、[按需渲染与共享资源](https://r3f.docs.pmnd.rs/advanced/scaling-performance)、[SkeletonUtils.clone](https://threejs.org/docs/pages/module-SkeletonUtils.html)。同一个 Object3D 不能同时挂载到多个父节点，这是使用独立实例的原因。

## 两种截图流程

`captureViewport` 使用当前 renderer 和临时 WebGLRenderTarget 显式渲染，调用 readRenderTargetPixels 后翻转像素行写入 2D Canvas。无论成功或失败，finally 均恢复渲染目标、背景、透明度和辅助对象可见性，并释放临时目标。由 Shell 按视口布局合成 PNG。它不依赖已被浏览器清空的 drawing buffer。

图标预览使用主页同一个 `offscreenCapture` 函数。编辑器先克隆专用灯塔实例，去除工作台线框影响，再传入图标参数与主题覆盖；烘焙函数恢复所有子对象可见性。预览在参数变化后延迟 350ms 生成，离开页签后不继续生成。烘焙函数只释放自己的剪影材质、renderer 和 WebGL context，不释放克隆共享的源几何体/材质。主应用与工作台都受益于这个所有权修复。

渲染目标与像素读回接口参见 [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)。图标基线合成算法保留原行为；“视口 PNG”和“图标 PNG”的用途、尺寸及参数来源不同。

## 配置与开发端点

[../../vite.config.ts](../../vite.config.ts) 在两种开发模式下注册：

| 方法 | 路径 | 行为 |
|------|------|------|
| GET | `/__debug/config` | 读取并校验 YAML；不存在时 204，内容错误时返回错误 |
| POST | `/__debug/save-config` | 校验 JSON 后写 YAML，返回 `{ ok: true }`；非法字段值不写入 |
| DELETE | `/__debug/config` | 兼容已有开发接口，删除覆盖文件；当前 UI 的“恢复默认”不调用它 |

允许保存的字段和数值、枚举、颜色约束统一在 [captureSettings.ts](captureSettings.ts)。添加持久化参数时同时更新 CaptureConfig、默认值、实际烘焙逻辑、Leva 控件与此校验边界；渲染宽高、抗锯齿、裁剪面只用于本次预览。

YAML 变化发送 `lighthouse-config-updated` 自定义 HMR 事件，由 [main.tsx](../main.tsx) 监听并刷新主页。不要改回 `full-reload` 的 `/index.html` 路径：Vite 客户端会把这个路径视为所有页面重载，使 Studio 丢失相机和草稿。生产构建仍在启动时读取 YAML 并注入 `__LIGHTHOUSE_CONFIG__`。

## 扩展与验证

新模型接入 [MODEL_REGISTRY](../models/index.ts)。GLB 路径优先走通用加载管道；程序化组件应能通过 `standalone` 脱离主页行为。只有 `debugControls: 'lighthouse-capture'` 显示图标制作页签，不应对所有程序化模型启用灯塔控件。

新增环境预设修改注册表 EnvPreset、Shell 选项和 Viewport 的 ENV_LIGHTS。新增辅助工具修改 studioTypes、Shell 控件和 Viewport，并标记 `userData.studioHelper` 使导出开关正确工作。

```bash
pnpm test --run src/debug/__tests__
pnpm build
pnpm test --run
```

测试覆盖克隆资源隔离、局部测量、视锥取景、隐藏/隔离、保存边界、像素方向与失败清理。默认 `pnpm build` 不打包 Debug 入口，因此还必须在 `/debug.html` 做浏览器验证：三个模型的单/对比/四视图、侧栏收起与调整、相机与自动旋转、对象操作、图标参数变化/保存/重读/失败、透明 PNG 与拼图。改变共享烘焙或 Lighthouse 时还要检查主页首幕、主题与滚动可见性。

浏览器/WebGL 验证与单元测试互补，不能将 Node 中的 mock renderer 测试当作像素正确性的证明。
