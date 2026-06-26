# 聚焦 HUD 更新卡顿排查：RAF 高帧率不等于 WebGL/HUD 同步

> 日期：2026-06-26  
> 标签：debug, performance, r3f, canvas, zustand, hud, act3

## 现象

Act 3 中点击行星进入聚焦后，WebGL 画面仍然有缓慢绕行的视觉效果，但 HUD 的虚线圈、切线、点阵和面板更新明显卡顿。  
一开始 debug 面板显示浏览器 RAF 可以稳定到 240fps，因此容易误判为“帧率没有问题”。实际肉眼看到的是 WebGL 动画和 HUD 覆盖层之间不同步：行星和相机在动，HUD 像是隔几帧才追上。

另外，页面滚动到最顶端或最底端时也曾出现 WebGL 动画卡住的情况，这和 HUD 卡顿是同一类问题：看起来是动画卡，根因不一定是浏览器 RAF 低。

## 排查过程

第一步先区分两个指标：

```ts
// 浏览器 requestAnimationFrame 频率
RAF fps

// R3F/WebGL 实际渲染帧数
GL fps
```

结果发现 RAF 很高时，WebGL 动画仍然可能卡。原因是项目使用了：

```tsx
<Canvas frameloop="demand" />
```

`frameloop="demand"` 不会因为浏览器 RAF 在跑就自动重绘 WebGL，它需要显式 `invalidate()`。如果页面处在滚动边界、scrollProgress 不再变化，WebGL 中那些依赖 `time` 的动画就可能没有足够的渲染请求。

因此先补了持续 invalidation：

```ts
if (hasTimeDrivenWebgl(scrollProgress, focusedPlanetIdx)) {
  invalidate()
}
```

这解决的是 WebGL 自身“有时间动画但没有持续渲染请求”的问题。

第二步看 HUD 更新链路。原实现大致是：

```txt
R3F useFrame
  -> updateCameraFocus()
  -> project star/planet contour
  -> setOverlayData() 写入 Zustand
  -> FocusHudOverlay 订阅 store
  -> requestAnimationFrame()
  -> 2D canvas 重画 HUD
```

这个链路有三个隐患：

1. HUD 几何从 WebGL 帧里出来后，要经过 Zustand 通知，再排另一个 RAF，天然可能晚一帧。
2. `overlayData` 是高频几何数据，每帧写 store 会让调试面板和其他订阅者也感知到更新压力。
3. HUD 每次重画不是简单几条线，而是包含 contour 投影、contour offset、切线支撑点、Path2D clip、全屏点阵纹理裁剪和文字面板。

为了止血，曾经尝试过：

- HUD canvas 透明度改为 DOM opacity，避免 alpha 淡入期间反复重画。
- 点阵纹理预先缓存。
- 降低 HUD canvas DPR 上限。
- 合并重复切线计算。
- 对 HUD 几何更新做 30fps 限频。

这些优化有些是正确的，但 30fps 限频直接破坏了“HUD 每帧跟随 WebGL”的目标；更严重的一次错误尝试是让聚焦后的相机绕行随 HUD 稳定而逐步停止，这虽然减轻了 HUD 压力，但改掉了核心视觉效果。该方案被撤回。

## 根因

根因不是单一的“canvas 慢”，而是渲染时钟和数据通道设计不匹配：

| 部分 | 旧行为 | 问题 |
| --- | --- | --- |
| WebGL 相机/行星 | R3F `useFrame` 内更新 | 连续、同帧 |
| HUD 几何 | 写入 Zustand 后再通知 | 跨通道、可能晚一帧 |
| HUD 绘制 | 订阅后再排 RAF | 和 WebGL 不保证同帧 |
| debug/store 订阅 | 可观察 `overlayData` 高频变化 | 放大主线程压力 |

如果要求 HUD 精确贴住 WebGL 中正在运动的对象，HUD 的几何计算和绘制就应该跟相机更新处于同一个时钟，而不是通过 React/Zustand 状态同步绕一圈。

## 修复

最终改成 imperative bridge：

```txt
R3F useFrame
  -> updateCameraFocus()
  -> camera.position / lookAt 更新完成
  -> 同帧投影 star/planet contour
  -> renderFocusHudFrame(frame)
  -> FocusHudOverlay 直接绘制 canvas
```

新增桥接层：

```ts
// src/actors/focusHudBridge.ts
export function registerFocusHudRenderer(renderer) { ... }
export function renderFocusHudFrame(frame) { ... }
```

`FocusHudOverlay` 挂载时注册 canvas renderer；`useCameraFocus` 在 R3F `useFrame` 内完成相机更新后，直接调用 `renderFocusHudFrame()`。这样 HUD 不再依赖 `overlayData` 的逐帧更新，也不再额外排一个 RAF。

同时保留不改变视觉意图的优化：

- 点阵 texture 按 viewport/dayNight 缓存。
- HUD canvas DPR 上限降低，避免高 DPR 下全屏绘制成本爆炸。
- 点阵裁剪和虚线几何共用同一次切线计算。
- HUD alpha 用 canvas DOM opacity 表达，不把淡入过程变成全屏重绘过程。

撤回会改变视觉效果的优化：

- 不再让聚焦后的缓慢绕行停止。
- 不再对 HUD 几何做 30fps 限频。
- 不再对 HUD 位置做 2px 量化。

## 结果

HUD 更新路径从“store 状态同步 + 二次 RAF”变成“R3F 同帧 imperative 绘制”。  
这让 HUD 的虚线圈、切线和点阵可以跟随 WebGL 相机绕行，而不会因为 store 通知链和另一个 RAF 出现延后。

验证命令：

```bash
corepack pnpm exec tsc --noEmit
corepack pnpm test -- --run
corepack pnpm build
```

当前测试结果：15 个测试文件、67 个测试通过。

## 教训

- FPS 指标必须分层看：浏览器 RAF 高，不代表 R3F/WebGL 每帧都在渲染，也不代表 DOM/canvas overlay 和 WebGL 同步。
- `frameloop="demand"` 适合滚动驱动场景，但只要存在时间驱动动画，就必须显式维护 invalidation 策略。
- 高频逐帧几何数据不适合走 React/Zustand 状态通道。Zustand 适合表达“当前聚焦谁、debug 是否开启、day/night 模式”等低频状态。
- 对“贴合 WebGL 运动对象”的 HUD，优先考虑同帧 imperative renderer；React 组件只负责挂载 canvas 和生命周期。
- 性能优化不能牺牲核心视觉。减少运动、降低跟随频率、量化位置都可能让性能看起来变好，但如果视觉目标是“聚焦后缓慢绕行且 HUD 贴合”，这些都不是合格修复。
