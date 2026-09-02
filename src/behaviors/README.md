# behaviors/ �?可复用行为逻辑

## 职责

纯计算函�?+ Hook 封装。将 Actor 中的计算逻辑抽取为可测试的独立单元�?

## 文件

| 文件 | 类型 | 职责 |
|------|------|------|
| `useFrameCache.ts` | Hook | 帧缓存守卫——同帧同参数跳过更新（`shouldSkip` / `shouldSkipSp`）|
| `useCameraFocus.ts` | 函数 | 相机双层平滑 + 轨道绕行 + 30s 自动取消 + SVG overlay 数据发射 |
| `useOrbitPosition.ts` | 纯函�?| `calcOrbitPosition`——计算粒子轨道位置（�?L1 单测）|
| `useAppearanceFade.ts` | 纯函�?| `calcAppearance`——计算粒子缩�?透明�?颜色过渡（可 L1 单测）|
| `useOcclusionFade.ts` | 纯函�?| `calcOcclusionFade`——聚焦遮挡检测（�?L1 单测）|
| `useScreenSpaceHover.ts` | 纯函�?| `calcScreenSpaceHover`——NDC 投影悬停检�?+ 迟滞阈值（�?L1 单测）|
| `useScreenProjection.ts` | Hook | 3D 世界坐标 �?屏幕坐标投影（NDC 管线），包括中央恒星 |
| `usePBDLayout.ts` | 纯函�?| PBD 标签布局引擎——速度前馈 + 6 类约束投�?|
| `useFloatingLabels.ts` | Hook | PBD 编排层——rAF 驱动 60fps 物理 + 入场排序 + 退出管�?|
| `reefObstacleMask.ts` | 纯函数 | 将导入礁石网格的俯视三角形轮廓栅格化为浅水模拟障碍场 |

> **PBD 文档�?* [`../../docs/actors/pbd-layout-operation-guide.md`](../../docs/actors/pbd-layout-operation-guide.md)  
> [`../../docs/actors/pbd-layout-maintenance-guide.md`](../../docs/actors/pbd-layout-maintenance-guide.md)  
> [`../../docs/superpowers/specs/2026-06-21-pbd-layout-design.md`](../../docs/superpowers/specs/2026-06-21-pbd-layout-design.md)

## 命名约定

- 文件名以 `use` 开头（统一样式），但内部导�?*纯函�?*而非 Hook
- 纯函数零 React 依赖，零 Three.js 场景依赖，参数即输入、返回值即输出
- Three.js 类型（`Vector3`、`PerspectiveCamera`）作为参数传入，�?import 场景实例

## 测试

测试文件位于 `__tests__/` 目录�?

| 测试文件 | 测试对象 | 层级 |
|----------|----------|:---:|
| `smoothstep.test.ts` | `smoothstep` / `toward` 纯函�?| L1 |
| `toward.test.ts` | `shortestDelta` / `clamped` | L1 |
| `r3f-components.test.tsx` | Lighthouse, LightBeam, OrbitRings, Act 可见�?| L2 |
| `usePBDLayout.test.ts` | `stepPBD` �?shadow 方向 / 分离收敛 / 恒星避让 | L1 |

## 新增 Behavior 步骤

1. 创建纯函数（可测试）`src/behaviors/useXxx.ts`
2. �?`__tests__/` 中添�?L1 测试
3. 在对�?Actor �?`useFrame` 中调�?

## 依赖方向

```
behaviors/ �?types/ (ParticleData �?
behaviors/ 不依�?actors/, acts/, stores/（参数通过函数签名传入�?
```

## 相关文档

| 文档 | 用�?|
|------|------|
| [`../actors/README.md`](../actors/README.md) | 行为 Hook 的消费者（DustField.useFrame�?|
| [`../../docs/COMPOSABILITY_TESTABILITY.md`](../../docs/COMPOSABILITY_TESTABILITY.md) | 纯函数测试策略分析（L1/L2 分层�?|
| [`../../docs/MAINTENANCE.md`](../../docs/MAINTENANCE.md) §4.5 | 测试运行命令 |
| [`../utils/README.md`](../utils/README.md) | 底层数学工具函数（smoothstep, toward 等） |
