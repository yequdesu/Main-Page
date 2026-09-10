# behaviors/ — 可复用行为逻辑

## 职责

纯计算函数 + Hook 封装。将 Actor 中的计算逻辑抽取为可测试的独立单元。

## 文件

| 文件 | 类型 | 职责 |
|------|------|------|
| `useFrameCache.ts` | Hook | 帧缓存守卫——同帧同参数跳过更新（`shouldSkip` / `shouldSkipSp`）|
| `useCameraFocus.ts` | 函数 | `createCameraFocusController()` 创建场景独占控制器：双层平滑、固定抬高起点、30s 自动返回；可由调用方传入复合行星的聚焦距离倍率（见 [资产对应](../actors/README.md#主页轨道与资产对应)） |
| `focusPose.ts` | 函数 | 相机和调相器共用的目标姿态与视野适配 |
| `useFocusOrbit.ts` | 有状态函数 | 透视构图选相位、沿原轨道调相、近同步公转和退出恢复 |
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

相机绕“行星 → 恒星”轴的相位由 `0.9 + 0.006 × (time − focusStartTime)` 计算（弧度，参数在 [focusPose.ts](focusPose.ts)）。起点已有俯视角，随后以原先四分之一的角速度继续缓慢抬升；轴向相位不等于相机实际俯角。相机从当前实际姿态平滑衔接到初始环绕位置，不瞬移回全局再拉近。平滑系数按帧间隔换算，环绕速度不依赖帧率。满 `FOCUS_TIMEOUT`（源码在 `types/index.ts`，当前 30 秒）后清除聚焦并平滑返回默认全局位置和朝向，恢复滚轮与品牌显示。离开内容阶段或目标失效同样清除聚焦。

聚焦视野在原始垂直 FOV 上增加 8° 余量，再按宽高比保持最低水平视野：`tan(FOV / 2) = tan((baseFov + 8°) / 2) × max(1, 1.35 / aspect)`。默认宽屏由 40° 平滑到 48°；窄屏视野更宽，近景在屏幕上的占比相应减小。退出恢复初始 FOV。相机到行星的距离、注视点偏移与 1 / 1.25 / 1.25 距离倍率仍沿用原规则。

### 原轨道调相构图

[useFocusOrbit.ts](useFocusOrbit.ts) 的控制器由 `Planets` 独占。三颗主行星的角度只由此控制器推进；`calcOrbitPosition` 在主行星路径中以 `delta = 0` 消费结果，碎片保持原有更新流程。持续渲染沿用 `Planets` 的 `invalidate()`，不另建动画循环。

1. 进入聚焦、切换目标或宽高比改变时，按 2° 网格搜索另外两颗行星相对聚焦行星的角度。预测未来 0–30 秒、每 5 秒一个时刻的相机投影，包含小幅相位漂移。相邻角间隔小于 180° 并留出漂移余量，使三角形包含恒星；评分优先考虑完整实体包络留在视口内，再考虑恒星左右分布、遮挡与间距。包络包含完整卫星公转范围、最外环和最大悬停缩放，半径由资产参数传入。搜索只发生在状态切换时。
2. 聚焦行星的角速度平滑趋向 `ωc = −0.015 rad/s`。其他行星的目标角度为 `θ*i = θf + φi + 0.025 sin(0.12t + 2.1i)`，其中 `φi` 是搜索得到的相对相位，`t` 为本轮调相时间。以最短角差 `ei = atan2(sin(θ*i − θi), cos(θ*i − θi))` 进行比例跟随；补偿速度限幅为 `±1.8 rad/s`，再平滑速度，因此沿原圆形轨道加速、减速到位，不插值世界坐标直线。当前验证场景约 4 秒进入稳定构图。
3. 到位后仍保留有界的相位漂移（幅度约 1.43°），角速度略有差异但不会持续拉开构图。相机仍追随聚焦行星，与整体缓慢公转保持关联。切换目标从当前角度和速度衔接。
4. 退出时保留当前相位，将角速度以 0.65 秒时间常数恢复到原值及原悬停系数，不追赶假想的旧轨道位置。轨道半径、平面、模型尺度和附件局部姿态都保持各自原有逻辑。

该评分是当前三轨道与资产尺寸下的视觉近似，使用投影包络而非逐像素遮挡求解。视口适配会牺牲部分窄屏近景占比；开始调相和切换目标的过渡途中不保证始终满足最终三角构图。新增轨道、修改资产尺寸、镜头参数或延长聚焦时间时，应同步调整预测并复验视口边界。

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
| `useFocusOrbit.test.ts` | 不同宽高比、完整附件边界、三角包含、切换与角速度恢复 | L1 |
| `useCameraFocus.test.ts` | 会话计时、镜头距离、抬升与 FOV 恢复 | L1 |
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
