# Act 4 转场与 Act 5 恒星系统结构图

Act 3 展示公转轨道与可聚焦导航；Act 4 将镜头拉近同一颗中央恒星，再将恒星连续转换为左侧日面边缘构图，三颗行星依次从右侧入场；Act 5 保持完成后的系统结构。原 Act 4 结构图现编号为 Act 5。尺寸与间距为展示比例，不对应真实太阳系尺度。

## 进入与返回

- Act 1 点击快进仍以 Act 3 为落点，原有 2 秒时长不变。
- 在 Act 3 继续向下滚动，或点击“继续向下 · 系统结构”，经 Act 4 进入 Act 5。
- 结构图入口与返回按钮以 6.8 秒 GSAP 页面补间播放；滚轮可中断，停止后继续由当前页面位置采样。不是独立的定时播放。
- 向上滚动按同一条路径回退：行星按相反顺序离场，日面恢复为完整恒星，再拉远回到轨道图。
- 结构转场开始后停用行星及飞行器点击、`voyager` 聚焦命令；若通过原生滚动离开聚焦场景，`Planets` 发出 `exit / scene`，沿用原退出时间轴。
- 主页终端输入 `debug` 可打开 Runtime，“页面时间轴”滑块可直接定位转场；拖动会终止快进并清除惯性，不修改场景计时和种子。

## 滚动坐标

边界在 [types/index.ts](../src/types/index.ts) 的 `PAGE_FLOW`，宏观阶段由 [composition/timeline.ts](../src/composition/timeline.ts) 声明，映射在 [usePageFlow.ts](../src/behaviors/usePageFlow.ts)。

| 字段 / 阶段 | 范围 | 含义 |
|---|---|---|
| `pageProgress` | 0–1.50 | 滚轮、原生滚动条、按钮及调试滑块的统一坐标 |
| `scrollProgress` | 0–1 | 原 Act 1–3 进度，保持既有阈值 |
| Act 4 / `act4StellarTransition` | 1.02–1.42 | 拉近、日面重构图及行星入场 |
| Act 5 / `act5SystemStructure` | 1.42–1.50 | 完成后的恒星系统结构 |
| `structureProgress` | 0–1 | Act 4 的局部进度，Act 5 时保持 1 |

令整页位置为 $p$：

$$
s=\min(1,p),\qquad
u=\operatorname{clamp}\!\left(\frac{p-1.02}{1.42-1.02},0,1\right).
$$

`setPageProgress()` 一次更新三个字段。$p=1$ 仍是原快进落点；原三幕滚动距离保留为 24 倍视口高度，整页可滚动距离为 $24\times1.50=36$ 倍视口，body 高度为 37 倍视口。原生 ScrollTrigger 进度乘 `PAGE_FLOW.end`，同步滚动条时做逆变换；窗口变化保留页面坐标。

## Act 4 转场时间轴

[Act4StellarTransition.tsx](../src/acts/Act4StellarTransition.tsx) 是常驻播放层，没有自己的模型。它以 `useFrame` 优先级 -30 采样 [stellarTransition.ts](../src/behaviors/stellarTransition.ts)，更新 Canvas 独占的 [StellarTransitionContext](../src/r3f/StellarTransitionContext.tsx)，早于 `Planets(-20)` 和相机、恒星更新。已有 ScrollTrigger、GSAP 按钮补间与惯性控制页面位置；没有新增 ticker、定时器或逐帧 React 状态。

| 局部进度 $u$ | 动作 |
|---|---|
| 0–0.24 | 原轨道、三颗轨道行星、碎片和 Voyager 淡出；之后关闭相机 layer 0 |
| 0–0.42 | 相机朝原中央恒星拉近，星体保持原中心与半径；放大到约占视口短边 56% |
| 0.06–0.42 | 同一资产渐变到日面特写材质、低频呼吸和收敛柔光 |
| 0.42–0.78 | 以恒星半径归一化的共同变换将星体移至左侧，形成日面边缘 |
| 0.70、0.77、0.84 起 | FS、Code、GitHub 从右侧依次入场，每颗占 0.16 进度 |
| 0.78–0.94 | 日面活动与背景微光渐显，可见后才推进活动时钟 |
| 0.92–1 | 结构图标题与说明渐显，进度 1 进入 Act 5 |

