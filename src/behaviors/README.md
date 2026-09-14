# behaviors/ — 可复用行为逻辑

## 职责

纯计算函数 + Hook 封装。将 Actor 中的计算逻辑抽取为可测试的独立单元。

## 文件

| 文件 | 类型 | 职责 |
|------|------|------|
| `useMenuNavigation.ts` | Hook | 消费 Menu 请求，以 `exit / menu` 交接当前近景，交给 App 页面补间进入 Act 5；新聚焦中断页面播放，卸载取消订阅 |
| `orbitalOverview.ts` | 纯计算 | 外环扩张后的全景距离与行星显示补偿，聚焦时平滑撤去补偿 |
| `cameraMotionCoordinator.ts` | 控制器 | 每个 Canvas 统一管理聚焦/恒星 Timeline，处理交接、重复事件、反向回退与注册释放 |
| `usePageFlow.ts` | 纯函数 | 整页坐标映射到原三幕、Act 4 转场和 Act 5 保持阶段，边界沿用共享 `PAGE_FLOW` |
| `stellarTransition.ts` | Timeline 工厂 / 几何函数 | Act 4 阶段标签与通道补间、阻尼弹簧 ease、恒星半径归一化的连续相机与模型姿态 |
| `structureLayout.ts` | 纯函数 / 常量 | 结构图视口尺寸、行星排列和与 DOM 共用的比例 |
| `useFrameCache.ts` | Hook | 帧缓存守卫——同帧同参数跳过更新（`shouldSkip` / `shouldSkipSp`）|
| `useCameraFocus.ts` | 函数 | `createCameraFocusController()` 创建场景独占控制器：消费时间轴进度、固定抬高起点、更新相机位置/朝向/FOV；可由调用方传入复合行星的聚焦距离倍率（见 [资产对应](../actors/README.md#主页轨道与资产对应)） |
| `useFocusTimeline.ts` | 有状态函数 | 事件触发 GSAP Timeline，统一编排镜头、调相、轨道淡化、回位与超时 |
| `focusPose.ts` | 函数 | 相机和调相器共用的目标姿态与视野适配 |
| `useVoyagerOrbit.ts` | 纯函数 | 最外层椭圆上的巡航位置、切线与周期参数 |
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

## Act 4 转场与 Act 5 取景

`Act4StellarTransition` 以 -30 优先级采样 `structureProgress`，一次更新 Canvas 的 `StellarTransitionContext`；`Planets(-20)`、恒星、唯一相机控制器和结构图消费同一帧数据。既有 ScrollTrigger、GSAP 按钮补间及滚动物理仍是页面驱动源，没有第二个相机控制器或自主计时器。`stellarTransition.ts` 将拉近、重构图、显隐、三颗行星弹簧入场与标题分为可反向的阶段；先接近原恒星，再共同变换模型与相机，最终匹配 `structureLayout.ts`。原聚焦算法保留，离开 Act 3 时由场景事件退出。公式、阶段区间及恢复约束见[转场说明](../../docs/system-structure.md#act-4-转场时间轴)。

## 日面活动

[stellarShortLoop.ts](stellarShortLoop.ts) 为重组生成的左右短环提供共同弧长约束下的横摆、升降、拱肩与环腿响应。断裂初期左支向左、右支向右拉开，刚度为原始值的 25%，向外激发增益 2.40，作用 0.20–0.28 秒；力度、时刻、周期、两腿迟滞和原有不规则上下脉冲分别由种子生成。高度、展开和横摆共享弧长势能梯度，相对参考弧长的变化限制为 ±20%，不是拱顶位移限制。参考拱顶的坐标映射允许接近外侧足点，保护余量为跨度的 4%；最终还受弧长和邻接分离约束。参数见 `SHORT_LOOP_TRANSVERSE`、`SHORT_LOOP_ARC`。

创建时以 1/120 秒预计算一份耦合响应表，播放按现有事件年龄读取，无额外时钟或 GPU 资源。退场时参考曲线趋近足点弦线，横向与上下形变共同收拢；整束共享主要运动，仅丝线擦除按原有时序排队。两侧完整退场目标间隔采用中心 1 秒、标准差约 0.183 秒、范围 0.45–1.55 秒的截断高斯分布：先退场侧由种子选择，主要回落为 0.50–0.58 秒；另一侧的基础回落为 0.95–1.20 秒。目标较小时收紧慢侧多出的回落预算，保留较晚开始、较慢回落，并让实际完整退场时差匹配目标。`SHORT_LOOP_RETIREMENT` 控制结束间隔，事件尾部不足时减少额外延后量，完整擦除队列保留并在事件结束前预留 0.05 秒。随机上下脉冲保留，中央仍由 [stellarRecoil.ts](stellarRecoil.ts) 提供较弱响应。[stellarReorganization.ts](stellarReorganization.ts) 在实际交接路径和空间走廊之后，调用 [stellarArcConstraint.ts](stellarArcConstraint.ts)，用渲染的 112 段逐条复核弧长，必要时按整束共用系数向参考形态投影，并按年龄缓存结果；`arcDiagnostics()` 给说明页提供最终路径统计。模型是降阶势能反馈加几何保护，不是完整 MHD 或 XPBD。公式、参数与近似边界见[短环振荡](../../docs/stellar-plasma-model.md#重组短环的过冲与阻尼振荡)。

重组三支在最终采样位置应用共享空间走廊约束，限制中央与邻接短环互相穿插；同一磁通区域内保留不同的固定附着点。中央交错保留约一半可见丝线、两侧保持完整数量；保留的中央丝线由外到内每隔 0.12 秒启动回落，每条回落 0.40 秒、沿线擦除 0.40 秒，几何与可见度共用同一个逐层时序。实现与参数见 [stellarReorganization.ts](stellarReorganization.ts)，[公式与约束范围](../../docs/stellar-plasma-model.md#三支共享的空间走廊)。

[stellarLifecycle.ts](stellarLifecycle.ts) 提供生长、动态定形、松弛和回缩的共享包络。普通事件为 30–38 秒，各环系消退持续 12–15.6 秒；CME 残留拱廊的主要回缩约 4.4 秒。`stellarMagnetism` 在形成期积分参考拱顶与形变模态，保留形成历史；`stellarPlasma` 相对足点弦线施加几何包络，弧丝与团块共用路径。[stellarReorganization.ts](stellarReorganization.ts) 生成各环系的独立出生/消退时刻，按跨度与种子背景配置决定是否局部换接；磁通区域固定，配对允许改变，保留直接回缩路径。短环先预生长至主环的局部外肩，再按层次沿线交接；中央过渡环承接旧拱顶，先回落并擦除，左右短环随后柔性鼓胀、错峰整体回落并逐条擦除；其他独立环系继续演化。[stellarRedraw.ts](stellarRedraw.ts) 提供完整生命周期出生表、固定容量代际窗口与有向弧长绘制前沿；生长回收内层、补入新外层，稳定暂停，消退回收外层、补入更低的新内层，末段停止补入并清空，重组场由 `stellarReorganization` 提供；`stellarPlasma` 把可见度写入与路径同坐标的纹理数据，团块共享可见度，槽位换代时仅在不可见瞬间重置代表性样本。事件时间轴仅提供年龄和寿命；文档 seek 以相同固定步重放，未新增独立时钟。磁能释放后也可能出现收缩振荡，较强阻尼与这组时间比例是展示选择，详见[非对称生命周期](../../docs/stellar-plasma-model.md#足点锚定的非对称生命周期)。

[stellarParticleDensity.ts](stellarParticleDensity.ts) 共享背景微光的数量/范围与 CME 缩放标尺，用局部面积估算尾迹预算，当前取原预算的两倍（4–16 个）；[stellarEjection.ts](stellarEjection.ts) 固定尾迹选择及释放后错峰淡出，保持同一种子可重放。[stellarTail.ts](stellarTail.ts) 提供 300 秒解析漂移、末段淡出和固定容量池；由活动时间轴的连续场景时间驱动，保留跨事件尾迹，返回转场活动通道为零的阶段后暂停。

[stellarMist.ts](stellarMist.ts) 从 CME 原外流样本构建自适应雾核：按邻点间距扩张、沿局部速度拉长，并补偿密集重叠；不移动或收拢粒子。参数与覆盖验证见[薄雾模型](../../docs/stellar-plasma-model.md#跟随粒子扩散的连续雾场)。

[stellarActivity.ts](stellarActivity.ts) 提供 Act 4 / Act 5 的事件时间轴与 CME 中线密度为平均值一半的平滑分布。[stellarLimb.ts](stellarLimb.ts) 提供当前相机的轮廓切圆、出生环周相位和像素细节门控。活动只生成在轮廓环带，不分布到正面球面；较小通道覆盖全环，主通道部分覆盖全环，其余日珥偏向最终可见弧段。[stellarCmeDistribution.ts](stellarCmeDistribution.ts) 为 CME 提供全环概率密度及逆 CDF，保留可见弧段偏好，左右半环概率为 32.5% / 67.5%，两侧水平中线密度为全环平均的一半。事件层只保存均匀随机分位数，资产按出生布局映射一次，之后保留相位。首次预热年龄为日珥 4 / 9 秒、CME 2.5 秒；跨 Act 不重启。沿用聚焦模块的暂停 GSAP Timeline、R3F `delta` 推进及释放方式，不共享聚焦会话状态。[stellarPlasma.ts](stellarPlasma.ts) 提供环形失稳的 RK4 积分、大小环系、沿场物质输运和 CPU/GPU 共享路径表；[stellarMagnetism.ts](stellarMagnetism.ts) 提供拱顶形状、受迫形变模态、可变截面与连续重联映射；物理依据及近似边界见[降阶模型](../../docs/stellar-plasma-model.md)。[stellarMorphology.ts](stellarMorphology.ts) 负责六类日珥构型、权重抽样、足点布局和固定流线预算；事件层排除上次及另一通道的主类型。嵌套拱廊与低矮环簇由生成器绑定另一种类型，最多 6 个环系、12 条流线；返回 `companion` 与各环系的 `sourceKind`，共享事件播放头，但各环系错峰演化，每种组成保留一个支撑环维持伴随关系。可在[种子图鉴](../../docs/actors/stellar-morphology-explainer.html)重放组合。[stellarEjection.ts](stellarEjection.ts) 由原固定步驱动，在每条流线闭合后按弧长错位布点、按出生高度减少底部可见颗粒，释放后短暂舒展局部拥挤区域；雾共用完整运动样本，复用事件时钟；显示层及实验边界见 [CME 说明页](../../docs/actors/cme-dissolution-explainer.html)。概率、颜色、阶段和资源约束见[日面活动说明](../../docs/system-structure.md#随机日珥与日冕物质抛射)。

[stellarPlacement.ts](stellarPlacement.ts) 根据事件种子和实际 `structure.families` 生成普通活动区的整体方位和尺寸，事件存续期间固定；主环、伴随环和重组短环共用结果。方位绕局部日面法线取样；任一环系的 `sourceKind` 为 `cluster` 时，整组采用中心 95%、范围 85%–105% 的截断高斯分布，参数见 `PROMINENCE_CLUSTER_SCALE`；其他组合仍使用中心 115%、范围 85%–145% 的 `PROMINENCE_PLACEMENT`。两套范围均为 ±3σ；第二通道保留原有较小比例。该模块不改变内部动力学或 CME 旋扭。分布、球面映射及图鉴与主页的差异见[活动区摆放公式](../../docs/system-structure.md#活动区朝向尺寸与球面贴合)。

[stellarRandom.ts](stellarRandom.ts) 共享确定性散列与截断高斯采样；普通活动区尺寸与短环退场间隔分别使用独立盐值，越界换盐重抽。仅在方案创建时取样，相同输入可复现，不在播放中逐帧随机。

## 聚焦会话

业务入口使用 `setFocusedPlanet(idx)` / `focusVoyager()` / `clearFocus(reason)`，在 Zustand 中同时写入当前 UI 状态和新的 `focusEvent` 对象。`Planets` 订阅事件、请求渲染，并在下一帧交给 [useFocusTimeline.ts](useFocusTimeline.ts)。同一帧内多个请求采用最后一个；同目标再次请求也会重建会话。手动退出、时间轴超时、离开内容阶段或目标失效走同一个退出事件。

`Planets` 向 [cameraMotionCoordinator.ts](cameraMotionCoordinator.ts) 注册聚焦 GSAP Timeline；会话被新事件接管时先 `kill()` 旧时间轴，并用会话版本号保护回调。Canvas 内的 [CameraMotionProvider](../r3f/CameraMotionContext.tsx) 统一持有聚焦与恒星转场的可变通道；进度不逐帧写入 Zustand，也不触发场景 React 重渲染。`Act3ContentPhase` 的相机控制器是相机位置、朝向与 FOV 的唯一写入者，轨道计算器是主行星角度的唯一写入者，轨道材质只消费显隐进度。恒星转场同样由真实 GSAP Timeline 编排，其注册、定位、取消与交接规则见[统一运镜管理](../../docs/system-structure.md#统一运镜管理)。

### 时间轴节点

参数集中在 `useFocusTimeline.ts` 的 `FOCUS_TIMING`；超时阈值沿用 `types/index.ts` 的 `SCROLL_RIG.FOCUS_TIMEOUT`。

| 节点 | 起点 | 动作 |
|------|------|------|
| `focus:start` | 0 秒 | 镜头用 1.8 秒靠近，环绕在前 3 秒加速；其他行星用 4 秒完成调相；行星及附件用 1.8 秒缩至 60%；导航轨道用 2.4 秒切换行星弱化 / Voyager 全景显示 |
| `focus:hold` | 4 秒 | 已完成构图，继续缓慢公转与抬升 |
| `focus:timeout` | 30 秒 | 发出 `exit` 事件，原因 `timeout` |
| `exit:start` | 退出事件到达时 | 镜头用 1.8 秒拉远并恢复行星尺寸（Menu 交接另行处理）；行星用 0.7 秒收住当前调相速度；轨道显示用 2.4 秒恢复 |
| `exit:return` | 退出后 0.7 秒 | 三颗行星按各自剩余弧长和限速，沿原公转方向追赶参考位置 |
| `exit:complete` | 所有子动画结束 | 会话进入 `idle`，正常公转继续 |

相机转场使用时间轴的 `power2.inOut` 进度，从接管瞬间的实际姿态插值到实时目标。目标随行星运动持续更新。目标姿态绕“跟随点 → 恒星”轴的起始相位保持 `0.9 rad`，角速度在前 3 秒从 `0.006` 平滑增加到 `0.012 rad/s`，之后保持匀速，入焦结束后继续环绕和抬升。令 `u = min(elapsed / 3, 1)`，加速阶段的速度为 `ω = 0.006 + 0.006(3u² − 2u³)`；相位由该速度解析积分得到，加速结束时速度及加速度连续。30 秒累计轴向转角约 `0.351 rad`（20.1°），轴向相位不等于实际俯角。`elapsed` 仍由同一 GSAP 时间轴驱动，实际镜头和构图预测共用 [focusPose.ts](focusPose.ts) 的 `focusOrbitPhase()`，没有新增时钟或相机写入者。`focusStartTime` 仅记录场景时钟下的会话起点，不再由相机自行判断超时。窗口比例改变会从当前姿态开启新的构图会话和计时。

### 驱动与资源所有权

复用 GSAP 的 Timeline、标签、属性补间和回调编排。时间轴创建为 `paused: true`，由 R3F 每帧通过 `totalTime(next, false)` 推进；这是为主场景提供单一时间源，避免 GSAP ticker 与 R3F 各自推进一次场景状态。终端原有时间轴继续运行，未修改 GSAP 全局时间轴或全局 ticker。

`Act4StellarTransition(-30)` 先通过协调器定位恒星 Timeline；`Planets` 使用优先级 `-20`（`R3F_FRAME_PRIORITY.planetsProduce`）消费事件，通过协调器推进聚焦 Timeline 并更新行星；优先级 `-0.25` 的相机与随后优先级 `0` 的轨道材质消费同一帧进度。负优先级不接管 R3F 自动渲染。事件订阅会 `invalidate()`；行星可见期间持续请求帧，离开场景后仍请求帧直到退出时间轴完成。聚焦帧间隔限制为 0–0.1 秒，标签页挂起后不会单帧跳完整段聚焦；30 秒按实际推进的场景时间计算。恒星 Timeline 使用绝对页面位置，支持直接跳转。卸载时取消订阅并释放对应注册；React StrictMode 重建时建立新 Timeline 实例。

设计依据：[GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)、[播放头 totalTime](https://gsap.com/docs/v3/GSAP/Timeline/totalTime()/)、[kill 与生命周期](https://gsap.com/docs/v3/GSAP/Timeline/kill()/)、[R3F useFrame 与执行顺序](https://r3f.docs.pmnd.rs/api/hooks#useframe)。

聚焦视野在原始垂直 FOV 上增加 8° 余量，再按宽高比保持最低水平视野：`tan(FOV / 2) = tan((baseFov + 8°) / 2) × max(1, 1.35 / aspect)`。默认宽屏由 40° 平滑到 48°；窄屏视野更宽，近景在屏幕上的占比相应减小。退出恢复初始 FOV。初始取景使用 1 / 1.25 / 1.25 距离基准，注视点沿“跟随点 → 恒星”偏移 1.05 场景单位（`FOCUS_LOOK_AHEAD`）。`FOCUS_FOLLOW` 将额外公转角速度差在 3 秒内渐入，累计差角用 `tanh` 平滑限制；同时补偿抬升带来的水平方位变化，使最终相机角速度略慢于行星。位置和注视点均跟随滞后点，主体在画面中缓慢前移，真实观察距离允许轻微变化。镜头与构图预测共用该计算，公式和范围见[聚焦差速跟随](../../docs/asteroid-belt.md#聚焦差速跟随)。

### 飞行器近景

`target=voyager` 使用同一镜头进度、`elapsed` 与 30 秒退出回调，通过 `voyagerFocus` 淡入完整飞行器。它不触发行星三角构图；从行星聚焦切入时，先让已调相的行星在同一时间轴上完成回位。镜头持续跟随天线与主体基座的组合中心，保持基础 FOV，以围绕核心中心、包含所有附件的半径 `r` 决定距离：`d = max(0.7, 2r / sin(min(FOVv, FOVh) / 2))`，其中 `FOVh = 2 atan(aspect × tan(FOVv / 2))`。镜头位于飞行器远离恒星的一侧，入焦过渡平滑转向恒星，入焦完成后始终以恒星中心为注视点。镜头沿屏幕右上 45° 方向偏移，偏侧角为限制半视角的 42%；约一半半视角留给模型。主体因此位于恒星左下，完整包围球与偏侧量仍共同限制在视野内。观察偏侧方位固定，镜头持续跟随公转。核心中心和磁力仪悬杆不再共同决定点击范围，详见 [Voyager 说明](../actors/README.md#voyager-外环巡航)。

飞行器姿态与世界位置在相机之前更新：轨道进动优先级 `-0.75`，飞行器 `-0.5`。飞行器卸载时清理自身可用状态，并通过场景退出事件结束聚焦。

Voyager 的入焦、重复聚焦、普通退出与 Menu 交接均不新建行星调相。`useFocusOrbit.exit()` 只在存在实际行星构图或尚未完成的回位计划时安排回位；自由公转时返回零时长，保留当前相位、正常角速度与悬停减速。自由轨道参考每帧跟随实际角度，避免风铃阶段覆盖位置后留下旧参考差值，将一次普通 Voyager 聚焦误变成追赶运动。从行星聚焦切入 Voyager 时，已有回位仍连续完成。

聚焦后再次点击主体或执行 `menu`，会以 `exit / menu` 结束聚焦计时，设置 `cameraDestination=stellar`。轨道回位仍沿用退出时间轴，但相机保存当前姿态，直接按 Act 4 的 `zoom` 接近恒星；半径几何插值与方位球面插值避免背侧出发时穿星。该快照不受退出时间轴变为 `idle` 影响，到恒星近景完全接管后释放。反向回到 Act 3 或新的聚焦事件会平滑接管；手动空白点击和超时仍使用普通拉远。详见[转场取景公式](../../docs/system-structure.md#拉近与日面重构图)。

### 原轨道调相构图

[useFocusOrbit.ts](useFocusOrbit.ts) 的控制器由 `Planets` 独占。内容阶段三颗主行星的角度只由此控制器推进；风铃阶段由 `Planets` 固定为预设相位；`calcOrbitPosition` 在主行星路径中以 `delta = 0` 消费结果，碎片由独立的小行星带控制器推进，不参与聚焦调相。持续渲染沿用 `Planets` 的 `invalidate()`，不另建动画循环。

1. 进入聚焦、切换目标或宽高比改变时，按 2° 网格搜索另外两颗行星相对聚焦行星的角度。预测未来 0–30 秒、每秒一个时刻的相机投影，包含小幅相位漂移。相邻角间隔小于 180° 并留出漂移余量，使三角形包含恒星；评分优先考虑完整实体包络留在视口内，再考虑恒星左右分布、遮挡与间距；恒星避让权重提高，以保留持续抬升中的主体分离。包络包含完整卫星公转范围、最外环、最大悬停缩放及近景 0.6 倍线性尺寸，半径由资产参数传入。搜索只发生在状态切换时。
2. 聚焦行星在 0.65 秒内将角速度平滑衔接至 `ωc = −0.015 rad/s`，角度通过速度的解析积分得到。其他行星的实时目标为 `θ*i = θf + φi + 0.025 sin(0.12t + 2.1i)`。时间轴给出 4 秒调相进度 `u`，使用 `θi = θ*i + 2πk + E[1 − s(u)] + vrel T u(1 − u)³`；`E` 为接管时最短角差，`s(u) = 10u³ − 15u⁴ + 6u⁵`，`vrel` 是接管瞬间相对目标的速度。末项保留初始速度并在结束时归零，因此中途切换或打断回位时也能连续衔接。全过程只改变轨道相位。
3. 到位后仍保留有界的相位漂移（幅度约 1.43°），角速度略有差异但不会持续拉开构图。相机以略慢的公转角速度追随聚焦行星，与整体缓慢公转保持关联并保留相对位移。切换目标从当前角度和速度衔接。
4. 三颗行星各自维护持续运行的参考相位。聚焦和回位期间，参考相位按 `_baseSpeed` 推进，表示未进行构图调相时此刻应到达的位置；全景自由公转时，参考与实际相位一同响应原悬停减速。切换目标、窗口比例变化和中途重新聚焦均不重置参考相位。
5. 退出时镜头按时间轴进度拉远，行星先用 0.7 秒将退出瞬间的速度平滑衔接到原速度。如果调相尚未完成且正在反向移动，这一阶段先连续制动；其后的快速回位全程使用原公转方向。剩余同向弧长决定回位时长：`T = max(1.6, 1.875D / 2.8)` 秒，`D` 为 0–2π 内的弧长。快速回位的额外角速度不超过 2.8 rad/s，加上镜头衔接阶段，运动总时长约 2.3–4.9 秒；会话会等轨道显示恢复等全部子动画完成后再进入 idle。
6. 回位采用五次缓动 `s(u) = 10u³ − 15u⁴ + 6u⁵`，其中 `u = t / T`。目标相位 `θref` 始终推进，实际角度为 `θ = θref + 2πk − σD[1 − s(u)]`，`σ` 是原公转方向，圈次 `k` 在退出事件发生时依据制动终点预测固定。这样会追上运动中的目标，且起止相对速度和相对加速度都为零；接近目标时不会因模运算再次绕一圈。再次聚焦会取消回位计划，从实际角度和速度继续新构图。轨道半径、平面和附件局部姿态沿用原逻辑；模型尺寸由同一时间轴的 `planetScale` 通道统一控制。

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
| `useCameraFocus.test.ts` | 时间轴接管连续性、加速衔接、入焦后的持续环绕、镜头距离及 FOV 恢复 | L1 |
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

### CME 拱顶旋扭

[cmeRotation.ts](cmeRotation.ts)按种子固定主角度、手性、启动尺度和高度分布，由原径向运动与固定步推进。收颈下方不转，上方绕局部日面法线连续转向；闭合后同向延续少量角度并停止。`stellarPlasma` 的原连接、闭合支、团块与逸散采样共用该变换，普通日珥不参与。旋扭开关只供实验对照，重新模拟到当前时间，不能只旋转显示 Mesh。公式、取值及来源见[拱顶旋扭专题](../../docs/stellar-plasma-model.md#cme-收颈阶段的拱顶旋扭)。

## Act 3 小行星带

[asteroidBelt.ts](asteroidBelt.ts) 提供种子轨道、低偏心椭圆采样、事件控制器和滚动边界适配。`DustField` 发出 `enter` / `focus` / `reset` 事件；控制器的暂停 GSAP Timeline 编排角速度、收拢与入场高亮通道，R3F `delta` 用至多 1/120 秒的子步积分角速度。巡航阶段直接按正常角速度推进，停止采样已结束的时间轴。全周准备、统一加速、错峰收拢、统一减速、亮度回落、前幕后退和 Menu 返回约定见[专题说明](../../docs/asteroid-belt.md)。
