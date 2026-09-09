# behaviors/ — 可复用行为逻辑

## 职责

纯计算函数 + Hook 封装。将 Actor 中的计算逻辑抽取为可测试的独立单元。

## 文件

| 文件 | 类型 | 职责 |
|------|------|------|
| `useFrameCache.ts` | Hook | 帧缓存守卫——同帧同参数跳过更新（`shouldSkip` / `shouldSkipSp`）|
| `useCameraFocus.ts` | 函数 | `createCameraFocusController()` 创建场景独占控制器：双层平滑、每次零相位环绕、30s 自动返回；可由调用方传入复合行星的聚焦距离倍率（见 [资产对应](../actors/README.md#主页轨道与资产对应)） |
| `useOrbitPosition.ts` | 纯函数 | `calcOrbitPosition`——计算粒子轨道位置（可 L1 单测）|
| `useAppearanceFade.ts` | 纯函数 | `calcAppearance`——计算粒子缩放/透明度/颜色过渡（可 L1 单测）|
| `useOcclusionFade.ts` | 纯函数 | `calcOcclusionFade`——聚焦遮挡检测（可 L1 单测）|
| `useScreenSpaceHover.ts` | 纯函数 | `calcScreenSpaceHover`——NDC 投影悬停检测 + 迟滞阈值（可 L1 单测）|
| `useScreenProjection.ts` | Hook | 3D 世界坐标 → 屏幕坐标投影（NDC 管线），包括中央恒星 |
| `usePBDLayout.ts` | 有状态函数 | PBD 融合布局——模块级速度与目标历史、速度前馈 + 6 类混合约束 |
| `useFloatingLabels.ts` | Hook | PBD 编排层——rAF 步进 + 入场延迟 + 退出管理 |

> **PBD 文档：** [`../../docs/actors/pbd-layout-operation-guide.md`](../../docs/actors/pbd-layout-operation-guide.md)  
> [`../../docs/actors/pbd-layout-maintenance-guide.md`](../../docs/actors/pbd-layout-maintenance-guide.md)  
> [形式化公式](../../docs/actors/pbd-layout-formal.md) · [SVG 交互说明](../../docs/actors/pbd-layout-explainer.html)
>
> [历史设计（2026-06-21）](../../docs/superpowers/specs/2026-06-21-pbd-layout-design.md)

## 聚焦会话

相机控制器由 `Act3ContentPhase` 持有，避免模块级相位和平滑目标泄漏到新场景。点击行星与标签终端 `focus` 命令都调用 `setFocusedPlanet()`，将 `focusStartTime` 置为 `null`；下一场景帧使用 R3F 的 `elapsedTime` 开始计时，时间 `0` 也是有效开始时间。切换目标或再次发起同目标聚焦均开启新一轮计时。

每轮环绕角由 `0.024 × (time − focusStartTime)` 计算，从零相位开始；相机从当前实际姿态平滑衔接到初始环绕位置，不瞬移回全局再拉近。平滑系数按帧间隔换算，环绕速度不依赖帧率。满 `FOCUS_TIMEOUT`（源码在 `types/index.ts`，当前 30 秒）后清除聚焦并平滑返回默认全局位置和朝向，恢复滚轮与品牌显示。离开内容阶段或目标失效同样清除聚焦。

聚焦曾绘制恒星和行星的屏幕轮廓虚线圆、两圆的外公切线；现在已移除对应 SVG、投影计算及 `overlayData` 状态。标签自身的 PBD 牵引线和场景轨道线仍由各自模块管理。

## 命名约定

- 文件名以 `use` 开头；其中既有纯计算函数，也有 Hook 和有状态函数，以实现为准
- 纯函数零 React 依赖，零 Three.js 场景依赖，参数即输入、返回值即输出
- Three.js 类型（`Vector3`、`PerspectiveCamera`）作为参数传入，不 import 场景实例
- `stepPBD()` 的模块级状态需要明确所有权，不能把一个模块实例当作多个独立求解器。交互说明通过独立页面隔离它与主页。

## 测试

测试文件位于 `__tests__/` 目录：

| 测试文件 | 测试对象 | 层级 |
|----------|----------|:---:|
| `smoothstep.test.ts` | `smoothstep` / `toward` 纯函数 | L1 |
| `toward.test.ts` | `shortestDelta` / `clamped` | L1 |
| `r3f-components.test.tsx` | Lighthouse, LightBeam, OrbitRings, Act 可见性 | L2 |
| `usePBDLayout.test.ts` | `stepPBD` — shadow 方向 / 分离收敛 / 恒星避让 | L1 |

## 新增 Behavior 步骤

1. 创建纯函数（可测试）`src/behaviors/useXxx.ts`
2. 在 `__tests__/` 中添加 L1 测试
3. 在对应 Actor 的 `useFrame` 中调用

## 依赖方向

```
behaviors/ → types/ (ParticleData 等)
纯计算单元优先通过参数传入数据；编排 Hook 可依赖 stores，部分现有行为也读取 Actor 共享引用
```

## 相关文档

| 文档 | 用途 |
|------|------|
| [`../actors/README.md`](../actors/README.md) | 行为 Hook 的消费者（DustField.useFrame） |
| [`../../docs/COMPOSABILITY_TESTABILITY.md`](../../docs/COMPOSABILITY_TESTABILITY.md) | 纯函数测试策略分析（L1/L2 分层） |
| [`../../docs/MAINTENANCE.md`](../../docs/MAINTENANCE.md) §4.5 | 测试运行命令 |
| [`../utils/README.md`](../utils/README.md) | 底层数学工具函数（smoothstep, toward 等） |