每个普通阶段使用 $E(v)=3v^2-2v^3$，其中 $v$ 是对应区间归一化并截断后的进度。所有通道均为绝对进度的函数；跳转、暂停和反向滚动不会重复创建或积累动画。日珥、卫星、自转及既有轨道仍使用场景时间，反向滚动只反转构图，不倒放物理活动。

### 拉近与日面重构图

为了避免线性世界位移将视觉放大挤到末段，拉近按距离的几何插值重映射。设当前原镜头为 $\mathbf C_0$，近景目标为 $\mathbf C_1$，到目标注视点的距离比为 $r=d_1/d_0$，则：

$$
\alpha(q)=\frac{1-r^q}{1-r},\qquad
\mathbf C=(1-\alpha)\mathbf C_0+\alpha\mathbf C_1.
$$

$q$ 是缓动后的拉近进度；$r\to1$ 时取 $\alpha=q$。沿同一直线时 $d=d_0^{1-q}d_1^q$；注视点和 FOV 同时平滑转向中央恒星，原聚焦镜头继续由同一控制器处理。

设原核心半径 $R_0=0.42$、最终日面半径 $R_1$，$S_1=R_1/R_0$，$h$ 为重构图进度，$d_c$ 为近景距离，$D=24$。共同变换为：

$$
\begin{aligned}
S(h)&=S_1^h,\\
d(h)&=S(h)\left[(1-h)d_c+hD/S_1\right],\\
x_\star(h)&=hS(h)x_1/S_1,\\
\mathbf C(h)&=\left(0,-1+(-24+1)h,(-16+d_c)(1-h)+8h\right),\\
\mathbf P_\star(h)&=\left(x_\star(h),C_y(h),C_z(h)-d(h)\right).
\end{aligned}
$$

镜头注视 $(0,P_{\star,y},P_{\star,z})$，恒星整体缩放为 $S(h)$。近景距离按短边适配：

$$
d_c=\frac{R_0}{\sin\!\left[\arctan\!\left(0.56\min(1,a)\tan20^\circ\right)\right]}.
$$

这里 $a$ 为宽高比。$h=0$ 与原恒星近景完全一致，$h=1$ 恢复既有结构图参数。镜头始终留在核心球外；这是示意构图的相似变换，不代表恒星物理膨胀。日面活动组按 $S/S_1$ 和同一球心变换，避免挂在另一个静止日面上。

### 行星弹簧入场

三颗行星使用独立实例，从保留附件余量的屏幕右侧进入，顺序与轨道由内向外一致。归一化时间 $t$ 的弹簧响应为：

$$
\begin{aligned}
\omega&=9,\quad\zeta=0.82,\quad v_0=4,\quad\omega_d=\omega\sqrt{1-\zeta^2},\\
A(t)&=e^{-\zeta\omega t}\!\left[\cos(\omega_dt)+\frac{\zeta\omega-v_0}{\omega_d}\sin(\omega_dt)\right],\\
P(t)&=1-A(t)\left[1-E\!\left(\operatorname{clamp}\frac{t-0.8}{0.2}\right)\right],\\
x_i(t)&=x_{i,\mathrm{target}}+(x_{i,\mathrm{right}}-x_{i,\mathrm{target}})(1-P(t)).
\end{aligned}
$$

该响应有较高初速、小幅越位和精确的静止终点。末段修正消除残余偏差与速度；不逐帧积分，因此快滚、跳转和回退可复现。行星尺寸、浅阴影、卫星公转及环面进动保留，说明标签待构图稳定再出现。

## 布局与单相机渲染

[Act5SystemStructure.tsx](../src/acts/Act5SystemStructure.tsx) 常驻同一 Canvas，拥有三种行星与日面活动；恒星由根层级 [CentralStar.tsx](../src/actors/CentralStar.tsx) 独占，同一个节点从 Act 3 延续到 Act 5。

最终相机位于 $(0,-24,8)$，面向 $(0,-24,-16)$，垂直视场角为 $\varphi=40^\circ$。令宽高比为 $a_{\mathrm{aspect}}$，相机到结构平面的距离为 $d=24$，则可视尺寸与行星横坐标为：

$$
\begin{aligned}
H&=2d\tan\!\left(\frac{\varphi}{2}\right),\\
W&=H a_{\mathrm{aspect}},\\
x_i&=(f_i-0.5)W,\qquad(f_0,f_1,f_2)=(0.40,0.58,0.76).
\end{aligned}
$$

