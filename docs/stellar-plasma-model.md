# 日珥与 CME：实时降阶模型

本页说明 Act 4 日面活动的现行算法。当前采用大小交错的磁拱环、可变截面的扭转磁通绳、沿场物质输运及径向失稳动力学。可见弧丝代表沿磁场分布的发光等离子体，磁力线本身不可见。位置分布仍遵守[结构图说明](system-structure.md#位置分布)：日珥均匀随机；CME 水平中线处的概率密度为平均值的 50%。这些概率是构图策略，不是太阳活动的观测统计。

公式使用 Markdown 数学语法：行内公式用 `$...$`，独立公式用 `$$...$$`；阅读时使用支持 LaTeX 数学渲染的 Markdown 预览。粗体表示向量；同一字母在不同小节中的含义由该节定义，代码标识符仍使用反引号。公共运算约定为：

$$
\begin{aligned}
\operatorname{clamp}(x,a,b)&=\min\!\bigl(b,\max(a,x)\bigr),\\
\operatorname{fract}(x)&=x-\lfloor x\rfloor.
\end{aligned}
$$

实现入口：

- [stellarMorphology.ts](../src/behaviors/stellarMorphology.ts)：六类构型、抽选权重、足点分布和流线预算分配。
- [stellarMagnetism.ts](../src/behaviors/stellarMagnetism.ts)：形变模态、局部磁通截面、磁拱环构型和重联连接映射。
- [stellarPlasma.ts](../src/behaviors/stellarPlasma.ts)：径向 RK4 积分、大小环系、沿场团块、热状态和共享路径采样。
- [stellarActivity.ts](../src/behaviors/stellarActivity.ts)：随机事件和 GSAP 时间轴。
- [stellarLifecycle.ts](../src/behaviors/stellarLifecycle.ts)：足点锚定的生长/回缩包络、形成驱动与松弛阶段。
- [stellarMist.ts](../src/behaviors/stellarMist.ts)：跟随外流样本的雾核宽度、伸长率与局部密度补偿。
- [视觉资产](../src/actors/assets/stellarActivity.ts)：弧丝、等离子体团块、稀薄前缘、电流片及重联后拱廊。

## 物理依据与适用边界

选择“已形成的磁通绳承载日珥，随后发生环形失稳”的一种场景。太阳喷发还可能涉及磁通浮现、磁通抵消、磁重联驱动及扭结失稳；本实现不将所选路径视为所有事件的唯一机制。

| 依据 | 本实现采用的内容 | 明确省略的内容 |
|---|---|---|
| [Kliem & Török 2006, Torus instability](https://arxiv.org/abs/physics/0605217)，式 4、5 | 自相似细电流环径向力平衡与稳定阈值 | 三维磁场自洽反馈；径向方程仍用自由细环近似，另加形变模态，不把二者称为同一个严格解 |
| [Brughmans、Jenkins & Keppens 2022](https://arxiv.org/abs/2210.13195) | 冷而密的物质聚集于磁结构凹陷；辐射冷却与加热的重要性 | 论文的自适应 MHD 网格、完整热失稳与自洽热凝聚 |
| [Fan 2018, MHD simulation of prominence eruption](https://arxiv.org/abs/1806.06305) | 日珥物质沿场回落、磁结构与质量输运相关 | 质量负载对环形失稳阈值的反馈；局部质量对形变只保留线性模态近似 |
| [NASA：Magnetic Reconfiguration in CMEs/Ejective Flares](https://ntrs.nasa.gov/citations/20090008529) | 上升磁通绳后方的电流片及低处重联拱廊 | 电阻 MHD、磁拓扑自洽改变、真实重联率和粒子加速谱 |
| [Luna 等 2016：Cross-sectional area variation for thin tubes](https://arxiv.org/abs/1607.02996) | 场强和磁通管截面沿程变化，而非整圈同粗 | 论文的特定场构型与线性本征模解 |
| [NASA：Three-Part Structure of CMEs](https://ntrs.nasa.gov/citations/20080017207) | 较亮前缘、低密度空腔、较密核心的形态层次 | 白光日冕仪观测中的汤姆孙散射与视线积分 |
| [Russell、Simões & Fletcher 2015：日冕环收缩与振荡](https://arxiv.org/abs/1506.07716) | 磁能释放后的收缩可伴随振荡，结构趋向新的平衡 | 普通回缩保留较强阻尼；重组形成的短环叠加欠阻尼脉冲响应，不把这一选择视为所有磁环的规律 |

这是一套有物理依据的实时降阶模型，包含真正的数值运动积分与现象学渲染。它不求解完整的连续性、动量、能量和感应方程组，不提供日冕物质质量、温度、速度或事件时间的定量预测。页面时间与尺寸经过压缩；亮金色 `#ffd34d` 是用户指定的展示配色，不表示肉眼能看到金色 CME，也不代表某条特定谱线。

## 径向失稳动力学

取无量纲径向尺度 $\rho=R/R_0$、时间 $\tau=t/T$，并使用外部约束磁场 $B_{\mathrm{ex}}\propto R^{-n}$。衰减指数为：

$$
\begin{aligned}
n &= -\frac{\mathrm{d}\ln B_{\mathrm{ex}}}{\mathrm{d}\ln R}, \\
c &= \ln\!\left(\frac{8R_0}{b_0}\right)-2+\frac{l_i}{2}, \\
\frac{R_0}{b_0} &= 10,\quad l_i=\frac12
\quad\Longrightarrow\quad c\approx 2.632.
\end{aligned}
$$

将 Kliem & Török 式 4 在 $c=c_0$ 下化简：

$$
\begin{aligned}
A(\rho) &= 1+\frac{c+\tfrac12}{2c}\,
\frac{\rho^{2-n}-1}{2-n}, \\
\frac{\mathrm{d}^2\rho}{\mathrm{d}\tau^2}
&=\rho^{-2}A(\rho)\left[A(\rho)-\rho^{2-n}\right].
\end{aligned}
$$

当 $n\to2$ 时，中括号的比值使用连续极限：

$$
\lim_{n\to2}\frac{\rho^{2-n}-1}{2-n}=\ln\rho.
$$

代码通过 `expm1()` 计算 $\exp\!\bigl((2-n)\ln\rho\bigr)-1$，避免小量相减。平衡点为 $\rho=1$，其线性失稳阈值：

$$
n_{\mathrm{crit}}=\frac32-\frac{1}{4c}\approx 1.405.
$$

这只适用于所选细电流环、自相似等假设，不是所有真实 CME 的统一临界值。初始条件为 $\rho=1$、$\mathrm{d}\rho/\mathrm{d}\tau=0.005$，微小速度扰动在稳定场中不产生持续膨胀。

日珥使用 $n=1.1$；抛射事件使用 $n=2.2+0.45\,\mathrm{seed}$。随机事件相当于选择一个已达到超临界状态的活动区，并非模拟其数天的磁能积累。CME 使用 $\tau=0.92\,\mathrm{age}$，普通日珥使用 $\tau=0.55\,\mathrm{age}$。四阶 Runge–Kutta 以固定场景步长 $\Delta t=\tfrac{1}{120}\,\mathrm{s}$ 积分，动力学步长再乘上述时间倍率。径向动力学保持独立；事件播放头另外驱动下面的几何生命周期包络。GSAP 决定事件年龄、时长、阶段标签和 CME 整体淡出，不另开动画时钟。

$\rho$ 驱动参考轴的上升与密度稀释；横截面另由局部场强闭合关系计算。径向方程的自由环近似与下面的足点锚定几何是降阶组合，二者不是完整自洽的磁场解。

## 大小环系、可变拱顶与局部截面

在活动区局部坐标中，$x$ 沿日面边缘，$y$ 为径向外，$z$ 为深度；$s\in[0,1]$ 参数化每个环系。普通日珥在事件触发时抽选主构型，再按该类型的空间约束生成环系。可通过[磁拱环 HTML 图鉴](actors/stellar-morphology-explainer.html)选类型、换种子、播放和比较六类结构。

| 构型 | 环系数量 | 足点与尺度关系 | 基准权重 |
|---|---|---|---|
| 孤立主环 `isolated` | 1 | 单个较大的扭转环系，无附属小环 | 24 |
| 单侧伴随 `one-sided` | 2–3 | 一侧出现 1–2 个小环，整体随机朝左或朝右 | 22 |
| 大小交错 `crossed` | 2 | 高低、大小不同，两组足点区域错位，深度朝向相反 | 18 |
| 嵌套拱廊 `nested` | 自身 2–3；含伴随 3–6 | 内部逐层降低，足点嵌套；必须伴随另一种类型 | 16 |
| 低矮环簇 `cluster` | 自身 3–4；含伴随 4–6 | 多个低矮小环沿日面展开；必须伴随另一种类型 | 12 |
| 双侧伴随 `bilateral` | 3 | 大环两侧各一个小环，大小、距离和深度不对称 | 8 |

权重合计为 100。原来的“一大两小”只对应最后一类，不再强制生成。事件选择排除本通道上次主构型及另一个日珥通道已选主构型，然后按剩余权重重新归一化：

$$
\begin{aligned}
\mathcal E &= \{k_{\mathrm{previous}},k_{\mathrm{other}}\}, \\
\Pr(k\mid\mathcal E)&=
\begin{cases}
\displaystyle\frac{w_k}{\sum_{j\notin\mathcal E}w_j}, & k\notin\mathcal E, \\[6pt]
0, & k\in\mathcal E.
\end{cases}
\end{aligned}
$$

其中 $k_{\mathrm{previous}}$、$k_{\mathrm{other}}$ 分别表示本通道上次主类型和另一通道主类型，$w_k$ 为基准权重。因此 8 是双侧伴随的基准权重，不能把它写成去重后长期恰好 8% 的实际发生率。位置、事件年龄与类型分别抽样；既有日面弧长分布和 CME 中线概率约束不变。类型只在新事件开始时更新，淡入后不会逐帧跳换。资产同时检查种子、类型和年龄回退，因此同一种子切换类型也会正确重建 CPU 模型，并复用已有 GPU 资源。

每类内部的数量（适用时）、宽高、足点偏移、深度、朝向和拱顶参数继续变化，类型也参与参数种子；同种子与同类型可以重放相同结构。参数来自活动区相关的确定性抽样，流线不独立抖动。目标宽高按各环系自己的参考轴尺寸归一化，避免“小环缩放系数”又叠乘另一套随机尺寸而破坏层次。

`nested` 与 `cluster` 的伴随约束由共享生成器保证，主页和图鉴采用相同规则。伴随对象从其余五种类型中按基准权重选一次，不递归调用组合生成：

$$
\begin{aligned}
\mathcal R &= \{\mathrm{nested},\mathrm{cluster}\}, \\
\Pr(c\mid k)&=
\begin{cases}
\displaystyle\frac{w_c}{100-w_k}, & c\ne k, \\[6pt]
0, & c=k,
\end{cases}
\qquad k\in\mathcal R.
\end{aligned}
$$

每个环系携带 `sourceKind`，结果同时返回主类型 `kind` 与伴随类型 `companion`。嵌套拱廊与低矮环簇可以相互伴随，此时两条规则同时成立。主类型的通道去重不限制伴随类型；不会将同类更多环系误认为另一种类型。组合在同一事件内共享年龄、位置与透明度，同步生成、淡入和淡出，不依赖另一通道的生命周期。布局压缩横向范围并平移到相邻足点区，保留内部嵌套/伴随关系与低环高度；这是展示约束，不代表观测得到的自然概率。

组合上限为 6 个环系：先生成伴随构型，给主类型保留最小数量；必要时将低矮环簇限制为 3 个或嵌套拱廊限制为 2 个，仍保留各自完整特征。一个活动区仍只有 12 条代表性流线：每个环系至少分到 2 条，余量按其宽高乘积分配，以最大余数法补齐。每条流线沿用 8 个物质团块，构型数量变化不增加 Mesh、实例或路径纹理尺寸。各环系的形变只消费属于自己的团块质量与温度。第二个日珥通道整体仍乘 `0.58`，保留主次构图。CME 独立使用 12 条通道表现一个喷发磁通绳，其重联过程不参与上述六类抽选。

这些是本页面的构图分类与权重，未经太阳观测统计标定，也不是完备的物理拓扑分类。

参考轴的拱顶高度函数为：

$$
\begin{aligned}
a &= \sin(\pi s),\qquad u=2s-1, \\
G(s)&=\exp\!\left[-\left(\frac{s-s_d}{w_d}\right)^2\right], \\
y_{\mathrm{ref}}(s,\rho)&=h_0\left[\rho a^p(1+ku)-d a^2G(s)\right].
\end{aligned}
$$

不同环系独立选择高度尺度 $h_0$、跨度、足点剪切及扭转圈数。启用生命周期的现行模拟中，拱顶从中性参数 $(p,k,d,s_d,w_d)=(1.35,0,0.09,0.5,0.15)$ 出发，在形成期积分时变应力与局部负载，分别限制在 $[1.02,2.15]$、$[-0.43,0.43]$、$[0.015,0.36]$、$[0.32,0.68]$ 和 $[0.10,0.23]$ 内。最终峰位、曲率与凹陷由形成历史逐渐确定；种子控制环境及驱动序列，不预先抽取最终拱顶。这些范围是无量纲展示参数，未经观测分布标定。不传生命周期的底层几何工具仍保留静态参考参数，供独立几何验证使用。

参考轴叠加五个数值演化的形变模态：

$$
\begin{aligned}
\mathbf P_{\mathrm{axis}}(s,t)
&=\mathbf P_{\mathrm{ref}}\bigl(s,\rho(t)\bigr)
+\sum_{m=1}^{5}\mathbf q_m(t)\sin(m\pi s), \\
\ddot{\mathbf q}_m+\gamma_m(t)\dot{\mathbf q}_m
+0.14\left(\frac{m\pi}{\mathrm{span}}\right)^2\mathbf q_m
&=(1-0.96r(t))\mathbf F_m+\frac{0.42D(t)}{m^{1.3}}\boldsymbol\xi_m(t), \\
F_{m,g,y}
&=\frac{2}{N_g}\sum_{\substack{j\in\mathcal J_g\\ \mathrm{branch}_j=0}}
\sin(m\pi s_j)\left[0.10\theta_j-0.20(1-\theta_j)\right].
\end{aligned}
$$

其中 $\mathcal J_g$ 为环系 $g$ 的团块索引集合，$N_g$ 为该环系的团块数量，$\mathbf q_m$ 为第 $m$ 个向量形变模态。横向与深度分量另受种子决定的非均匀约束项驱动（系数见 `createMagneticDeformation()`）。$D$ 是形成驱动包络，$r$ 是消退松弛进度，$\boldsymbol\xi_m$ 是连续的确定性时变驱动，定义见下一节。阻尼为 $\gamma_m=0.8+0.9(1-D)+r[1+0.4(m-1)]$。高阶模态受到更强的张力与退场阻尼；模态用固定 $\Delta t=\tfrac{1}{120}\,\mathrm{s}$ 的半隐式 Euler 积分，只有径向方程用 RK4。冷团块使局部下沉，热状态提供定性的膨胀驱动；同一 $\rho$ 也可以对应不同形状。$\sin(m\pi s)$ 保证两端锚定。该式是**线性化受迫弦的降阶近似**，所列力项不是从局部 MHD 压强/洛伦兹力网格求出的；真实反馈到径向电流、磁能和热压方程尚未实现。

## 足点锚定的非对称生命周期

[HTML 实验](actors/stellar-morphology-explainer.html?type=one-sided&seed=0.47&t=29.5)提供阶段跳转、慢放、磁通区域标记、分环系 SVG 包络、带方向的丝线代际图、中央交接阶段按钮和三维内外层次诊断。六类图鉴取第 8 秒的共享模型路径（个别迟生环系仍在定形），复制链接保存类型、种子和时间。页面用 36 秒示例；主页由事件时间轴选择 30–38 秒的寿命，各环系在事件内部独立演化。

普通磁拱环采用“磁场逐渐减弱”的慢消退，各环系的松弛与回缩合计 12–15.6 秒；其中部分大环在末段局部换接。CME 下方拱廊的主要回缩约 4.4 秒。这是用于区分不同驱动的展示尺度，不声称所有真实 CME 残留拱廊都比所有普通环衰减更快；实际还受持续重联、结构尺度、热状态及观测波段影响。

令 $E(x)=6u^5-15u^4+10u^3$，其中 $u=\operatorname{clamp}(x,0,1)$。对环系 $g$，确定性的独立随机流生成出生 $b_g$、成形 $t_{g}$、稳定 $t_s$、消退 $t_d$ 与结束 $e_g$。每种组成的首个环系为支撑环，$b_g=0,e_g=T$；其余环系的 $b_g\in[0.7,3.4)$、$e_g\in(T-4.2,T-1.2]$。嵌套/低簇在生成时必须包含另一种组成；各组成独立演化，参与重组的支撑环允许提前完成退场，不保留不可见的旧长连接来延长显示：

$$
\begin{aligned}
t_g-b_g&\in[4.8,6.4),\qquad t_s=t_g+1.6,\\
e_g-t_d&\in[12,15.6),\qquad k_g=\frac{e_g-t_d}{14},\\
D_g(t)&=E\!\left(\frac{t-b_g}{0.7}\right)\left[1-E\!\left(\frac{t-t_g+1.8}{t_s-t_g+1.8}\right)\right],\\
r_g(t)&=E\!\left(\frac{t-t_d}{6.4k_g}\right),\\
H_g(t)&=\left[0.045+0.955E\!\left(\frac{t-b_g}{t_g-b_g}\right)\right]
\left[1-0.965E\!\left(\frac{t-t_d-1.8k_g}{12.2k_g}\right)\right].
\end{aligned}
$$

$H_g$ 缩放相对足点弦线的偏离，不是整个对象的缩放；在一次连接保持期间，足点间距不变。下面以 $H$ 简写所属环系的包络，对完整参考流线 $\mathbf P$ 和固定区域内的端点 $\mathbf F_0,\mathbf F_1$：

$$
\mathbf B(s)=(1-s)\mathbf F_0+s\mathbf F_1,\qquad
\mathbf P_{\mathrm{life}}(s,t)=\mathbf B(s)+H(t)\left[\mathbf P(s,t)-\mathbf B(s)\right].
$$

因此 $\mathbf P_{\mathrm{life}}(0,t)=\mathbf F_0$、$\mathbf P_{\mathrm{life}}(1,t)=\mathbf F_1$。生命周期变换发生在局部足点坐标中，随后再应用环系的宽高、朝向与位移；弧丝和沿场团块读取同一变换后的路径。非零的最低高度防止退化路径。几何包络与整条丝线的代际窗口分开：拱体升降负责形状，每一代丝线按层次依次接入或退出，各条丝线再沿自己的固定方向逐渐绘入、逐渐擦除。前沿使用归一化弧长，通道透明度只负责事件边界。

形成扰动以环系种子 $\sigma_g$ 为相位，$m=1,\ldots,5$，空间分量 $a=0,1,2$：

$$
\begin{aligned}
\phi_g&=2\pi\sigma_g,\\
\xi_{m,a}(t)&=0.62\sin(0.73t+\phi_g+1.9a)\\
&\quad+0.38\sin\!\left([1.13+0.21(m-1)]t+1.7\phi_g+1.37(m-1)+0.8a\right).
\end{aligned}
$$

这是平滑、有时间相关性的展示驱动，不是每帧独立随机顶点或观测磁场噪声谱。各环系共用包络公式，但使用独立时序和状态；局部种子、质量负载以及各自的形成窗口共同决定形变。同一环系中的细丝保持关联，不各自抖动。

参考轮廓也积累形成历史。以拱顶指数 $p$ 为例，固定步更新为：

$$
p_{n+1}=\operatorname{clamp}\!\left(
p_n+\Delta t\,D(t_n)\left[0.22\xi_{1,0}(t_n)-0.18F_{1,g,y}(t_n)\right],
1.02,2.15\right).
$$

其他四个参考参数使用各自的驱动分量与限制范围，具体系数在 `createMagneticDeformation()`。$D=0$ 后保留形成结果，稳定期不继续随机更换拱顶。退场时，展示指数以 $0.8r$ 的权重趋向 1.15，偏斜乘 $1-0.7r$，凹陷深度乘 $1-0.9r$；先松弛轮廓，再明显降低 $H$，并继续从已有位移和速度积分，因而不是形成动画倒放。

**物理边界：磁能释放后的收缩不一定温和。** [Russell 等人的观测与模型](https://arxiv.org/abs/1506.07716)同时出现收缩与振荡，系统对新平衡的响应取决于驱动时间尺度等因素。普通自然回缩保留较强阻尼；局部重组形成的三条短环则叠加短促激发后的过冲、回弹与衰减振荡，是艺术取向。几何高度、驱动包络和透明度均不等于真实磁能；可见结构变暗也不等于磁场消失。足点锚定作为短时近似，不表示真实日面足点永远不移动。

### 固定磁通区域与局部连接重组

[stellarReorganization.ts](../src/behaviors/stellarReorganization.ts) 预先生成演化方案。固定的是磁通区域及其极性，连接配对可以改变；不将磁力线解释为断成小段的实体绳子。非 CME 也可以发生局部重联。[Hou 等的观测](https://arxiv.org/abs/2105.03199)展示了新浮现活动区中重联形成日冕环；[Chitta 等的研究](https://arxiv.org/abs/1610.07484)指出环根附近的小尺度混合极性环境与磁通抵消。这些依据支持引入弱背景连接，但不能推出“大环自然消退必然产生小环”。

每个事件最多选取跨度最大的一个环系为候选。半跨度为 $w$、种子生成的背景配置强度为 $\eta\in[0,1)$、独立抽样为 $U\in[0,1)$。令 $S(x)=3u^2-2u^3$，$u=\operatorname{clamp}(x,0,1)$：

$$
p=0.72\,S\!\left(\frac{2w-0.7}{1.7}\right)(0.35+0.65\eta),\qquad
\mathrm{reorganize}\iff U<p.
$$

非候选环系的 $p=0$。这是条件化的构图倾向，不是观测概率或自洽磁场判据。未命中时直接回缩；命中时该主环全部细丝参与重绘交接，其他独立环系继续演化。背景磁通区域 C、D 在初始化时固定于 A、B 之间，带轻微纵深差。概念上的配对变化仍为：

$$
\{A^+\to B^-,\ C^+\to D^-\}
\quad\longrightarrow\quad
\{A^+\to D^-,\ C^+\to B^-\}.
$$

**当前实验表达的是发光结构的交接。** 保留概念上的连接重组；可见模型并行维护旧主环 A—B、左短环 A—D、右短环 C—B、中央过渡环 D—C 四条绘制路径。两侧短环预生长并承接外肩，中央过渡环承接旧拱顶；旧主环沿丝线方向退出。中央过渡环以较弱的振荡回落消失，左右短环使用不同的种子运动方案，在鼓胀、压扁和偏斜中错峰回落，丝线仍逐条擦除。中央环的可见丝线交错保留约一半，以弱化中央过渡、突出两侧承接；丝线数量不是磁能的计量，模型未求解能量在三支之间的分配。中央环表示重组期间短暂显亮的背景连接，并不宣称每次真实重联必然生成三个短环。每条几何路径及其端点连续；发光的旧长连接在交接完成时完全退出。这不等同于求解磁拓扑随时间的完整演化，也不把“不再发光”解释为磁场消失。

#### 短环预生长与局部匹配

令交接开始时刻为 $t_c$，安排在该环系消退进度的 55%–62%；预生长从 $t_a=t_c-0.30$ 秒开始。预生长在慢消退中提前进行，实际整束交接为 $\tau_x=0.65$ 秒。两条短环的候选外肩分别沿用当前主环 $\mathbf P$ 的 $q\in[0,0.42]$ 和 $q\in[0.58,1]$ 部分：

$$
\begin{aligned}
\mathbf Q_1(s,t)&=\mathbf P(0.42s/0.62,t), &&0\le s\le0.62,\\
\mathbf Q_2(s,t)&=\mathbf P(0.58+0.42(s-0.38)/0.62,t), &&0.38\le s\le1.
\end{aligned}
$$

剩余内腿用三次 Hermite 曲线接到固定区域 D 或 C。设内腿参数区间长度为 $\Delta s=0.38$，两端位置为 $\mathbf X_0,\mathbf X_1$，对 $s$ 的切向为 $\mathbf T_0,\mathbf T_1$，局部参数为 $u$：

$$
\begin{aligned}
\mathbf Q_{\mathrm{inner}}(u)
&=(2u^3-3u^2+1)\mathbf X_0+(-2u^3+3u^2)\mathbf X_1\\
&\quad +(u^3-2u^2+u)\Delta s\,\mathbf T_0
 +(u^3-u^2)\Delta s\,\mathbf T_1.
\end{aligned}
$$

交接端继承主环切向乘参数比例 $0.42/0.62$；磁通区域端采用竖直切向。候选曲线由此匹配局部位置、高度和方向；实现以邻近样本估计主环切向。最终路径还需经过下述共享走廊约束，避免相邻分支的内腿交叉；约束附近不再要求与旧主环精确重合。

对短环自己的端点弦线 $\mathbf B_j$，预生长形状为：

$$
\mathbf Q_{j,\mathrm{grow}}(s,t)=\mathbf B_j(s)
+\left[0.025+0.975S\!\left(\frac{t-t_a}{0.30}\right)\right]
\left[\mathbf Q_j(s,t)-\mathbf B_j(s)\right].
$$

在 $t=t_c$，候选外肩落在当前主环上；最终路径保留其高度、纵深，并在分隔面附近作有限的横向调整。交接完成后用 0.28 秒转向同端点的柔性短环轮廓。左右各自的高度、拱肩鼓胀与偏斜由下述耦合响应驱动，起落时序分别生成；逐条时序仅控制擦除。短环退场不再与主环交接共用一个压缩时段。新短环继承不同跨度与纵深，低拱高度也不同；定形高度另乘 $1-0.22r_g$，保留外高内低的层次，保留整束回落时的分层轮廓。中央过渡支仍使用原有的逐条回落与擦除时序。实际磁场方向由极性决定；D—C 的存储顺序只用于曲线采样，不能据此推断磁场方向。

#### 三支共享的空间走廊

独立插值的 Hermite 内腿会向相邻分支扫过；仅给中央环增加纵深偏移不能解决正视图中的交叉。当前在每次几何采样的最后，对整个重组环系使用同一组弯曲分隔面。令 $\mathbf O$ 为原主环 A 区域端点的平均位置，$\mathbf e$ 为平均 A—B 连线在日面切平面内的单位方向，$W$ 为其水平长度：

$$
u(\mathbf Q)=\frac{(\mathbf Q-\mathbf O)\cdot\mathbf e}{W},\qquad
h(\mathbf Q)=Q_y-O_y.
$$

固定区域中心为 $d_0=0.22+0.12\eta$、$c_0=0.64+0.12\eta$。对当前全部主环丝线，在 $q=0.4,0.6$ 处分别求横向坐标均值，并限制到 $[d_0,0.46]$、$[0.54,c_0]$，得到 $d_1,c_1$；两处的最大高度分别记为 $H_D,H_C$，下限为 $0.01W$。同一个模拟时刻只更新一次，两侧和中央不能各自按回落进度移动分隔面：

$$
b_D(h)=d_0+(d_1-d_0)S(h/H_D),\qquad
b_C(h)=c_0+(c_1-c_0)S(h/H_C).
$$

取半间隙 $g=0.009$，三个独立分支须满足：

$$
\begin{aligned}
u_1&\le b_D(h)-g,\\
b_D(h)+g&\le u_3\le b_C(h)-g,\\
u_2&\ge b_C(h)+g.
\end{aligned}
$$

相邻支在相同高度至少留有 $2gW$ 的横向间隔。D 区域内，左支落在 $d_0-g$，中央支落在 $d_0+g$；C 区域的中央支与右支同理。附着点初始化后固定，各支仍属于原来的磁通区域，不再共用同一个几何端点。

为避免硬裁剪产生尖角，使用局部平滑最大值 $M_\sigma$ 及对应最小值 $m_\sigma(v,b)=-M_\sigma(-v,-b)$。令 $\delta=v-b$、$\sigma=0.006\sin(\pi s)$：

$$
M_\sigma(v,b)=
\begin{cases}
b,&\delta\le-\sigma,\\
b+\dfrac{(\delta+\sigma)^2}{4\sigma},&-\sigma<\delta<\sigma,\\
v,&\delta\ge\sigma.
\end{cases}
$$

端点处 $\sigma=0$，直接取 $\max(v,b)$。左支应用 $m_\sigma$，右支应用 $M_\sigma$，中央支先下界后上界；远离边界时保持原坐标。预生长、定形、回落和回缩都在最终位置应用同一约束：

$$
\mathbf Q_{\rm final}=\mathbf Q_{\rm candidate}+W(u_{\rm bounded}-u)\mathbf e.
$$

这保留高度与垂直于 $\mathbf e$ 的纵深，只修正越界的横向轮廓。约束针对重组三支的中心曲线，在共同 $(u,h)$ 投影中分开，因此三支不会在同一三维位置穿插；它不约束其他独立环系，也不承诺任意摄像机视角下都没有投影重叠。线宽与辉光仍可能视觉叠加。实际路径表的回归检查覆盖预生长、交接、不同步回落和退场，并用独立的线段相交判定检查全部相邻丝线。这是几何约束，并非求解一个自洽的无散磁场。

#### 重组短环的过冲与阻尼振荡

两侧由 [stellarShortLoop.ts](../src/behaviors/stellarShortLoop.ts) 提供种子参数、四模态升降形变、双模态横向响应与柔性轮廓；中央继续使用 [stellarRecoil.ts](../src/behaviors/stellarRecoil.ts) 的较弱解析脉冲响应。其他独立环系、旧主环和 CME 不使用两侧的新模型。[收缩与振荡研究](https://arxiv.org/abs/1506.07716)支持磁能变化后出现收缩与振荡，但不提供本实验的具体时序或“气泡”轮廓。这里的气泡感指鼓胀、挤压与局部迟滞的艺术表达，未求解气泡流体或完整 MHD。

**左右不对称且可复现的退场。** 令 $t_x=t_c+0.65$，所有 $U$ 由事件种子和独立盐值产生，创建后固定。随机选择先退场的一侧 $f$，另一侧 $l$ 较晚开始回落，回落过程也更长：

$$
\begin{aligned}
t_{r,j}&=t_x+0.24+0.10U_{r,j},\\
t_{f,f}&=t_x+0.72+0.12U_f,\\
T_{f,f}&=0.50+0.08U_{T,f},\qquad T_{f,l}=0.95+0.25U_{T,l},\\
\Delta_0&=0.28+0.20U_\Delta,\qquad G=1.00+0.55U_G.
\end{aligned}
$$

仅拉大结束时刻而不改变几何，会留下近乎不可见的扁环。因此后退场侧同时延后回落、延长主要回落用时；上抬和种子脉冲仍平滑覆盖各自的生命周期。擦除队列长度仍为 $R=(N-1)\times0.18+0.38$。用完整退场时间计算额外延后量：

$$
\begin{aligned}
B_j&=\max(R,T_{f,j}+0.25),\\
e_f&=t_{f,f}+B_f,\qquad e_l^0=t_{f,f}+\Delta_0+B_l,\\
\delta&=\max\bigl(0,\min(e_f+G-e_l^0,\ t_{\rm end}-0.05-e_l^0)\bigr),\\
t_{f,l}&=t_{f,f}+\Delta_0+\delta,\qquad e_l=e_l^0+\delta.
\end{aligned}
$$

常规情况下两侧完全退场相差约 1.00–1.55 秒；事件剩余时间不足时只减小额外延后量，并在事件结束前预留 0.05 秒，不截断最后一条丝线的擦除。裸运动方案未指定事件结束时刻时不限制延后量；生产模型和说明页都传入所在环系的结束时刻。先退场侧随种子变化，不固定左早右晚。参数见 `SHORT_LOOP_RETIREMENT`。每侧的目标上抬幅度 $A_j\in[0.40,0.70)$、周期 $T_j\in[0.72,0.96)$、高度阻尼比 $\zeta_j\in[0.38,0.50)$、初始激发 $|K_j|\in[0.08,0.16)$（符号也由种子选择）、两个相位及形状偏好分别采样。较长的回弹周期与较强的阻尼减弱急促弹跳；实际拱顶通过惯性响应追随目标，极值时刻不等于目标转折时刻。

设该侧退场结束为 $e_j$（见下方擦除时序），目标回落进度与高度尺度为：

$$
\begin{aligned}
C_j(t)&=0.78S\!\left(\frac{t-t_{f,j}}{T_{f,j}}\right)+0.22S\!\left(\frac{t-t_{f,j}-T_{f,j}}{e_j-t_{f,j}-T_{f,j}}\right),\\
h_j^*(t)&=\left[1+A_jS\!\left(\frac{t-t_{r,j}}{t_{f,j}-t_{r,j}}\right)\right][1-0.97C_j(t)].
\end{aligned}
$$

$S$ 在区间外截断为 0 或 1。高度目标快速回落后继续收拢；目标本身不直接缩放已经叠加振荡的几何。

**弧长约束下的非线性耦合振荡。** 两侧短环现在把横摆、升降和拱肩放在同一张响应表中求解。这里的 20% 指相对参考弧长的变化，**不是拱顶位移占弧长的比例**。足点固定，拱顶可以通过压低高度、改变两肩曲率接近外侧足点；最终仍需满足邻接分离约束。

以各侧足点间距 $D$ 归一化空间，参考曲线为 $\mathbf P_0(s,t)$，实际曲线为 $\mathbf P(s,\mathbf q,t)$：

$$
L_0(t)=\int_0^1\|\partial_s\mathbf P_0\|\,ds,\qquad
L(\mathbf q,t)=\int_0^1\|\partial_s\mathbf P\|\,ds,\qquad
\epsilon_L=\frac{L-L_0}{L_0},\qquad |\epsilon_L|\le0.20.
$$

参考曲线采用同一层次的低拱形、无横向激发及形变；动态曲线的纵深和环腿弯曲也计入弧长。CPU 响应表使用 40 段折线近似；最终三维路径另用渲染所用的 112 段逐条复核。三维求解按实际足点跨度与低拱高度计算高宽比；说明页的参考响应图使用统一高宽比 0.45，实际生成模型的测量由独立读数显示。

**断裂初期向外拉开。** 两侧激发仍从整束交接期间开始。基础横向刚度降低到原始值的 25%，激发推力独立提高到 2.40 倍，作用窗口缩短至 0.20–0.28 秒。左支取负向、右支取正向，让拱顶迅速靠近各自的外侧足点；左右的力度、时刻、周期和迟滞分别取样，不固定镜像轨迹：

$$
\begin{aligned}
t_{h,j}&=t_c+0.08+0.08U_{h,j},&d_j&=0.20+0.08U_{d,j},\\
T_{h,j}&=1.10+0.40U_{T,j},&\zeta_{h,j}&=0.16+0.07U_{\zeta,j},\\
K_{h,j}&=\sigma_j(0.20+0.08U_{K,j}),&\sigma_L&=-1,\quad\sigma_R=+1,\\
k_0&=(2\pi/T_{h,j})^2,&k_h&=0.25k_0,\quad \omega_h=\sqrt{k_h},\\
P_j(t)&=\begin{cases}\sin^2\!\left(\pi\dfrac{t-t_{h,j}}{d_j}\right),&t_{h,j}<t<t_{h,j}+d_j,\\0,&\text{其他时刻},\end{cases}
&F_x(t)&=2.40k_0K_{h,j}P_j(t).
\end{aligned}
$$

未耦合弹簧的周期为 $T_{h,j}/\sqrt{0.25}=2T_{h,j}$，约 2.20–3.00 秒；共同张力会改变实际响应，因此此值不能直接当作画面中的回摆周期。降低恢复刚度不会同步降低激发力；脉冲结束后依靠惯性回摆。参数见 [SHORT_LOOP_TRANSVERSE](../src/behaviors/stellarShortLoop.ts)。

**共同张力及恢复力。** 每侧状态为 $\mathbf q=(\ell,b,a,c,x,Q)$，依次表示对数高度、拱肩展开、偏斜、肩部形变、横摆和横摆的延迟跟随。取单位广义质量，以 $\Delta L=L-L_0$ 定义弧长势能：

$$
U_L=\frac{k_L}{2}(\Delta L)^2+
\frac{5k_L}{6(0.20L_0)^4}(\Delta L)^6,
\qquad k_L=95.
$$

仅高度、拱肩展开和横摆三个主要模态共享其梯度，其他模态通过已有的目标与迟滞跟随。这是降阶形变模型，不求解完整 MHD：

$$
\ddot q_k+2\zeta_k(t)\Omega_k(t)\dot q_k+
\Omega_k^2(t)(q_k-q_k^*)=F_k^{\mathrm{drive}}-
\mathbf1_{k\in\{\ell,b,x\}}\frac{\partial U_L}{\partial q_k}.
$$

力随弧长误差渐进增强，而非交替切换横向和纵向刚度。横摆拉长曲线时会同时拉低拱顶、调整拱肩；升降也通过相同梯度影响横摆。惯性、阻尼和迟滞允许压扁、鼓起与反向回摆连续衔接。参考长度随时间变化，所以系统不是封闭的能量守恒系统；收缩阶段额外阻尼用来耗散能量。

令 $\omega=2\pi/T_j$、$\tau=\max(0,t-t_x)$、$f=S((t-t_{f,j})/0.30)$、$g=S(\tau/0.24)[1-S((t-t_{f,j})/T_{f,j})]$。其余目标保持原有的不规则升降节奏：

$$
\begin{aligned}
\ell^*&=\log h_j^*,\\
b^*&=0.62\tanh(-0.75\ell-0.10\dot\ell),\\
a^*&=g[B_j+0.24\sin(0.72\omega\tau+\phi_2)]+0.05\dot b,\\
c^*&=0.72b+0.18g\sin(0.91\omega\tau+\phi_1),\\
x^*&=0,\qquad Q^*=x,\\
F_\ell^{\mathrm{drive}}&=\omega^2\left[-K_jS(\tau/0.16)e^{-\tau/0.24}+g\sum_i A_iP_i(t)\right].
\end{aligned}
$$

每侧保留 3–5 个上下脉冲，持续 0.24–0.42 秒，强度绝对值 0.045–0.12，方向、时刻和速率调制由种子分别生成。高度角频率为 $[(1-f)\omega+14f][1+0.07\tanh(\sum_i\nu_iP_i)]$，其余依次为 $1.5\omega L_j,0.79\omega,0.61\omega,\omega_h,\omega_hL_{h,j}$；$L_{h,j}=0.55+0.20U$。基础阻尼比为 $(\zeta_j,0.34,0.30,0.38,\zeta_{h,j},0.65)$，回落时前四项增加 $0.18f$，后两项增加 $0.60f$。

两腿仍以不同时间常数跟随横摆，分别从 0.035–0.055 秒与 0.11–0.16 秒取样，快慢归属随机；增益 $g_L,g_R\in[0.95,1.15)$。以 $\Lambda_L,\Lambda_R$ 表示跟随状态：

$$
\Lambda_{k,n+1}=\Lambda_{k,n}+
(1-e^{-\Delta t/\tau_k})(x_{n+1}-\Lambda_{k,n}),\quad k\in\{L,R\}.
$$

模型在创建时从 $\min(t_x,t_{h,j})$ 开始，以 $\Delta t=1/120$ 秒预计算。共同张力梯度采用中心差分，扰动量为 $5\times10^{-4}$；使用半隐式 Euler，先更新速度，再更新位置。超出弧长容差时沿主要模态的弧长梯度投影，并去除继续向约束外运动的速度分量。播放仍按现有事件年龄插值，不新增时钟；任意顺序 seek 可以复现同一响应。

**参考弧长收缩与振荡收拢。** 上文 $C_j$ 为整体消退进度，$e_j$ 为退场结束；定义末段窗口：

$$
R_j(t)=1-S\!\left(\frac{t-t_{f,j}-T_{f,j}}{e_j-t_{f,j}-T_{f,j}}\right),\qquad
E_j(t)=\sqrt{\max(0,1-C_j(t))}\,R_j(t).
$$

参考高度为 $h_0=h_j^*R_j$，实际高度为 $h=e^\ell R_j$。低拱消退时 $L_0$ 单调趋近 $D$；固定足点的曲线不会缩短到零。横摆及偏斜随 $E_j$ 收拢，肩部展开随 $R_j$ 收拢；末期整环低伏、发光丝线继续按原有顺序擦除，所有几何振荡最终归零。

**大幅侧倾的连续轮廓。** 取 $u=\sin(\pi s)$、$v=\cos(\pi s)$、$w=u^2$，层次 $r\in[0,1]$ 从外到内。限幅后的形变为：

$$
\begin{aligned}
\tilde b&=0.75\tanh(b/0.75)R_j,&\tilde a&=0.35\tanh(a/0.35)E_j,\\
\tilde c&=0.65\tanh(c/0.65)R_j,&A&=0.46\tanh(x/0.46)E_j,\\
J&=0.045\tanh((x-Q)/0.12)E_j,&\lambda_k&=0.46\tanh(g_k\Lambda_k/0.46)E_j.
\end{aligned}
$$

$A$ 允许参考拱顶靠近足点，但保留边缘余量。为防止大幅位移把环腿折叠，横向使用连续的比值映射；环腿迟滞影响局部形变：

$$
\begin{aligned}
\lambda(s)&=\tfrac{1+v}{2}\lambda_L+\tfrac{1-v}{2}\lambda_R,\\
\beta(s)&=2\operatorname{atanh}(2A)+2u(1-u)[\lambda(s)-A]+Juv,\\
W(s)&=\frac{s}{s+(1-s)e^{-\beta(s)}},\qquad \Delta x=W(s)-s,\\
M_y&=1+1.5Jwv,\\
\Delta z&=0.10Jw\sin(2\pi s)+0.12u(1-u)(\lambda_L-\lambda_R).
\end{aligned}
$$

端点保持 $W(0)=0,W(1)=1$，参考拱顶满足 $W(1/2)=1/2+A$。两腿迟滞项在拱顶归零；根部可以倾斜，足点没有位置动画。基础轮廓为：

$$
\begin{aligned}
\delta_r&=0.018(2r-1)\sin(\phi_r+\pi s),\\
x_0&=s+(1-2|A|)[-0.13\tilde b\sin(2\pi s)u+0.10\tilde a w],\\
y_0&=h u[1+\tilde b v^2+w(\tilde a v+\tilde c(v^2-0.25)+\delta_r)],\\
z_0&=w[0.055\tilde a v+0.025\tilde c\sin(2\pi s)],\\
\mathbf p&=(x_0+\Delta x,\ y_0M_y,\ z_0+\Delta z).
\end{aligned}
$$

$y,z$ 乘实际低拱高度与层次因子 $1-0.22r$。同束共用响应，层次只引入连续的小幅差异；丝线不会各自随机弹跳。交接阶段先保留原主环外肩，再向低拱轮廓过渡，横向形变直接施加在这条过渡路径上。

**最终三维弧长保护。** 响应表中的参考模型不包括主环外肩与空间走廊。实际绘制前，每侧为当前年龄缓存所有丝线的候选曲线和无激发参考曲线；两者均经过原有的邻接分离约束，再计算每条的三维折线弧长。若任意丝线超过容差，用同侧整束共用的系数 $\alpha$ 向参考曲线回收：

$$
\mathbf P_{\alpha}(s)=\Pi_{\mathrm{corridor}}
\left[(1-\alpha)\mathbf P_0(s)+\alpha\mathbf P_{\mathrm{candidate}}(s)\right].
$$

12 次二分寻找容差内的系数，保留小于 20% 的数值余量；每次候选重新应用走廊约束，最终再次测量。该保护作用于整束，避免单条丝线先行回落；足点不动，中央短环与旧主环保持原有逻辑。它是最终几何保护，不是完整的能量守恒解算。常见状态由共同张力自行控制，保护仅在需要时收回超限形变。

[HTML 图鉴](actors/stellar-morphology-explainer.html) 提供横向响应、上下响应、相对弧长变化与动态轮廓 SVG，支持按种子和时间观察。三维预览下的读数直接来自最终曲线：显示每侧平均弧长、参考弧长、逐条检查后的最大偏差与整束修正比例。20% 是本项目的视觉约束，不是太阳观测得到的普遍常数。实现借鉴 [XPBD 对柔顺约束和刚度的区分](https://mmacklin.com/xpbd.pdf)，但当前采用降阶势能反馈加几何投影，**不是完整 XPBD 求解器**。

**中央保留原有较弱响应。** 中央周期为 0.3608–0.4428 秒、阻尼率为 2.25–2.625 每秒、幅度为低拱高度的 5.4%–6.75%。激发从交接后 0.40–0.435 秒开始。令 $\tau_3=t-t_0$、$\omega_3=2\pi/T_3$、$\lambda_3=8/T_3$：

$$
\begin{aligned}
f(\tau_3)&=e^{-\lambda_3\tau_3}-e^{-\gamma_3\tau_3}\left[\cos(\omega_3\tau_3)+\frac{\gamma_3-\lambda_3}{\omega_3}\sin(\omega_3\tau_3)\right],\\
M&=\max_{0\le u\le1.25T_3}f(u),\qquad q(\tau_3)=-f(\tau_3)/M.
\end{aligned}
$$

$\tau_3\le0$ 时取零。中央偏斜响应的周期乘 0.79、阻尼率乘 1.25、幅度乘 0.32，并延迟 0.035 秒；继续配合中央独有的逐条回落与擦除，不使用两侧的升降方案。

[HTML 实验](actors/stellar-morphology-explainer.html)展示各侧目标高度、实际参考拱顶响应、回落起点及同一时刻的柔性拱形。另有脉冲时刻与方向示意；六个按钮可分别观察左右鼓胀、回落、错峰对照和回落末段；所有图形共用模型的响应表与轮廓采样。SVG 不包含实际足点间距、初始交接插值、发光擦除和最终空间约束，三维预览用于检查实际构图。

#### 沿弧长绘制与整束代际窗口

[stellarRedraw.ts](../src/behaviors/stellarRedraw.ts) 将两个层次分开：环束决定哪一层换代，单条丝线决定沿线绘入和擦除的进度。固定容量为 $N$，每一代有唯一编号；旧代完全擦除后才复用槽位，新代具有新的几何参数。生长期由内到外补入，稳定期保持最后一束，消退期由外到内补入，末段停止补入。

令生长窗口时长 $T_f=t_s-b_g$，种子为 $\sigma$。生长期的总发放数 $M$ 与出生时刻沿用：

$$
\begin{aligned}
C&=\max\!\left(2,\operatorname{round}\frac{T_f}{1.05+0.3\sigma}\right),\\
M&=\max\!\left(N+1,\min\!\left(\lfloor0.42CN\rfloor,
\left\lfloor\frac{0.875T_f}{0.24}-0.5\right\rfloor\right)\right),\\
J(x)&=\frac{x-2\max(0,x-0.75)^2}{0.875},\qquad 0\le x\le1,\\
b_k&=b_g+T_fJ^{-1}\!\left(\frac{k+1}{M+0.5}\right),\qquad 0\le k<M.
\end{aligned}
$$

$J$ 在生长期最后四分之一逐渐减速。当前配置下相邻生长代至少相隔 0.24 秒；稳定后暂不发放。生长期使用 $k\bmod N$ 回收最内层槽位；消退期改为回收当前最外层槽位，并将新代放入最内层。代数继续增加，不能将整个事件简单倒放。

对曲线 $\mathbf P_k(s,t)$，计算归一化弧长 $\ell_k$。每个槽位有固定展示方向 $d_i\in\{-1,+1\}$，来自种子和槽位编号；同一方向用于绘入、擦除和发光纹理的流动，代表性团块的初始速度也采用相同符号，随后仍受动力学影响：

$$
\begin{aligned}
\ell_k(s,t)&=\frac{\int_0^s\|\partial_\eta\mathbf P_k(\eta,t)\|\,d\eta}
{\int_0^1\|\partial_\eta\mathbf P_k(\eta,t)\|\,d\eta},\\
\xi_k&=\begin{cases}\ell_k,&d_i=+1,\\1-\ell_k,&d_i=-1,\end{cases}\\
F(p,\xi)&=S\!\left(\frac{\operatorname{clamp}(p,0,1)(1+2\epsilon)-\xi}{2\epsilon}\right),\qquad\epsilon=0.035.
\end{aligned}
$$

实现以 113 个路径采样点的累计距离近似积分，每次路径更新后重新归一化。$p=0$ 时完全未绘制，$p=1$ 时完全绘制。令本代出生为 $b_k$，槽位回收或最终退出为 $e_k$，绘入与擦除时长分别为 $\tau_{b,k},\tau_{e,k}$：

$$
V_k(s,t)=F\!\left(\frac{t-b_k}{\tau_{b,k}},\xi_k\right)
\left[1-F\!\left(\frac{t-e_k+\tau_{e,k}}{\tau_{e,k}},\xi_k\right)\right].
$$

常规换代取时长 $\min(0.44,0.8\Delta_k)$，$\Delta_k$ 为该次发放所用间隔；最终清空时擦除时长为 0.44 秒。方向始终相同，擦除前沿经过的位置停止绘制，不是整条丝线同时淡出。未安排回收的稳定代取 $e_k=+\infty$。槽位复用发生在 $t=e_k$，旧代已完全不可见，新代才从自身起点绘入。

可见丝线表示沿场发光的等离子体，而不是磁力线实体；展示方向也不等于磁场极性。日珥观测中存在沿环流动和反向流动，见 [Levens 等](https://arxiv.org/abs/1512.04727)。纹理传播、物质速度及磁场方向在物理上是不同量，本实验只统一其展示约定，没有将其视为同一个物理速度。

#### 消退期由外向内换代

每一代使用层次参数 $z_k$。生长期 $z_k=(k+1)/M$；消退期新代从当前最内层 $z_{\min}$ 继续降低：

$$
z_{\rm new}=-0.68+0.93(z_{\min}+0.68),\qquad
\lambda_k=0.50+0.50z_k.
$$

对共享动态参考拱形及其弦线 $\mathbf P_{\rm ref},\mathbf B_{\rm ref}$、本槽位固定端点弦线 $\mathbf B_i$，实际几何为：

$$
\mathbf P_k(s,t)=\mathbf B_i(s)+\lambda_k[\mathbf P_{\rm ref}(s,t)-\mathbf B_{\rm ref}(s)]
+\sin^2(\pi s)H_g(t)h_g\,\boldsymbol\eta(s,\sigma,k).
$$

$h_g$ 为所属环系的基准高度，$\boldsymbol\eta$ 为小幅相关扰动，具体分量见 `sampleRenewed()`，其相位含 $0.43k$。新代轮廓由当前参考形态和新层次共同决定，端点扰动为零。参考拱形在自然消退中逐渐松弛，因此新内层既更低矮，也更平滑。

消退发放从 $t_d+0.35$ 秒开始。令 $T_d=t_{\rm target}-t_d$，普通事件 $t_{\rm target}=e_g$，重组事件 $t_{\rm target}=t_a$；相邻发放间隔随消退进度逐渐增大：

$$
\Delta(t)=\max\!\left(0.30,\min\!\left(0.80,\frac{T_d}{2.2N}\right)\right)
\left[1+0.7\operatorname{clamp}\!\left(\frac{t-t_d}{\max(1,T_d)},0,1\right)^2\right].
$$

普通事件的补入截止参考时刻为 $t_*=t_d+0.66(e_g-t_d)$，仅在 $b_k<t_*-0.44$ 时发放。随后不再补入，最外层在 $t_*+0.44$ 秒完成擦除，最内层在 $e_g$ 完成擦除，中间层按顺序分布。参与重组的主环同样经历向内换代，仅在接管前停止发放：取 $t_*=t_a-0.44$，保证最后一代在短环预生长前已绘制完整；之后由重组权重接管，不能从事件开始就绕过普通消退换代。

#### 中央过渡环与连续交接

中央 D—C 候选路径的中段直接继承当前主环 $q\in[0.38,0.62]$，映射到中央支 $s\in[0.32,0.68]$：

$$
\mathbf Q_3(s,t)=\mathbf P\!\left(0.38+\frac{0.24}{0.36}(s-0.32),t\right).
$$

两端用与侧环相同的三次 Hermite 方法连接固定区域 D、C 内各自的附着点，候选连接继承匹配位置和切向，再应用共享空间走廊约束。原主环退出时中央段已有相近高度的新结构承接。候选路径与侧环分别在主环的 $q\in[0.38,0.42]$、$q\in[0.58,0.62]$ 重合；以平滑权重分配亮度：

$$
L(q)=1-S\!\left(\frac{q-0.38}{0.04}\right),\quad
R(q)=S\!\left(\frac{q-0.58}{0.04}\right),\quad
C(q)=1-L(q)-R(q).
$$

在共同参考参数上 $L+C+R=1$。中央仅保留由外到内编号为偶数的丝线，数量为 $M=\lceil N/2\rceil$；两侧仍各保留 $N$ 条。上述份额互补适用于保留中央支的槽位，未保留槽位的旧主环仍按原时序退出，不向剩余中央丝线补偿亮度。空间约束后的路径不再处处重合，这里守恒的是参考轮廓的发光份额。新支内腿的权重从匹配处向磁通区域逐渐恢复；定形时逐渐恢复各支独立发光，避免交接时骤增中央亮度。

层次 $r_k\in[0,1]$ 按当前几何层次排序，外层为 0。旧代交接从 $a_k=t_c+0.22r_k$ 开始，每条沿线交接时长为 0.43 秒，因此整束在 $t_c+0.65$ 完成。新支用其对应主环位置的弧长计算交接权重，令该位置的有向弧长为 $\xi_0$：

$$
\begin{aligned}
O_k&=1-F\!\left(\frac{t-a_k}{0.43},\xi_0\right),\\
N_k&=F\!\left(\frac{t-a_k+0.06}{0.43},\xi_0\right),\\
P_k&=0.22F\!\left(\frac{t-t_a}{0.30},\xi_0\right),\quad I_k=N_k+P_k(1-N_k),\\
V_{k,\rm old}&=\frac{O_k}{\max(1,O_k+I_k)},\qquad
V_{k,\rm incoming}=\frac{I_k}{\max(1,O_k+I_k)}.
\end{aligned}
$$

新支另外乘本支从预生长开始的沿线绘入权重，以及上述分支亮度份额。交接开始时预生长已完成，保留中央支的参考轮廓新旧权重互补。CPU 团块与 GPU 丝线使用同一份局部可见度，不让团块越过尚未绘出或已经擦除的区域。共享权重只是发光交接，并非磁通、质量或辐射能量的守恒方程。

令 $t_x=t_c+0.65$。中央保留原始层次 $k_j=2j$，$j=0,\ldots,M-1$。先停留 0.12 秒，然后按保留顺序每隔 0.12 秒启动下一条丝线；每条独立回落 0.40 秒，再沿自身方向擦除 0.40 秒。没有保留的中央槽位可见度恒为零，示踪团块读取同一掩码：

$$
\begin{aligned}
a_{3,k_j}&=t_x+0.12+0.12j,\\
p_{3,k_j,\rm lower}&=\operatorname{clamp}\!\left(\frac{t-a_{3,k_j}}{0.40},0,1\right),\\
p_{3,k_j,\rm erase}&=\operatorname{clamp}\!\left(\frac{t-a_{3,k_j}-0.40}{0.40},0,1\right),\\
V_{3,k_j}&=V_{k_j,\rm incoming}\left[1-F(p_{3,k_j,\rm erase},\xi_k)\right].
\end{aligned}
$$

中央支保持几何回缩与沿线擦除共用每条丝线的排队时刻；下述两侧支则将整束几何回落与逐条擦除分开。中央整束在 $t_x+0.92+0.12(M-1)$ 秒退出。两侧各自采用上文的柔性形变与随机回落时序。

**只有两侧发光擦除仍按外到内逐条启动。** 相邻间隔 $I=0.18$ 秒，每条窗口 $D=0.38$ 秒，令 $R=(N-1)I+D$。每侧擦除队列的起点及结束时刻为：

$$
\begin{aligned}
t_{e,j}&=t_{f,j}+\max(0,T_{f,j}+0.25-R),\\
e_j&=t_{e,j}+R,\qquad e_{\rm reorg}=\max(e_1,e_2),\\
u_{j,k}&=\operatorname{clamp}\!\left(\frac{t-t_{e,j}-Ir_k(N-1)}{D},0,1\right),\\
V_{j,k}&=V_{k,\rm incoming}\left[1-F\!\left(\frac{u_{j,k}-0.35}{0.65},\xi_k\right)\right].
\end{aligned}
$$

小丝线预算也会为整体回落预留时间，避免擦除先于主要回落结束。该排队进度不传入两侧的几何升降；每侧始终作为完整拱束协调形变。中央仍以 $1-0.97S(p_{3,k_j,\rm erase}^2)$ 缩放相对弦线的几何位移，保留较弱振荡、稀疏选层与逐条消退。所有分支最后应用共享空间走廊约束。主环在交接完成后处处不可见；中央短环的暂时存在不保留旧长连接，也不要求三条短环同时退场。这是参考磁连接重组设计的视觉实验，[NASA 的观测说明](https://svs.gsfc.nasa.gov/11199)支持连接改变与等离子体示踪的基本机制，但不能据此断言本项目的四路径分配是完整的物理重联解。

#### 路径、团块与 GPU 所有权

普通通道的路径表和重绘表均为 $113\times48$，每条代表性丝线有主环、左、右、中央四条路径；CME 保留 $113\times36$ 的三分支路径表。路径 RGBA 存位置与局部带宽；普通重绘 RGBA 存局部可见度、内外层次、绘制方向与归一化弧长。代数保留在 CPU 数组，诊断开关仅改变着色。先采样所有路径并累计弧长，再写入可见度，确保新支能读取当前主环的对应位置。

每个通道仍有 96 个代表性团块。参与重组的每条丝线按主/左/右/中央分配 2/2/2/2 个样本，四条路径分别积分；密度沉积权重为 $8/n_j$，补偿每支样本数变化。槽位换代时，只在旧代完全擦除、新代尚未绘入的瞬间重置该槽位的样本。这些是开放足点储库模型中的发光样本，不声称同一粒子身份跨路径转移或封闭质量守恒；只有 CME 上升闭环使用周期边界。

每个普通通道新增一个中央支 Mesh，与已有三支共享弧丝几何体、路径和重绘纹理。资源仍由原工厂释放，回退与换种子替换 CPU 数据而不重建 GPU 纹理。各通道分支数在实例生命周期内固定，纹理尺寸不会因种子而改变。所有播放、seek、反向回放均使用现有事件年龄与固定步模拟，没有新增时钟或逐帧对象分配。数据纹理用于共享 CPU/GPU 路径和可见度，依据：[Three.js DataTexture](https://threejs.org/docs/pages/DataTexture.html)、[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)。

### CME 上下分支的生命周期

CME 的形成包络用 $t_g=2.5$、$t_s=3.5$ 秒，早于闭合重联；$r=0$，原连接仅应用生长因子。上升闭合支保留径向动力学、粒子化和长期尾迹，不应用普通日珥的回缩包络。

下方足点拱廊按每条流线的闭合时刻独立计时，$\tau=t-t_{\mathrm{close},i}$：

$$
r_{\mathrm{lower}}=E\!\left(\frac{\tau-0.6}{2.8}\right),\qquad
H_{\mathrm{lower}}=1-0.9E\!\left(\frac{\tau-1.1}{4.4}\right).
$$

在原来的连续重联映射之后，拱顶以 $0.8r_{\mathrm{lower}}$ 的权重趋向同足点的平滑正弦拱，再乘 $H_{\mathrm{lower}}$；横向与深度偏离弦线乘 $1-0.9r_{\mathrm{lower}}$。闭合瞬间这两个包络尚未动作，保留重联位置连续性。下方松弛与回缩不影响已经逸出的上方物质。现有末段冷却和 CME 事件淡出继续生效。

## 局部截面

截面采用磁通守恒闭合关系：

$$
\begin{aligned}
\Phi &= B(s,h)A(s,h)=B(s,h)\,\pi b(s,h)^2, \\
\frac{B}{B_0}
&=\left[1+0.5(\mathrm{seed}-0.5)(2s-1)\right] \\
&\quad\times\left[0.12+
\frac{0.88}{\left(1+\dfrac{h}{0.8+0.7\,\mathrm{seed}}\right)^{1.2+0.6\,\mathrm{seed}}}\right], \\
b(s,h)&=\frac{b_0}{\sqrt{B/B_0}},\qquad
h=\max\!\left(0,P_{\mathrm{axis},y}\right).
\end{aligned}
$$

外部场随高度减弱且左右不对称，磁通束在弱场处展开、强场处收束。这里的 $B$ 是参数化闭合场强，不是求解感应方程得到的场。基础流线在局部三维法平面内按不同相位扭转；普通磁拱环的实际显示路径进一步使用上述代际分层变换，CME 保留原分支。足点附近的可见束宽用 $\sin^2(\pi s)$ 收拢；该可见包络不等同于完整物理截面积。Shader 弧丝宽度也参考 $b(s,h)$，但仍是发光示踪带的展示宽度。

## 沿场流动

每个活动区总计 12 条代表性流线，在该构型的各环系间分配，每条有 8 个示踪团块。这些是可见等离子体团块，不是单个电子或离子。对流线 $\mathbf P(s)$，令 $\ell_s=\lVert\partial\mathbf P/\partial s\rVert$，积分：

$$
\begin{aligned}
\frac{\mathrm{d}s}{\mathrm{d}t}&=\frac{v_{\parallel}}{\ell_s}, \\
\frac{\mathrm{d}v_{\parallel}}{\mathrm{d}t}
&=-g\,\frac{\partial P_y/\partial s}{\ell_s}-\nu v_{\parallel}, \\
g&=0.42,\qquad \nu=0.10.
\end{aligned}
$$

$g$ 与 $\nu$ 是无量纲展示参数。邻近流线以相反方向的小速度初始化，呈现沿场反向流动及凹陷中的振荡。凹陷对重力方向构成局部势阱；腿部物质可沿场下落。抵达足点的团块被日面储库吸收，随后以受热上行状态重新注入。该边界是开放质量储库，不声称局部场景封闭质量守恒。温度通过上述投影负载影响轴的局部形变，但没有完整沿场压力梯度或能量守恒方程。

每条流线的每个连接分支独占 32 个密度采样格，团块以线性权重沉积，再做邻格平滑。原连接和上升支乘 $\rho^{-3}$ 表现膨胀稀释；下方拱廊不使用上升支的体积因子。闭合上升支使用周期索引，足点拱廊使用开放储库；不同分支不混合密度。冷却近似为：

$$
\begin{aligned}
\frac{\mathrm{d}\theta}{\mathrm{d}t}
&=H(s)+0.12(1-\theta)-\frac{0.065D}{\sqrt{\max(0.08,\theta)}}, \\
H(s)&=0.065+0.5\exp\!\left[-18\min(s,1-s)\right], \\
0.08&\le\theta\le 1.25.
\end{aligned}
$$

$\theta$ 是归一化温度，$D$ 是上述示踪密度。热足点、较冷的中央团块和温度/密度影响的发光强度共同打破均匀发光线条。该冷却函数、热库项与温度上下限均为定性近似；没有 CHIANTI 损失表、Spitzer 热传导方程或非 LTE 辐射转移。因此这是沿场汇聚与冷却的展示，尚非自洽热凝聚模拟。

## 抛射的空间结构

- **较密核心**：原有磁通绳中的团块随结构一起上升，仍沿流线运动，不再按独立扇形直线抛撒。
- **稀薄前缘**：低不透明度的三维椭球冠壳，在接近轮廓处增强亮度，内部保持透空；不在空腔上覆盖黑色圆片。前缘形状是对三部分结构的现象学近似，不是流体激波解。
- **电流片**：两侧腿部向变形后的收颈位置汇聚；狭长发光层中有向上下分流的弱亮斑。
- **重联后上升支与拱廊**：改变原流线的连接关系，再分别上升与回缩。当前显示将上升支转为金色颗粒与薄雾，保留其运动骨架；下方拱廊仍可见。

### 连接改变的连续过程

每条通道有错开的几何阶段：

$$
q=\operatorname{clamp}\!\left(
\frac{\rho-1.48-0.32\operatorname{fract}(0.618i+\mathrm{seed})}{1.38},0,1
\right).
$$

$q$ 控制两腿靠拢，至 $q_c=0.45$ 时，原流线上 $s=c$ 与 $s=1-c$（$c=0.22$）在电流片相遇。接触点随模态形变移动。旧连接被以下两个映射替换：

$$
\begin{aligned}
s_{\mathrm{upper}}(u)&=c+(1-2c)u, \\
s_{\mathrm{lower}}(u)&=
\begin{cases}
2cu, & u<\tfrac12, \\
1-2c(1-u), & u\ge\tfrac12.
\end{cases}
\end{aligned}
$$

在接触瞬间，两条新路径逐点覆盖原路径：上方首尾相接，下方足点相连，没有凭空消失的一截。随后用五次平滑函数 $E(v)=6v^5-15v^4+10v^3$（$v=\operatorname{clamp}\!\left(\frac{q-q_c}{1-q_c},0,1\right)$）释放收颈并表现张力回缩。各通道依次重联，形成短暂局部增亮，上方回缩后继续上升，下方收为较低拱廊。

团块同时重参数化到对应新分支，位置在接触时连续；速度保留沿场标量，再按新路径的切向和弧长推进。上升支首尾周期连接，不再访问日面热库；下方支保留原来的足点储库。

这是参考 [NASA 的喷发与磁重联说明](https://svs.gsfc.nasa.gov/12588/) 做的**局部连接关系演示**。收颈位置、接触阈值和释放轨迹是指定的几何规则，未求解电阻 MHD 或真实重联率。上方闭合结构表示局部重联截面的简化，不能据此推断所有 CME 的完整三维磁通都脱离太阳；磁力线也不是像实体绳子一样产生自由断头。

## CME 收颈阶段的拱顶旋扭

[cmeRotation.ts](../src/behaviors/cmeRotation.ts) 在局部日面坐标中，以 $y$ 为向外法线、$x,z$ 为切平面，向共享三维路径施加随高度变化的旋转。它描述磁通绳轴的转向/扭曲，区别于丝线绕轴缠绕的 twist。[Kliem、Török 与 Thompson 的参数化模拟](https://ntrs.nasa.gov/citations/20140006621)讨论了外部剪切场和扭转张力释放对旋转的贡献；本实验仅借鉴其形态，不求解 MHD、磁螺度守恒或真实旋转力矩，不能把旋转解释为两腿靠近的必然结果。

一次事件只按种子生成一次旋扭方案：手性 $\sigma\in\{-1,+1\}$、主角度 $A$、启动尺度 $R_a$、定形尺度 $R_b$、高度指数 $p$ 和闭合后延续比例 $f$。使用相同手性配置 CME 丝线的绕轴方向。主角度的抽样权重为 50% 落在 $15^\circ$–$40^\circ$、30% 落在 $40^\circ$–$60^\circ$、20% 落在 $60^\circ$–$75^\circ$；$R_a\in[1.50,1.62)$、$R_b\in[2.16,2.28)$、$p\in[0.95,1.45)$、$f\in[0.06,0.12)$。这些是展示参数，并非太阳观测统计。

主旋扭上限为 $75^\circ$；将种子连续映射到新的角度范围，避免简单截断使大量事件堆积在上限。以种子的角度样本 $u\in[0,1)$ 表示（单位为度）：

$$
A(u)=\begin{cases}
15+25u/0.5,&u<0.5,\\
40+20(u-0.5)/0.3,&0.5\le u<0.8,\\
60+15(u-0.8)/0.2,&0.8\le u<1.
\end{cases}
$$

闭合后的延续计入总角度，故总角度上界为 $75^\circ\times1.12=84^\circ$；页面读数仍是主角度 $A$。预设 `0.12` 和 `0.051` 分别给出约 $+73.8^\circ$ 与 $-74.0^\circ$ 的主旋扭。原有时序和闭合后延续比例保持不变；这些角度分布是视觉参数，不是对真实事件发生比例的估计。

以现有环形失稳模型的无量纲半径 $R(t)$ 驱动，令 $E(u)=6q^5-15q^4+10q^3$，$q=\operatorname{clamp}(u,0,1)$：

$$
\Theta(R)=\sigma A\left[E\!\left(\frac{R-R_a}{R_b-R_a}\right)+fE\!\left(\frac{R-R_b}{0.8}\right)\right].
$$

主旋扭与收颈协调推进，后续同向延续并停止；闭合是逐流线触发的，因此 $R_b$ 不代表每条流线各自闭合的时刻。没有闭合瞬间的角度重置。设 $h_0$ 为形变尺度，$\mathbf d_{\rm neck}$ 为共享收颈位移：

$$
y_n=(0.50R+0.06\,\mathrm{seed})h_0+d_{{\rm neck},y},\qquad
L=0.46Rh_0,\qquad
w(y)=\left[E\!\left(\frac{y-y_n}{L}\right)\right]^p,\qquad
\theta(y,R)=w(y)\Theta(R).
$$

在共同的切平面中心 $\mathbf c=(d_{{\rm neck},x},d_{{\rm neck},z})$ 周围，对每一个路径点使用同一映射：

$$
\begin{pmatrix}x'\\z'\end{pmatrix}
=\mathbf c+
\begin{pmatrix}\cos\theta&-\sin\theta\\\sin\theta&\cos\theta\end{pmatrix}
\left[\begin{pmatrix}x\\z\end{pmatrix}-\mathbf c\right],\qquad y'=y.
$$

收颈及其下方 $w=0$，上方逐渐转向；同一高度的距离与点的高度保持不变。该空间映射可逆（同一高度反向旋转），不会把原本分离的点挤成新交点；这不代表原有参数化场已满足完整磁场拓扑约束。新旧连接共用相同映射，接触时的位置匹配和上方首尾闭合继续成立。不同高度转角不同，形成柔性扭转，而非整个对象的刚体旋转。

`stellarPlasma` 在原 $1/120\,\mathrm{s}$ 固定步更新旋扭参数；路径纹理、沿场团块和逸散出生/速度差分全部使用变形后的路径。前缘 Shader 使用同一高度权重，并以映射的逆转置修正法线；没有新增逐帧对象、独立时钟或 GPU 资源。薄雾继续共用外流样本，释放后的旋转速度按原外流阻尼逐渐松弛，不另叠加旋风。

[CME 说明页](actors/cme-dissolution-explainer.html)提供“拱顶水平旋扭”开关、种子角度读数及“从旋扭开始观察”入口。开关仅改变空间旋扭，保留同一种子的丝线手性；切换时暂停，在当前年龄重建 CPU 模拟并重放，复用 GPU 缓冲、重建该预览的尾迹，避免混入另一方案的历史。`rotation=0` 可通过实验链接保存关闭状态；默认开启，Act 4 共用同一实现。普通日珥不创建旋扭状态。

## CME 粒子化逸散（艺术化实验）

[HTML 说明与对照实验](actors/cme-dissolution-explainer.html)复用主页工厂，支持种子、时间拖动、阶段跳转、慢放、雾强度和原始磁结构对照。该效果表现等离子体发光从细丝转为稀疏团块；不表示磁场真的转化为粒子，也不把突发 CME 等同于持续太阳风。

[stellarEjection.ts](../src/behaviors/stellarEjection.ts) 在原求解器的每个固定步中检查各流线的实际重联阈值，记录首次闭合时刻 $t_i$。事件层统一提供 GSAP 年龄和连续场景时间，无额外定时器或 RAF。每条流线沿上升闭合路径保存 48 个外流运动样本，共 576 个；它们只在闭合后出生，不在空中凭空初始化。可见颗粒按 `particleStride=3` 独立抽样，每条流线最多 16 个候选颗粒，共最多 192 个；实际出生数由底部减量决定，不将省下的颗粒补到其他位置。设 $\tau=t-t_i$、闭环坐标 $s\in[0,1)$：

$$
\begin{aligned}
\bar x&=\operatorname{clamp}(x,0,1), \\
E(x)&=6\bar x^5-15\bar x^4+10\bar x^3, \\
D(\tau,s)&=E\!\left(\frac{\tau-0.04-0.26\sin^2(\pi s)}{0.55}\right), \\
\alpha_{\mathrm{filament}}&=\alpha_{\mathrm{original}}\left[1-D(\tau,s)\right], \\
\alpha_{\mathrm{particle}}&=\alpha_{\mathrm{base}}\,D(\tau,s)\,F_i\,f_{\mathrm{life}}, \\
\tau_{\mathrm{release}}(s)&=0.52+0.25\sin^2(\pi s).
\end{aligned}
$$

这里 $f_{\mathrm{life}}$ 表示生命周期包络；本节 $D$ 表示转换进度，区别于沿场流动小节中的示踪密度。转换由收颈位置向拱顶传播，各流线也因 $t_i$ 不同而错开。颗粒先继续跟随上升路径，释放步继承位置差分得到的三维速度；随后以共同的连续速度场平流，使用原 $\Delta t=\tfrac{1}{120}\,\mathrm{s}$：

$$
\begin{aligned}
\mathbf v_{\mathrm{release}}
&=\frac{\mathbf P(t)-\mathbf P(t-\Delta t)}{\Delta t}, \\
\mathbf v_{\mathrm{next}}
&=\mathbf v+\left[\mathbf U(\mathbf x,t)+B(\delta)\mathbf a-\mathbf v\right]
\left(1-e^{-0.85\Delta t}\right), \\
\mathbf x_{\mathrm{next}}&=\mathbf x+\mathbf v_{\mathrm{next}}\Delta t, \\
\phi&=2\pi\,\mathrm{seed}+0.35t, \\
U_x&=0.12x+0.24\sin(0.85y+\phi)-0.15z, \\
U_y&=0.65+0.10\max(0,y)+0.10\sin(0.7x+\phi), \\
U_z&=0.10z+0.15x+0.18\cos(0.85y+\phi).
\end{aligned}
$$

### 弧长采样、底部减量与局部舒展

`CME_DISTRIBUTION` 集中维护这组参数。原先均匀的参数间隔不等于均匀的空间间隔，收颈又把多条磁丝挤到相近的位置。现在每条流线闭合时构建 224 段弧长表，反查实际路径坐标；在一个可见颗粒间距内，按种子和流线索引错开采样相位。样本保持闭环循环次序，供薄雾计算前后邻点间距。

$$
\begin{aligned}
\ell(s)&=\int_0^s\left\lVert\frac{\partial\mathbf P(q)}{\partial q}\right\rVert\,\mathrm{d}q, \\
u_j&=\operatorname{fract}\!\left(\frac{j+\phi_{\mathrm{strand}}+\varepsilon_j}{48}\right), \\
s_j&=\ell^{-1}\!\left(u_j\ell(1)\right), \\
\phi_{\mathrm{strand}}&\in[0,3),\qquad \varepsilon_j\in[0,0.15), \\
\eta_j&=\frac{y_{\mathrm{birth},j}-y_{\min}}{\max(10^{-6},y_{\max}-y_{\min})}, \\
p_{\mathrm{birth}}(\eta)&=0.40+0.60E\!\left(\frac{\eta}{0.28}\right).
\end{aligned}
$$

$y_{\min},y_{\max}$ 来自该流线闭合时的上升支。最底部保留约 40% 的候选颗粒，到相对高度 28% 恢复全量；按固定种子散列在出生时取舍，只影响可见颗粒。原有 576 个运动样本与 96 个雾核完整保留。绘制时压紧已选实例并更新 `instanceCount`，未选颗粒不参与绘制；时间回退和重新触发重置取舍。

释放时读取固定步开始位置的快照，在半径 0.18 内估计较空的方向，保存一个有界的局部舒展速度。每个样本只计算一次邻域，不新增每帧的全体成对求解。所有样本（包括雾所使用的样本）共享同一运动修正：

$$
\begin{aligned}
\mathbf d_{jk}&=\mathbf P_j-\mathbf P_k,\qquad r_{jk}=\lVert\mathbf d_{jk}\rVert, \\
w_{jk}&=\begin{cases}
\left(1-\dfrac{r_{jk}}{0.18}\right)^2, & 0<r_{jk}<0.18, \\[6pt]
0, & r_{jk}\notin(0,0.18),
\end{cases} \\
\mathbf a_j&=0.24\,
\frac{\displaystyle\sum_k\frac{w_{jk}\mathbf d_{jk}}{\max(0.02,r_{jk})}}
{\displaystyle\max\!\left(1,\sum_k w_{jk}\right)}, \\
\delta&=\tau-\tau_{\mathrm{release}}, \\
B(\delta)&=\sin^2\!\left[\pi\operatorname{clamp}\!\left(\frac{\delta}{1.4},0,1\right)\right], \\
\lVert\mathbf a_j\rVert&\le 0.24.
\end{aligned}
$$

$B$ 从零平滑升起并在 1.4 秒归零，不给释放瞬间添加速度跳变。舒展项加入外流目标速度 $\mathbf U$，原来的速度松弛仍然生效；它温和打开局部拥挤处，不做随机爆炸或每帧抽签。这是艺术化的分布治理，不代表压力、碰撞或自洽电磁力求解。

该外流是连续空间场的艺术化近似，非 MHD 或不可压缩流体求解；释放速度包含参考轴的运动及形变，不包含原来 96 个沿场团块的独立速度。原团块在上升支随 $D$ 淡出，新颗粒接替发光表现；下方团块及足点储库保留。多数粒子在各自释放后约 0.7 秒内错峰消退；保留的尾迹光点从各自释放开始存活 300 秒，薄雾延续至闭合后约 5.2 秒。上方前缘在粒子化时淡化，电流片从首次闭合时刻开始，在 0.45 秒内降至原亮度的 2%，收颈闪光在各流线闭合后 0.04–0.30 秒退去，避免上升支与下方拱廊之间形成“气球绳”，下方拱廊亮度缓慢降至原来的 55%。磁结构、普通颗粒与薄雾仍叠加 CME 原有的事件整体透明度；长寿命尾迹独立续存。

[cmeEjectionVisual.ts](../src/actors/assets/cmeEjectionVisual.ts) 用两份 `InstancedBufferGeometry` 绘制颗粒与雾。雾按 `fogStride=6` 从原运动样本中选取位置，共 96 个三维雾片，颗粒稀释不会改变雾的输入样本数量；96 个软雾片沿原粒子分布自适应重叠，随外流展开、降低密度。材质加色混合、开启深度测试、关闭深度写入，保留日面的遮挡。它是雾片叠加的体积近似，未实现光线步进、深度缓冲软交界或真实散射。技术依据：[Three.js InstancedBufferGeometry](https://threejs.org/docs/pages/InstancedBufferGeometry.html)、[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)。

工厂的 `setEjectionAppearance(enabled, mistStrength)` 仅控制显示对照，默认开启艺术化表现，雾强度为 1。对照模式仍推进同一个求解器，因此切换不改变种子、时间或外流状态。说明页在事件前 13 秒保持整体透明度为 1，此后关闭瞬态结构，仅显示尾迹；主页继续使用既有 CME 淡入淡出。新事件重建瞬态 CPU 模型并保留旧尾迹；说明页回退或换种子清空尾迹后重放。GPU 缓冲与纹理复用，对象卸载统一释放。

## 生命周期、性能和验证

### 逸散颗粒的屏幕尺寸与配色

CME 逸散颗粒与日面背景微光共用 [stellarParticleAppearance.ts](../src/actors/assets/stellarParticleAppearance.ts) 的基础直径范围：1.5–3.5 CSS px，按确定性样本线性取值。背景的 `gl_PointSize` 乘以 DPR；CME 的广告牌半径为直径的一半，通过 CSS 视口尺寸换算至裁剪空间，不重复乘 DPR，也不乘模型尺度。二者在高像素密度屏幕上仍保持相近大小，说明页拉近视角也不会放大粒径。CME 沿运动方向最多拉伸 15%，保留轻微方向性。该尺寸约束只作用于闭环逸散颗粒，雾片仍随空间尺度与年龄扩张。

逸散颗粒直接共用磁拱环的 `uColor`，色源为 [stellarActivity.ts](../src/actors/assets/stellarActivity.ts) 的 `STELLAR_ACTIVITY_STYLE.filamentColor`（`#edab68`）。约 8% 的颗粒保留该暖金色，主体在**线性色彩空间**将同一颜色乘以 0.45，形成较暗的同色系；比例位于 `stellarParticleAppearance.ts`。亮点按固定样本选择，同一种子回放与拖动时间不会重新抽签换色。

弧丝与颗粒共用 `filamentEmission()` 的双尺度噪声密度、凝聚项和 0.75 发光增益；颗粒用出生路径坐标 $s$ 映射回原弧丝坐标 $t=0.22+0.56s$，携带所属流线索引 $i$，再乘以下方拱廊共用的 `arcadeCooling()`。小圆点在两个方向衰减，比连续弧丝更容易变暗，因此统一使用 2.5 倍覆盖率补偿，并把不透明度基值限制在 0.55；数值位于 `stellarParticleAppearance.ts`。明暗分组仅调节颜色强度，点缀样本不单独提高不透明度：

$$
\begin{aligned}
L(t,i)&=0.75\left[0.09+N(t,i)\left(0.40+0.7\operatorname{dip}(t)C\right)\right], \\
\alpha_{\mathrm{particle}}
&=f_{\mathrm{edge}}\,D(\tau,s)\,F_i\,f_{\mathrm{life}} \\
&\quad\times\min\!\left[0.55,\,2.5L(0.22+0.56s,i)\operatorname{cooling}(\tau)\right], \\
\mathbf c_{\mathrm{particle}}&=\mathbf c_{\mathrm{arc}}\left(0.45+0.55I_{\mathrm{accent}}\right).
\end{aligned}
$$

$N$ 是弧丝已有的双尺度密度噪声，$C$ 为凝聚量，$I_{\mathrm{accent}}\in\{0,1\}$ 为固定的少量点缀样本标记，$f_{\mathrm{edge}}$ 表示软边缘衰减，$f_{\mathrm{life}}$ 表示生命周期包络。颗粒与磁拱环使用相同的颜色及基础发光标尺；最终屏幕亮度仍因软边缘、重叠与生命周期而变化。薄雾和原有沿场团块保持各自的材质配色。

### 快速降低逸散后的粒子密度

[stellarParticleDensity.ts](../src/behaviors/stellarParticleDensity.ts) 共享背景微光数量与分布范围、CME 的屏幕缩放比例及快速淡出参数。背景 72 个点覆盖整个日面邻域，不能直接把 72 当作单次局部 CME 的尾迹数量。以屏幕宽高归一化后的平均条带面积估算背景密度，并将已经闭合的上升支包络换算到 Act 4 的 16:9 参考构图：

$$
\begin{aligned}
A_{\mathrm{background}}&=1.15\left(0.035+\frac{0.04}{2}\right), \\
\rho_{\mathrm{background}}&=\frac{72}{A_{\mathrm{background}}},\qquad a_{\mathrm{aspect}}=\frac{16}{9}, \\
s_x&=\min\!\left(0.018,\frac{0.035}{a_{\mathrm{aspect}}}\right)
\left(0.9+0.2\,\mathrm{seed}\right), \\
A_{\mathrm{CME}}&=\frac{\pi}{4}\,\Delta x\,\Delta y\,s_x^2\,a_{\mathrm{aspect}}, \\
N_{\mathrm{tail}}&=2\operatorname{clamp}\!\left(
\left\lceil\rho_{\mathrm{background}}A_{\mathrm{CME}}\right\rceil,2,8\right).
\end{aligned}
$$

$a_{\mathrm{aspect}}$ 为参考宽高比，$s_x$ 为横向缩放比例；$\Delta x,\Delta y$ 来自所有流线闭合时、已通过底部出生筛选的粒子局部包络。该估算用于视觉量级匹配，未精确计算背景的遮挡、年龄透明度或各观察方向的投影；当前在原取整预算上精确乘 2，保留 4–16 个尾迹（典型种子 0.47 为 4 个），增加稀释后的留存量。预算在所有流线闭合后、首次快速淡出前固定，预览缩放及屏幕调整不会重选或补出粒子。先用固定种子选择一个尾迹，再以最大最近邻距离依次选取余下尾迹，避免几个残留光点聚在一起。它们从原外流位置平滑交接至下述长寿命轨迹，不向背景点的位置跳转。

多数粒子的短寿命以**各自释放时刻**为起点，不提前破坏正在生成的闭环轮廓。固定的错峰顺序与原亮度分组独立：

$$
\begin{aligned}
\delta_i&=\tau_i-\tau_{\mathrm{release}}(s_i), \\
r_i&=\operatorname{fract}\!\left(0.75487766625i+17.13s_i\right), \\
F_i(\delta_i)&=1-E\!\left(\frac{\delta_i-0.04-0.25r_i}{0.4}\right), \\
F_{\mathrm{tail}}&=1.
\end{aligned}
$$

普通粒子在释放后 0.04–0.29 秒开始平滑消失，0.44–0.69 秒完成退场；尾迹光点交接到独立的 300 秒生命周期。$F_i$ 作为实例属性传入着色器，归零后不再提交该实例；同一粒子不会因每帧重新抽签而闪烁或复活。两类颗粒使用相同颜色和尺寸规则。576 个运动样本与 96 个雾核继续完整推进，快速稀释不缩短雾的寿命或降低其覆盖范围。

### 300 秒尾迹与跨事件留存

[stellarTail.ts](../src/behaviors/stellarTail.ts) 将稀释后的尾迹保存到活动场景持有的固定池。各粒子在释放后 0.7 秒的首个固定步保存位置与速度，`cmeEjectionVisual` 与 [cmeTailVisual.ts](../src/actors/assets/cmeTailVisual.ts) 在随后 0.3 秒交叉淡化。旧批次不再受瞬态 CME 的透明度、种子和播放头重置影响。仅保留交接快照，不保留每个历史事件的 576 个求解样本或路径纹理。

原快速外流含与位置成正比的速度项，不适合持续积分 300 秒。尾迹改用连续位置/初速度的解析轨迹，在 2.5 秒尺度内趋向慢速漂移，并叠加平滑、有界的卷动：

$$
\begin{aligned}
a&=t_{\mathrm{scene}}-t_{\mathrm{depart}},\qquad
b=t_{\mathrm{scene}}-t_{\mathrm{release}},\qquad T=2.5\,\mathrm{s}, \\
\mathbf P(a)&=\mathbf P_0+\mathbf v_{\mathrm{bg}}a
+(\mathbf v_0-\mathbf v_{\mathrm{bg}})T\left(1-e^{-a/T}\right)+\mathbf w(a), \\
\mathbf w(a)&=\mathbf A\left(1-e^{-a/12}\right)^2
\left[\sin(0.035a+\phi)-\sin\phi\right], \\
\mathbf P(0)&=\mathbf P_0,\qquad \mathbf P'(0)=\mathbf v_0, \\
\alpha_{\mathrm{tail}}&=E\!\left(\frac{a}{0.3}\right)
\left[1-E\!\left(\frac{b-240}{60}\right)\right], \\
b&\ge 300\,\mathrm{s}\quad\Longrightarrow\quad \alpha_{\mathrm{tail}}=0.
\end{aligned}
$$

$t_{\mathrm{scene}}$ 为连续场景时间，$t_{\mathrm{depart}}$、$t_{\mathrm{release}}$ 分别为交接与释放时刻；$\mathbf A$ 为各轴卷动幅度。时间量以秒计，$b\ge300\,\mathrm{s}$ 时回收粒子。位置按视口世界宽、高归一化，主页主要向右漂移，速度为每秒约 0.24%–0.36% 的世界视口宽度；不同粒子的速度差使尾迹逐渐展开。纵向保留弱日面法线分量和卷动，深度保留原外流继承速度。粒径、主色与少量点缀继续沿用原规则；长寿命阶段以交接年龄、凝聚参考值 0.5 和冷却系数 0.9 固定噪声发光，避免下一次 CME 改变旧尾迹颜色或亮度。

300 秒指 Act 4 可见场景时间，从实际释放开始计时；前 240 秒保持尾迹亮度，最后 60 秒平滑消退。离开 Act 4 后时钟暂停，返回继续。视口变化按归一化坐标重排；相机裁切、日面及行星遮挡仍影响屏幕可见性。局部说明页采用向上外流，归一化基准固定为 9 × 6.2 世界单位，相机缩放不改变轨迹；支持 30 / 120 / 240 秒跳转、30× 快放及寿命结束检查，最大事件时间 313 秒覆盖最晚释放的尾迹。

尾迹池容量 384，常规最短 18 秒喷发间隔内，300 秒最多约 17 批 × 16 个 = 272 个同时存活；异常高频手动派发超过容量时复用最旧记录。过期粒子不提交绘制。全部尾迹使用一份 `InstancedBufferGeometry` 与一个材质，随原 `useFrame` 更新并由活动资产统一释放，没有独立 RAF 或定时器。批量绘制依据：[Three.js InstancedBufferGeometry](https://threejs.org/docs/pages/InstancedBufferGeometry.html)。

[尾迹测试](../src/behaviors/__tests__/stellarTail.test.ts) 验证预算精确翻倍、交接位置/速度连续、300 秒衰减与池容量；[资产测试](../src/actors/__tests__/stellarActivityPreview.test.ts) 验证事件透明度归零、同种子重复喷发、暂停、缩放及回退重放。

### 跟随粒子扩散的连续雾场

此前把雾片相对共同中心的位移缩小到 30%，会让粒子继续展开而雾留在中央。现由 [stellarMist.ts](../src/behaviors/stellarMist.ts) 从原外流位置构造相互覆盖的雾核，**中心始终等于对应粒子样本的位置**。96 个雾核仍沿每条闭环取样；每核半径根据年龄及同一流线上前后邻点的最大间距自适应扩大，沿自身外流速度拉长：

$$
\begin{aligned}
\mathbf P_{\mathrm{fog},j}&=\mathbf P_j, \\
d_{\mathrm{adj},j}&=\max\!\left(\lVert\mathbf P_j-\mathbf P_{\mathrm{prev}}\rVert,
\lVert\mathbf P_j-\mathbf P_{\mathrm{next}}\rVert\right), \\
h_j&=\max\!\left[1.5(0.14+0.12\tau_j),\,0.9d_{\mathrm{adj},j}\right], \\
\lambda_j&=\min(1.8,1.15+0.18\tau_j), \\
\mathbf n_j&=\begin{cases}
\mathbf V_j/\lVert\mathbf V_j\rVert, & \lVert\mathbf V_j\rVert>0, \\
\mathbf n_{\mathrm{out},j}, & \lVert\mathbf V_j\rVert=0,
\end{cases} \\
q_j^2(\mathbf d)&=\frac{\lVert\mathbf d\rVert^2
-(\mathbf d\cdot\mathbf n_j)^2\left(1-\lambda_j^{-2}\right)}{h_j^2}, \\
K_j(\mathbf d)&=\exp\!\left[-3.6q_j^2(\mathbf d)\right], \\
w_j&=E\!\left(\operatorname{clamp}\!\left(\frac{\tau_j}{0.55},0,1\right)\right), \\
A_j&=\frac{1}{\max\!\left[1,\sum_k w_k K_j(\mathbf P_k-\mathbf P_j)\right]}.
\end{aligned}
$$

$d_{\mathrm{adj},j}$ 为同一流线上前后邻点的最大间距，$\mathbf n_{\mathrm{out},j}$ 为速度为零时采用的局部向外单位方向。相邻雾核的重叠覆盖衔接粒子之间的区域；$A_j$ 在局部采样过密时降低每片贡献，避免堆积成亮块。半径倍率来自 `CME_MIST_RADIUS_SCALE`；邻点间距增大时，覆盖宽度也随之增加，不以中心收拢换取连续性。重建只读取当前外流样本，不改变粒子位置、速度或寿命；数组在构建时分配，更新复用，96 个核之间的密度估计为固定规模的 $O(N^2)$ 计算。

绘制沿局部速度方向展开软雾片，后缘略强于前缘，形成淡尾迹。所有雾片共用随流坐标下的低反差密度噪声，减少独立小块感。出生加权的共同中心仅用于纹理坐标原点，平均年龄用于整体淡入、变薄与消退；二者均不控制雾片的运动位置。基础强度 `CME_MIST_OPACITY=0.32` 乘以局部补偿、出生权重、软边缘及原有年龄衰减，覆盖扩大时逐渐降低可见密度。仍保留均值为 1 的像素微抖动，抑制 8-bit 画布中大量低透明度叠加造成的色带。

颜色由 `CME_MIST_COLORS` 控制，在线性色彩空间混合 75% 近场柔光暖金色 `#ffd19a` 与 25% 远场柔光灰白色 `#c0c8dc`。这是低饱和的暖淡金色，区别于细小的磁拱环同色系颗粒。

设计参考 [Yu & Turk 的各向异性核重建方法](https://faculty.cc.gatech.edu/~turk/my_papers/sph_surfaces.pdf)中以平滑核叠加表示粒子分布的思路。本项目采用邻接间距与速度方向的轻量近似，没有实现论文的 PCA、核中心平滑或等值面提取，也没有新增流体模拟。最终显示仍为带深度测试的软雾片叠加，不是完整三维密度纹理或光线步进。

[雾场测试](../src/behaviors/__tests__/stellarMist.test.ts) 检查多种子、多时刻的粒子几何覆盖率、相邻雾区衔接、扩张宽度、平移不变性与回退；这些检查不代表所有观察方向下的像素可见度，仍需在说明页和 Act 4 对照观察。

### 更新与资源管理

结构图持有全部实例；离开 Act 4 后播放头停止，再次进入接续。事件被重新触发、种子或构型变化时重置对应物质模型。每帧通过 GSAP 年龄推进到固定数值步点，跨帧率结果一致；CME 瞬态求解器只积分到完全淡出的 13 秒；持续尾迹由连续场景时间解析求值。每次事件增加序号，即使随机种子重复，也能识别新的一批粒子。热路径复用向量和缓冲区，CPU 模型在新事件建立，尾迹记录仅在交接时分配。

每条活动流线取 113 个位置与宽度样本，写入每个活动区独占的浮点 `DataTexture`。GPU 顶点 Shader 与 CPU 可见团块使用同一张路径表插值，防止重联之后粒子仍走旧的隐藏曲线。每组 96 个团块用 `InstancedBufferGeometry` 绘制；只更新已有纹理与实例缓冲，不重新创建几何体。无不透明度且已推进到结束的事件跳过模型更新和纹理上传；直接跳到晚期时仍先完成一次瞬态积分并导出尾迹。所有对象在 layer 1，保留 `transparent`、`depthTest`，关闭 `depthWrite`；平面材质双面单次绘制。资产卸载时释放自己拥有的几何体、材质及路径纹理。

[数值测试](../src/behaviors/__tests__/stellarPlasma.test.ts) 验证稳定阈值、$n=2$ 连续极限、RK4 收敛、大小环系、锚定足点、跨帧率一致性及物质边界。[磁结构测试](../src/behaviors/__tests__/stellarMagnetism.test.ts) 验证重联接触时的路径连续、闭合支无断头、上下分离、局部磁通守恒及质量负载响应。[构型测试](../src/behaviors/__tests__/stellarMorphology.test.ts) 验证权重、环系数量与足点关系、预算及可复现性；[事件测试](../src/behaviors/__tests__/stellarActivity.test.ts) 验证位置概率、结构去重和事件生命周期；[Act 4 测试](../src/acts/__tests__/Act4SystemStructure.test.tsx) 验证图层、暂停与资源释放。视觉还需在实际页面检查日面遮挡、不同事件阶段、宽窄屏以及 Act 3 往返。
