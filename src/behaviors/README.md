# behaviors/ — 可复用行为逻辑

## 职责

纯计算函数 + Hook 封装。将 Actor 中的计算逻辑抽取为可测试的独立单元。

## 文件

| 文件 | 类型 | 职责 |
|------|------|------|
| `useFrameCache.ts` | Hook | 帧缓存守卫——同帧同参数跳过更新（`shouldSkip` / `shouldSkipSp`）|
| `useCameraFocus.ts` | 函数 | 相机双层平滑 + 轨道绕行 + 30s 自动取消 + SVG overlay 数据发射 |
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