$f_i$ 为行星中心的水平屏幕比例，模型和 DOM 共用这组比例。相邻中心间距为初版的 75%，以中间行星为基准对称收紧；半径为初版的 50%，仍受视口宽、高共同限制，为卫星公转与最外行星环保留间距。恒星核心的半径、边缘射线斜率及球心横坐标为：

$$
R=0.9H,\qquad k=-\frac{0.395W}{d},\qquad
x_{\mathrm{star}}=kd-R\sqrt{1+k^2}.
$$

球心位于左屏外，使透视投影下的核心右侧轮廓位于视口宽度的 10.5%。资产整体缩放为 $R/R_{\mathrm{core}}$，其中 $R_{\mathrm{core}}$ 对应源码常量 `CENTRAL_STAR_CORE_RADIUS`。页面不再显示恒星名称、日面标签或底部脚注；非等比例的说明保留在本文。

相机继续只由 [useCameraFocus.ts](../src/behaviors/useCameraFocus.ts) 写入，`Act3ContentPhase` 隐藏时仍更新相机。转场调用共享姿态采样器，原行星、飞行器聚焦算法和事件时间轴保留。

结构图对象使用 layer 1，原轨道场景使用 layer 0；共享恒星的每个 Mesh / Sprite 同时属于两层。转场初段启用两层，原轨道对象淡出完成后仅启用 layer 1；返回时按进度恢复。共享恒星只渲染一次，没有重叠核心、模型切换或帧缓冲交叉淡化。灯光仍在 Canvas 根层级，结构图主光色沿用 `STAR_FAR_LIGHT_COLOR`。

