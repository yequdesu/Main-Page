# behaviors/ — 可复用行为逻辑

## 职责

纯计算函数 + Hook 封装。将 Actor 中的计算逻辑抽取为可测试的独立单元。

## 文件

| 文件 | 类型 | 职责 |
|------|------|------|
| `useFrameCache.ts` | Hook | 帧缓存守卫——同帧同参数跳过更新（`shouldSkip` / `shouldSkipSp`）|
| `useCameraFocus.ts` | 函数 | `createCameraFocusController()` 创建场景独占控制器：消费时间轴进度、固定抬高起点、更新相机位置/朝向/FOV；可由调用方传入复合行星的聚焦距离倍率（见 [资产对应](../actors/README.md#主页轨道与资产对应)） |
| `useFocusTimeline.ts` | 有状态函数 | 事件触发 GSAP Timeline，统一编排镜头、调相、轨道淡化、回位与超时 |
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

业务入口使用 `setFocusedPlanet(idx)` / `clearFocus(reason)`，在 Zustand 中同时写入当前 UI 状态和新的 `focusEvent` 对象。`Planets` 订阅事件、请求渲染，并在下一帧交给 [useFocusTimeline.ts](useFocusTimeline.ts)。同一帧内多个请求采用最后一个；同目标再次请求也会重建会话。手动退出、时间轴超时、离开内容阶段或目标失效走同一个退出事件。

`Planets` 独占一个 GSAP Timeline，会话被新事件接管时先 `kill()` 旧时间轴，并用会话版本号保护回调。它通过 Canvas 内的 [FocusAnimationProvider](../r3f/FocusAnimationContext.tsx) 共享可变进度；进度不逐帧写入 Zustand，也不触发 React 重渲染。`Act3ContentPhase` 的相机控制器是相机位置、朝向与 FOV 的唯一写入者，轨道计算器是主行星角度的唯一写入者，轨道材质只消费显隐进度。

### 时间轴节点

参数集中在 `useFocusTimeline.ts` 的 `FOCUS_TIMING`；超时阈值沿用 `types/index.ts` 的 `SCROLL_RIG.FOCUS_TIMEOUT`。

| 节点 | 起点 | 动作 |
|------|------|------|
| `focus:start` | 0 秒 | 镜头用 1.8 秒靠近；其他行星用 4 秒完成调相；导航轨道用 2.4 秒淡化 |
| `focus:hold` | 4 秒 | 已完成构图，继续缓慢公转与抬升 |
| `focus:timeout` | 30 秒 | 发出 `exit` 事件，原因 `timeout` |
| `exit:start` | 退出事件到达时 | 镜头用 1.8 秒拉远；行星用 0.7 秒收住当前调相速度；轨道显示用 2.4 秒恢复 |
| `exit:return` | 退出后 0.7 秒 | 三颗行星按各自剩余弧长和限速，沿原公转方向追赶参考位置 |
| `exit:complete` | 所有子动画结束 | 会话进入 `idle`，正常公转继续 |

相机转场使用时间轴的 `power2.inOut` 进度，从接管瞬间的实际姿态插值到实时目标。目标随行星运动持续更新。目标姿态绕“行星 → 恒星”轴的相位为 `0.9 + 0.006 × elapsed`（弧度），`elapsed` 由时间轴驱动；几何参数见 [focusPose.ts](focusPose.ts)。轴向相位不等于实际俯角。`focusStartTime` 仅记录场景时钟下的会话起点，不再由相机自行判断超时。窗口比例改变会从当前姿态开启新的构图会话和计时。

### 驱动与资源所有权

复用 GSAP 的 Timeline、标签、属性补间和回调编排。时间轴创建为 `paused: true`，由 R3F 每帧通过 `totalTime(next, false)` 推进；这是为主场景提供单一时间源，避免 GSAP ticker 与 R3F 各自推进一次场景状态。终端原有时间轴继续运行，未修改 GSAP 全局时间轴或全局 ticker。

`Planets` 使用 `useFrame` 优先级 `-1`，先消费事件、推进时间轴、更新行星；优先级 `0` 的相机和轨道材质随后消费同一帧进度。负优先级不接管 R3F 自动渲染。事件订阅会 `invalidate()`；行星可见期间持续请求帧，离开场景后仍请求帧直到退出时间轴完成。帧间隔限制为 0–0.1 秒，标签页挂起后不会单帧跳完整段转场；30 秒按实际推进的场景时间计算。卸载时取消订阅并销毁时间轴；React StrictMode 重建时建立新实例。

设计依据：[GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)、[播放头 totalTime](https://gsap.com/docs/v3/GSAP/Timeline/totalTime()/)、[kill 与生命周期](https://gsap.com/docs/v3/GSAP/Timeline/kill()/)、[R3F useFrame 与执行顺序](https://r3f.docs.pmnd.rs/api/hooks#useframe)。

聚焦视野在原始垂直 FOV 上增加 8° 余量，再按宽高比保持最低水平视野：`tan(FOV / 2) = tan((baseFov + 8°) / 2) × max(1, 1.35 / aspect)`。默认宽屏由 40° 平滑到 48°；窄屏视野更宽，近景在屏幕上的占比相应减小。退出恢复初始 FOV。相机到行星的距离、注视点偏移与 1 / 1.25 / 1.25 距离倍率仍沿用原规则。

### 原轨道调相构图

[useFocusOrbit.ts](useFocusOrbit.ts) 的控制器由 `Planets` 独占。三颗主行星的角度只由此控制器推进；`calcOrbitPosition` 在主行星路径中以 `delta = 0` 消费结果，碎片保持原有更新流程。持续渲染沿用 `Planets` 的 `invalidate()`，不另建动画循环。

1. 进入聚焦、切换目标或宽高比改变时，按 2° 网格搜索另外两颗行星相对聚焦行星的角度。预测未来 0–30 秒、每 5 秒一个时刻的相机投影，包含小幅相位漂移。相邻角间隔小于 180° 并留出漂移余量，使三角形包含恒星；评分优先考虑完整实体包络留在视口内，再考虑恒星左右分布、遮挡与间距。包络包含完整卫星公转范围、最外环和最大悬停缩放，半径由资产参数传入。搜索只发生在状态切换时。
2. 聚焦行星在 0.65 秒内将角速度平滑衔接至 `ωc = −0.015 rad/s`，角度通过速度的解析积分得到。其他行星的实时目标为 `θ*i = θf + φi + 0.025 sin(0.12t + 2.1i)`。时间轴给出 4 秒调相进度 `u`，使用 `θi = θ*i + 2πk + E[1 − s(u)] + vrel T u(1 − u)³`；`E` 为接管时最短角差，`s(u) = 10u³ − 15u⁴ + 6u⁵`，`vrel` 是接管瞬间相对目标的速度。末项保留初始速度并在结束时归零，因此中途切换或打断回位时也能连续衔接。全过程只改变轨道相位。
3. 到位后仍保留有界的相位漂移（幅度约 1.43°），角速度略有差异但不会持续拉开构图。相机仍追随聚焦行星，与整体缓慢公转保持关联。切换目标从当前角度和速度衔接。
4. 三颗行星各自维护持续运行的参考相位。聚焦和回位期间，参考相位按 `_baseSpeed` 推进，表示未进行构图调相时此刻应到达的位置；全景自由公转时，参考与实际相位一同响应原悬停减速。切换目标、窗口比例变化和中途重新聚焦均不重置参考相位。
5. 退出时镜头按时间轴进度拉远，行星先用 0.7 秒将退出瞬间的速度平滑衔接到原速度。如果调相尚未完成且正在反向移动，这一阶段先连续制动；其后的快速回位全程使用原公转方向。剩余同向弧长决定回位时长：`T = max(1.6, 1.875D / 2.8)` 秒，`D` 为 0–2π 内的弧长。快速回位的额外角速度不超过 2.8 rad/s，加上镜头衔接阶段，运动总时长约 2.3–4.9 秒；会话会等轨道显示恢复等全部子动画完成后再进入 idle。
6. 回位采用五次缓动 `s(u) = 10u³ − 15u⁴ + 6u⁵`，其中 `u = t / T`。目标相位 `θref` 始终推进，实际角度为 `θ = θref + 2πk − σD[1 − s(u)]`，`σ` 是原公转方向，圈次 `k` 在退出事件发生时依据制动终点预测固定。这样会追上运动中的目标，且起止相对速度和相对加速度都为零；接近目标时不会因模运算再次绕一圈。再次聚焦会取消回位计划，从实际角度和速度继续新构图。轨道半径、平面、模型尺度和附件局部姿态都沿用原逻辑。

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
| `useFocusOrbitReturn.test.ts` | 同向回位、移动目标、零点边界、限速、制动与中途重新聚焦 | L1 |
| `useFocusTimeline.test.ts` | 阶段进度、超时、重复事件、打断和旧回调失效 | L1 |
| `useCameraFocus.test.ts` | 时间轴接管连续性、镜头距离、抬升与 FOV 恢复 | L1 |
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