沿用同一渲染器、同一相机与 `flat`、`frameloop="demand"`。滚动通过 `ScrollInvalidator` 唤醒，行星与可见日面活动继续请求帧。图层只控制绘制、不暂停对象状态；对象显隐也不释放资源。依据：[Three.js Layers](https://threejs.org/docs/pages/Layers.html) 的共享图层可见性规则，以及 [R3F useFrame](https://r3f.docs.pmnd.rs/api/hooks#useframe) 的帧优先级机制。

## 资产与生命周期

恒星完整复用 [centralStar.ts](../src/actors/assets/centralStar.ts) 的 `createCentralStarAsset()`，与 Act 3、Studio 同源；保留球形核心、内层光晕、近远场柔光及 `updateGlow()` 呼吸动画。主页面现在由 `CentralStar` 独占同一资产，使用 `segments: 128` 适配连续特写，Studio 的默认工厂仍使用 32。转场结束时将内层光晕缩放乘 0.7、近场柔光乘 0.25、远场柔光乘 0.18，并将内层光晕最大半径限制为右侧轮廓位于视口宽度 28% 的球面半径，以避免整个呼吸周期中遮住首颗行星；特写的颜色、透明度与低频呼吸由下述适配器控制，默认工厂行为不变。原独立日面圆盘实现已移除。具体节点的深度和透明度配置沿用共用工厂。

### 日面特写材质与柔光

[stellarCloseup.ts](../src/actors/assets/stellarCloseup.ts) 支持同一主页面资产从 Act 3 向 Act 5 过渡，Studio 默认配置不变。`update(time, blend, intensity)` 以 blend=0 精确恢复轨道视图外观，以 blend=1 应用下述特写；默认 blend=1 兼容独立特写测试。恒星仍只有一个核心球体；原先的双色内核来自光晕叠加，尤其是面向相机的 Sprite 平面穿过偏轴球体，在部分日面上形成了额外加色边界。

核心保留 `MeshBasicMaterial` 的自发光外观。令 $\mathbf N$ 为单位表面法线、$\mathbf V$ 为单位观察方向，通过颜色插值增加连续的边缘渐暗：

$$
\begin{aligned}
\mu&=\max(0,\mathbf N\cdot\mathbf V),\\
\mathbf C&=(1-\mu^{0.45})\mathbf C_{\mathrm{rim}}
+\mu^{0.45}\mathbf C_{\mathrm{core}}.
\end{aligned}
$$

核心色为 `#ffe4b0`，轮廓色为 `#edab58`。这是表现球面体积的表面明暗近似，没有新增第二个核心或体积光散射通道。

内层光晕与两层 Sprite 统一按视线到核心球心的最短距离建立轮廓遮罩。相机空间中球心为 $\mathbf c$、单位视线为 $\mathbf r$、核心半径为 $R$，定义归一化轮廓外距离 $e$ 和轮廓外的衰减因子 $f_{\mathrm{halo}}$：

$$
e=\frac{\lVert\mathbf c\times\mathbf r\rVert}{R}-1,\qquad
f_{\mathrm{halo}}(e)=\exp\!\left[-\frac{\max(e,0)}{w}\right].
$$

核心内侧不叠加光效，边界以 `fwidth(e)` 做像素级平滑；轮廓外按 $f_{\mathrm{halo}}$ 衰减。内层、近场、远场的衰减宽度 $w$ 分别为 0.045、0.075、0.20。Sprite 仍复用工厂节点，但特写改用距轮廓的程序化渐变，替代原来按球心衰减的贴图采样，避免裁切、压缩后日面边缘几乎没有柔光。

共享动画以 $t'=0.15t$ 供时，因此呼吸频率为原来的 15%，周期变为约 6.67 倍；不会改变卫星或其他场景时钟。基准不透明度为内层 0.15、近场 0.20、远场 0.20，对应透明度 85%、80%、80%。亮度随原来的双频脉动因子变化；近场与远场透明度相同，内层比两层柔光更透明。保留 28% 视口的内层扩张上限。

适配器使用 Three.js 的 `onBeforeCompile` 和独立 `customProgramCacheKey` 扩展当前 WebGL 材质；相机空间 uniform 在各光效节点的 `onBeforeRender` 更新，适配滚动运镜与窗口变化。无新纹理、几何体或渲染循环；材质依旧由恒星工厂释放。依据：[Material.onBeforeCompile](https://threejs.org/docs/pages/Material.html#onBeforeCompile)、[customProgramCacheKey](https://threejs.org/docs/pages/Material.html#customProgramCacheKey)。

### 日面背景逸散微光

[stellarRadiation.ts](../src/actors/assets/stellarRadiation.ts) 提供艺术化的辐射感：72 个稀疏微光点沿日面边缘缓慢向外漂移，单次生命周期为 10–18 秒，淡入后逐渐消失。主色为暖白，少量冷白光点交错；这是示意图的视觉效果，不是霍金辐射物理模拟。

粒子起点由透视球体在各高度的切线求得，向外漂移不超过视口宽度的 7.7%，与第一颗行星保持距离。粒子放在核心平面后方 $1.6R$，根据深度补偿投影尺寸；核心正常写入深度，背景光点不会穿过日面。点云使用 `renderOrder=0`、`transparent=true`、`depthWrite=false`、`depthTest=true`，对象仍位于 Act 5 的 layer 1。

使用单个 `Points + ShaderMaterial` 绘制，72 组确定性种子只分配一次，动画在顶点 shader 中计算。沿用 Act 5 的时钟和 `invalidate()`；每帧只更新时间与像素密度 uniform，不新增计时器或 CPU 粒子对象。关闭该点云的 CPU 视锥裁剪，因为种子位置不是实际 shader 位置；Act 的组可见性仍有效。点云几何体和材质由 Act 5 统一释放。实现依据：[Three.js Points](https://threejs.org/docs/pages/Points.html)、[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)。

### 随机日珥与日冕物质抛射

普通生成/消退、末期局部重组与 CME 喷发的完整过程见[三条演化路径](stellar-plasma-model.md#先读三条演化路径)。共享事件播放头不表示环系同步，也不表示每次普通重组都会触发 CME。

[stellarActivity.ts](../src/actors/assets/stellarActivity.ts) 在当前恒星旁添加两组日珥和一组间歇 CME。日珥从孤立、单侧伴随、大小交错、嵌套、低矮环簇和双侧伴随六类中抽选，避免连续及同时选择相同主类型；各类内部继续改变环系数量、足点与拱顶。嵌套拱廊和低矮环簇必须在同一事件内伴随另一种类型，不能单独生成；二者可相互伴随，共用事件播放头和主体流线预算，各环系具有独立时序。可在[磁拱环 HTML 图鉴](actors/stellar-morphology-explainer.html)通过不同种子观察组合。磁拱环足点锚定并具有纵深；局部质量负载驱动形变，截面随场强变化，每个活动区共用 96 个沿场运动的等离子体团块。CME 上升闭合支在重联后逐段转为最多 192 个候选示踪颗粒（弧长布点、磁丝错位，底部按高度减少生成，与磁拱环同色系）和 96 个稀薄雾片，继承运动后向外逸散，多数颗粒在各自释放后约 0.7 秒内淡出，留下按原背景面积预算翻倍的 4–16 个光点，从释放开始存活 300 秒，逐渐向右扩散至页面；薄雾继续扩散，下方足点拱廊保留。可在 [CME HTML 实验](actors/cme-dissolution-explainer.html)慢放、拖动时间或切换原始磁结构。CME 高度由环形失稳方程积分得到，呈现较密核心、稀薄前缘、电流片与重联后拱廊；抛射团块使用亮金色 `#ffd34d`，与原来的暖白/冷白逸散圆点区分。

物理依据、力学及冷却公式、数值求解与近似边界见[日面等离子体模型](stellar-plasma-model.md)。当前是有物理依据的降阶实时模拟，未求解完整三维 MHD；磁通绳构型、重联结构与前缘仍有现象学近似。亮金色、时间压缩和尺寸比例为展示设定。

#### 位置分布

几何与概率函数位于 [behaviors/stellarActivity.ts](../src/behaviors/stellarActivity.ts)。活动位置沿最终结构相机看向恒星的真实球面切圆取样。设相机为 $\mathbf O$、球心为 $\mathbf C$、球半径为 $R$，则相机距离 $D$、切圆圆心 $\mathbf K$、切圆半径 $r$ 和取样位置为：

$$
\begin{aligned}
D&=\lVert\mathbf C-\mathbf O\rVert,\\
\mathbf K&=\mathbf O+\left(1-\frac{R^2}{D^2}\right)(\mathbf C-\mathbf O),\\
r&=R\sqrt{1-\frac{R^2}{D^2}},\\
\mathbf P(\theta)&=\mathbf K+r\left(\mathbf e_1\cos\theta+\mathbf e_2\sin\theta\right).
\end{aligned}
$$

$\mathbf e_1$ 朝向屏幕右侧轮廓，$\mathbf e_2$ 为竖直方向。两端受视口高度的 ±43% 和左侧 −48.5% 宽度约束，保留边缘余量；二分求出对称角限 $\theta_{\max}$。令 $x=\theta/\theta_{\max}\in[-1,1]$，它等价于这段切圆的归一化弧长，$x=0$ 对应水平中线。布局随窗口尺寸更新，已经发生的事件保留其归一化位置。

**日珥形成位置均匀分布**：$p_{\mathrm{prominence}}(x)=\tfrac12$。上下两侧不设固定发生点，也不因靠近中线降低日珥概率。

**仅抛射事件使用中线抑制分布**。过渡宽度为 $a=0.45$，用归一化过渡坐标 $u_x$ 定义平滑概率密度：

$$
\begin{aligned}
u_x&=\min\!\left(\frac{|x|}{a},1\right),\qquad S(u)=3u^2-2u^3,\\
p_{\mathrm{CME}}(x)&=\frac14+\frac{S(u_x)}{2(2-a)},\qquad -1\le x\le1,\\
\int_{-1}^{1}p_{\mathrm{CME}}(x)\,\mathrm{d}x&=1,\\
p_{\mathrm{average}}&=\frac12,\\
p_{\mathrm{CME}}(0)&=\frac14=\frac12p_{\mathrm{average}}.
\end{aligned}
$$

这里的“中线概率”指单位弧长的事件概率密度；连续分布在一个精确点上的概率均为零。$|x|\ge a$ 后密度保持约 0.57258，约为平均值的 1.145 倍，补偿中央减少的事件数量；中线与过渡边界的一阶导数连续。此分布并非将中线权重简单乘 0.5 后再任意归一化。通过解析 CDF 的二分逆变换抽样；事件间隔和大小独立随机，不采用改变分布的避让或固定上下分区规则。

#### 活动区朝向、尺寸与球面贴合

普通日珥的摆放参数由 [stellarPlacement.ts](../src/behaviors/stellarPlacement.ts) 根据事件种子生成。以局部日面法线为旋转轴，整个活动区相对原来的切圆切向随机偏转；主环、伴随环、重组短环和沿场团块共用这个坐标系。它与 CME 收颈时随高度变化的拱顶旋扭是两个独立过程。

令 $U_a,U_d,U_1,U_2$ 为同一种子经过不同盐值散列得到的 $[0,1)$ 样本。方位角 $\alpha$ 保持原有分布；尺寸按实际生成的环系选择截断高斯参数。令 $C$ 表示至少一个环系的 `sourceKind` 为 `cluster`：

$$
(\mu,\sigma,a,b)=
\begin{cases}
(0.95,\ 0.10/3,\ 0.85,\ 1.05),&C,\\
(1.15,\ 0.10,\ 0.85,\ 1.45),&\neg C.
\end{cases}
$$

两套范围均对应中心的 $\pm3\sigma$，采样公式为：

$$
\begin{aligned}
\alpha&=\begin{cases}-1,&U_d<\tfrac12,\\+1,&U_d\ge\tfrac12\end{cases}\;\frac{\pi}{4}U_a,\\
Z&=\sqrt{-2\ln(1-U_1)}\cos(2\pi U_2),\\
S_*&=\mu+\sigma Z,\qquad S=S_*\ \text{当}\ a\le S_*\le b,\\
f_S(s)&=\frac{\phi\!\left((s-\mu)/\sigma\right)}{\sigma\,[\Phi(3)-\Phi(-3)]}\,
\mathbf1_{[a,b]}(s).
\end{aligned}
$$

$\phi$ 和 $\Phi$ 分别是标准正态的概率密度与累积分布函数。Box–Muller 生成的候选 $S_*$ 若越界，使用同一种子的新盐值重抽，直至落入范围；不把越界值直接钳在上下界。

| 活动区的实际组成 | 中心 / 概率峰值 | 标准差参数 | 截断范围 | 源码参数 |
|---|---|---|---|---|
| 包含低矮环簇，含它作为主类型或伴随类型的组合 | 95% | 约 3.33 个百分点 | 85%–105% | `PROMINENCE_CLUSTER_SCALE` |
| 其他组合 | 115% | 10 个百分点 | 85%–145% | `PROMINENCE_PLACEMENT` |

含低簇时**整组活动区**共用较小的尺寸倍率，覆盖“低矮环簇伴随其他类型”以及“嵌套拱廊伴随低矮环簇”等情况，不分别缩放同组内部的两种构型；低簇与伴随磁拱的原有宽高比例、相互位置和球面贴合仍保留。判定读取已生成模型的 `families`，首次创建与换事件时更新；不因普通主环在退场阶段重组为短环而临时切换分布。两套分布共用种子采样机制和原有方位参数，保持可复现性。低簇组合截断后的实际标准差约为 3.29 个百分点；其他组合约为 9.87 个百分点，约 68.5% 的样本落在 105%–125%，约 95.7% 落在 95%–135%。

方位幅度覆盖 0°–45°，正反方向等概率。尺寸是活动区相对基准尺度的倍率，不统一各类型内部的宽高比例。原有第二通道的 0.58 倍比例继续保留，因此它仍承担较小活动区的角色。事件存续期间不重新抽样；窗口改变只重新计算视口基准和球面坐标，同一种子始终复现相同摆放参数。该分布用于构图实验，不代表真实日珥尺寸的观测分布。

设原日面切向、法线为单位向量 $\mathbf t,\mathbf n$，旋转后的切向和副切向为：

$$
\mathbf t'=\cos\alpha\,\mathbf t+\sin\alpha\,(\mathbf n\times\mathbf t),\qquad
\mathbf b'=\mathbf t'\times\mathbf n.
$$

对于活动区局部点 $\mathbf p=(x,y,z)$，令 $q$ 为包含视口基准、通道比例、$S$ 和透视补偿的最终尺度。先统一缩放和旋转，再以两个切向分量共同计算球面落差：

$$
\begin{aligned}
\rho^2&=q^2(x^2+z^2),\qquad \rho<R,\\
d&=R-\sqrt{R^2-\rho^2}
  =\frac{\rho^2}{R+\sqrt{R^2-\rho^2}},\\
\mathbf P&=\mathbf A+q(x\mathbf t'+y\mathbf n+z\mathbf b')-(d+0.014q)\mathbf n.
\end{aligned}
$$

$\mathbf A$ 是球面上的活动区锚点，$R$ 是恒星半径；等价的分式形式避免小落差相减损失精度。忽略轻微嵌入项时，$y=0$ 的足点落在球面上；$0.014q$ 让端部继续轻微嵌入日面。着色器的线带展宽和团块方向使用该映射的导数，使方向与弯曲后的路径一致。这里要求活动区的切向范围小于恒星半径；根号下的数值保护不是越过这一范围后的物理解。

CME 保留原有摆放与曲率近似。图鉴的 `layoutLocal()` 保持单位尺度和局部切平面，便于同种子比较内部构型；本节随机摆放在主页 Act 5 观察。局部几何约束与最终球面映射的适用边界见[几何约束总览](stellar-plasma-model.md#几何约束总览)。

#### 事件与动画生命周期

`createStellarActivityTimeline()` 接收 `prominence / cme` 事件。日珥占用两个固定通道，各自生长、定形、维持和回缩，30–38 秒后在新位置形成；初次进入已有两个不同年龄、不同构型的日珥。普通环系按种子错峰形成，几何消退各持续 12–15.6 秒，生长期完整丝线由内向外换代，稳定时保留最后一代并继续形变与沿场流动，消退时回收外层并补入新内层，末段停止补入；各代沿自身方向绘入和擦除，显著长于 CME 下方拱廊约 4.4 秒的主要回缩。生命周期由事件年龄与寿命驱动，共享模型负责固定步形变与沿场物质运动；部分大环在后期与预存弱背景连接局部重组，区域固定而配对改变，短环先预生长到局部外肩，再用 0.65 秒按层次沿弧长交接，中央过渡环以约一半可见丝线承接原拱顶，两侧维持完整数量；中央以每条间隔 0.12 秒由外向内回落并沿线擦除；三支经过共享空间走廊约束，避免中央与邻接短环穿插，完成后不保留旧长连接；左右短环采用各自的种子时序与柔性耦合响应，高度变化驱动两肩鼓胀与迟滞偏斜，整束错峰回落，完整退场目标间隔按种子从中心 1 秒、范围 0.45–1.55 秒的截断高斯分布取样，事件尾部不足时收紧；每侧 3–5 次不规则上下脉冲改变回弹节奏，中央保持较弱的原有响应。每隔 0.18 秒的逐条时序只负责沿线擦除，其起点跟随各侧回落；完整公式、物理边界和[HTML 实验](actors/stellar-morphology-explainer.html)说明见[非对称生命周期](stellar-plasma-model.md#足点锚定的非对称生命周期)。结构权重和去重规则见[构型说明](stellar-plasma-model.md#大小环系可变拱顶与局部截面)。CME 首次在可见场景时间 3 秒后开始，随后每隔 18–30 秒发生一次，只有一个主抛射通道：

| 时间轴阶段 | 时间 | 行为 |
|---|---|---|
| `cme:charge` | 0–2.5 秒 | 足点锚定的低矮拱体抬升，同时淡入；形成驱动参与决定拱顶 |
| `cme:observe` | 2.5–8 秒 | 显示失稳演化，径向方程决定抬升速度，前缘与重联结构随膨胀出现 |
| `cme:fade` | 8–13 秒 | 磁结构与薄雾逐渐淡出；已交接尾迹独立续存 |
| `cme:next` | 18–30 秒 | 自动派发下一次随机位置事件 |

沿用现有聚焦模块的 `paused: true` GSAP Timeline，由 Act 5 的 `useFrame` 通过 `totalTime()` 推进。每帧间隔限制在 0–0.1 秒，隐藏 Act 或转场返回至日面活动尚不可见的阶段时不推进；重返继续当前阶段。没有新增 `setTimeout`、独立 RAF、全局 ticker 或逐帧 React/Zustand 状态更新。旧通道在新事件接管时 `kill()`，控制器在 effect 清理中释放，避免无限累积子时间轴。控制器同时推进连续场景时间；尾迹以此保存各自的释放与交接时刻，不跟随单次 CME 播放头复位，最后 60 秒淡出。固定容量的尾迹池与扩散公式见 [300 秒尾迹](stellar-plasma-model.md#300-秒尾迹与跨事件留存)。

活动区的基准尺度受视口宽、高共同限制，并按切点深度补偿透视大小；中线仍允许抛射。弧丝端部轻微嵌入日面，保留核心的自然深度遮挡。三个磁通绳弧丝 Mesh、六个普通日珥短环 Mesh（含两个中央过渡支）、三个团块 Mesh 和前缘、电流片、重联拱廊及上升支以及逸散颗粒、薄雾和持久尾迹共十九个对象显式设置 layer 1、`transparent=true`、`depthWrite=false`、`depthTest=true`。团块、逸散颗粒与持久尾迹 `renderOrder=3`，薄雾及其余对象为 2；双面材质使用单次绘制。Shader 动态定位的几何体关闭 CPU 视锥裁剪，组的显隐仍有效。九个几何体、十九个材质、三张路径纹理及两张重绘纹理均由 Act 5 实例释放。磁结构与团块按固定步长在 CPU 积分，共享路径表通过浮点纹理上传；其余结构由 uniform 驱动 Shader，不逐帧重建几何体。普通日珥的团块读取与丝线相同的局部重绘可见度；CME 各流线依次改变连接关系，团块同步转入新分支，详见[连续重联过程](stellar-plasma-model.md#连接改变的连续过程)。旧恒星与微光资源保持原所有权。

实现依据：[GSAP Timeline](https://gsap.com/docs/v3/GSAP/Timeline/)、[Three.js ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)、[R3F 按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance#on-demand-rendering)。

### 带环行星自转与环面进动

Act 5 使用共用带环资产的 `updateSpin()`，与 Act 3 沿用同一 R3F 场景时钟和 `PLANET_ORBIT_SPEEDS[2]`。Act 5 通过独立参数将自转周期设为正常公转周期的 0.7 倍，当前约 62.83 秒；Act 3 使用 1.4 倍周期（约 125.66 秒）；固定排列不表示停止自转。自转轴、速度基准与资源约束见[主页资产对应](../src/actors/README.md#主页轨道与资产对应)。

Act 5 调用 `updateSpin(..., true)` 开启环面进动，Act 3 与 Studio 默认关闭。核心保持原轴向自转；四层环在轴向旋转之后，共同绕资产局部 Y 轴旋转。环面法线与该轴的夹角保持 26.7°，方位持续改变，所以屏幕上能看到椭圆展开、收窄，以及前后遮挡和明暗变化。进动与 Act 5 自转共用约 62.83 秒的周期。

令 $t$ 为场景时间、$\omega_{\mathrm{orbit}}$ 为正常公转角速度，环面与核心的四元数旋转组合为：

$$
\begin{aligned}
\theta(t)&=\frac{t\,\omega_{\mathrm{orbit}}}{0.7},\\
Q_{\mathrm{ring}}&=Q_y(\theta)Q_{\mathrm{axis}}(\theta),\\
Q_{\mathrm{core}}&=Q_{\mathrm{axis}}(\theta)Q_{\mathrm{tilt}}.
\end{aligned}
$$

四层环使用相同四元数，保持层间间隙、半径和中心；不旋转资产根节点，不改变排布。每帧由绝对时间重新计算，避免累积误差；使用预分配四元数，沿用原渲染请求。

### 其他资产与渲染请求

- 复用 [planet.ts](../src/actors/assets/planet.ts)、[satellitePlanet.ts](../src/actors/assets/satellitePlanet.ts)、[ringedPlanet.ts](../src/actors/assets/ringedPlanet.ts)。新实例保持原颜色、卫星轨道及四层行星环透明度，局部倾斜便于阅读。
- 保留 `flat` 和 `frameloop="demand"`。`ScrollInvalidator` 同时响应旧场景与结构进度；结构图可见时 `useFrame` 更新卫星、光晕并 `invalidate()`，无新增定时器。
- Act 5 拥有行星与活动的几何体、材质及行星共用光晕纹理；共享恒星由根层级 `CentralStar` 独占并释放，卸载时统一释放；显隐切换不释放、不重建。Act 3 的轨道与时间轴仍可继续推进，返回后衔接当前时间。

## 验证入口

- [页面映射与取景测试](../src/behaviors/__tests__/usePageFlow.test.ts)：原阈值、快进落点、原子状态、宽窄屏投影、往返镜头和图层。
- [日面物理模型测试](../src/behaviors/__tests__/stellarPlasma.test.ts)：稳定阈值、积分收敛、足点锚定、沿场流动与跨帧率一致性。
- [日面活动行为测试](../src/behaviors/__tests__/stellarActivity.test.ts)：概率归一化、中线密度、平滑过渡、逆采样、事件阶段和宽窄屏球面切点。
- [结构图组件测试](../src/acts/__tests__/Act5SystemStructure.test.tsx)：图层、固定位置、卫星运动、日面活动显隐暂停与资源释放。
- [点击测试](../src/r3f/__tests__/PlanetClickHandler.test.tsx)：结构图中禁用轨道场景点击与飞行器命令。
- 浏览器检查 Act 1 点击、Act 3 聚焦、向下进入、返回、滚轮中断、窗口尺寸改变，以及日夜主题。构建不能代替这些视觉检查。
