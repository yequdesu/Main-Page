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
| [Russell、Simões & Fletcher 2015：日冕环收缩与振荡](https://arxiv.org/abs/1506.07716) | 磁能释放后的收缩可伴随振荡，结构趋向新的平衡 | 本实验选择较强阻尼、平滑回缩；不把这种表现视为所有磁环的消退规律 |

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

[HTML 实验](actors/stellar-morphology-explainer.html?type=one-sided&seed=0.47&t=29.5)提供阶段跳转、慢放、磁通区域标记、分环系 SVG 包络和连接配对示意。六类图鉴取第 8 秒的共享模型路径（个别迟生环系仍在定形），复制链接保存类型、种子和时间。页面用 36 秒示例；主页由事件时间轴选择 30–38 秒的寿命，各环系在事件内部独立演化。

普通磁拱环采用“磁场逐渐减弱”的慢消退，各环系的松弛与回缩合计 12–15.6 秒；其中部分大环在末段局部换接。CME 下方拱廊的主要回缩约 4.4 秒。这是用于区分不同驱动的展示尺度，不声称所有真实 CME 残留拱廊都比所有普通环衰减更快；实际还受持续重联、结构尺度、热状态及观测波段影响。

令 $E(x)=6u^5-15u^4+10u^3$，其中 $u=\operatorname{clamp}(x,0,1)$。对环系 $g$，确定性的独立随机流生成出生 $b_g$、成形 $t_{g}$、稳定 $t_s$、消退 $t_d$ 与结束 $e_g$。每种组成的首个环系为支撑环，$b_g=0,e_g=T$；其余环系的 $b_g\in[0.7,3.4)$、$e_g\in(T-4.2,T-1.2]$。这样嵌套/低簇始终伴随另一种组成，但不要求全部环系同相：

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

因此 $\mathbf P_{\mathrm{life}}(0,t)=\mathbf F_0$、$\mathbf P_{\mathrm{life}}(1,t)=\mathbf F_1$。生命周期变换发生在局部足点坐标中，随后再应用环系的宽高、朝向与位移；弧丝和沿场团块读取同一变换后的路径。非零的最低高度防止退化路径；初段仅用 0.3 秒淡入，末段用 1.15 秒淡出，主要可见变化来自拱体升降。

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

**物理边界：磁能释放后的收缩不一定温和。** [Russell 等人的观测与模型](https://arxiv.org/abs/1506.07716)同时出现收缩与振荡，系统对新平衡的响应取决于驱动时间尺度等因素。本轮用较强阻尼强调平滑回缩，是艺术取向。几何高度、驱动包络和透明度均不等于真实磁能；可见结构变暗也不等于磁场消失。足点锚定作为短时近似，不表示真实日面足点永远不移动。

### 固定磁通区域与局部连接重组

[stellarReorganization.ts](../src/behaviors/stellarReorganization.ts) 预先生成演化方案。固定的是磁通区域及其极性，连接配对可以改变；不将磁力线解释为断成小段的实体绳子。非 CME 也可以发生局部重联。[Hou 等的观测](https://arxiv.org/abs/2105.03199)展示了新浮现活动区中重联形成日冕环；[Chitta 等的研究](https://arxiv.org/abs/1610.07484)指出环根附近的小尺度混合极性环境与磁通抵消。这些依据支持引入弱背景连接，但不能推出“大环自然消退必然产生小环”。

每个事件最多选取跨度最大的一个环系为候选。半跨度为 $w$、种子生成的背景配置强度为 $\eta\in[0,1)$、独立抽样为 $U\in[0,1)$。令 $S(x)=3u^2-2u^3$，$u=\operatorname{clamp}(x,0,1)$：

$$
p=0.72\,S\!\left(\frac{2w-0.7}{1.7}\right)(0.35+0.65\eta),\qquad
\mathrm{reorganize}\iff U<p.
$$

非候选环系的 $p=0$。这是条件化的构图倾向，不是观测概率或自洽磁场判据。未命中时保留直接回缩；命中时该主环的全部细丝参与换接，旧 A→B 长连接不再保留；其他原有独立环系不受这一拓扑切换影响。弱背景端点 C、D 在初始化时便固定于 A、B 之间，带轻微纵深差。路径 A→B 和反向背景 C→D 各有正负两端：

$$
\{A^+\to B^-,\ C^+\to D^-\}
\quad\longrightarrow\quad
\{A^+\to D^-,\ C^+\to B^-\}.
$$

接触安排在该环系消退进度的 55%–62%，接近过程持续 0.7 秒。令原路径为 $\mathbf P_0,\mathbf P_1$，各自中点为 $\mathbf M_0,\mathbf M_1$，接近权重为 $a$，则

$$
\widetilde{\mathbf P}_j(s,t)=\mathbf P_j(s,t)
+\frac{a(t)}{2}\sin^2(\pi s)(\mathbf M_{1-j}-\mathbf M_j),\qquad j\in\{0,1\}.
$$

到 $a=1$ 时，两条路径在 $s=\tfrac12$ 相遇，所有端点仍在原区域。接触形状以固定采样数冻结，后半段换接：

$$
\mathbf Q_j(s)=
\begin{cases}
\widetilde{\mathbf P}_j(s,t_c), & s\le\tfrac12,\\
\widetilde{\mathbf P}_{1-j}(s,t_c), & s>\tfrac12.
\end{cases}
$$

换接瞬间两条新路径逐点覆盖旧路径，粒子在后半段交换所属分支，位置和参数不因换接跳变。此后新路径在 0.65 秒内松弛至同一对新端点的低拱，并从接触后 0.8 秒开始快速降低；短支在该环系结束时退场，最后 0.65 秒淡出。新生的两束短连接具有不同跨度和高度，体现大小错落的残余结构；不保留原主环作为装饰性支撑。嵌套/低簇的其他组成仍按自己的时序演化，各组成的支撑环或其重组短支延续至同一事件末端。这里只演示一种两短连接的局部配置，不声称真实重联只产生短环；真实事件也可能产生更长连接、持续加热或主要表现为冷却变暗。

换接本身保持位置连续；为了避免接头长时间呈现折角，在接触后 $0.16$ 秒内，让圆滑邻域的半宽从零增至 $h=0.12$。设 $a=\tfrac12-h$、$b=\tfrac12+h$、$u=(s-a)/(b-a)$，在邻域内使用三次 Hermite 桥：

$$
\begin{aligned}
\mathbf Q_{\mathrm{bridge}}(u)
&=(2u^3-3u^2+1)\mathbf Q(a)+(-2u^3+3u^2)\mathbf Q(b)\\
&\quad +(u^3-2u^2+u)(b-a)\mathbf Q'(a)
 +(u^3-u^2)(b-a)\mathbf Q'(b).
\end{aligned}
$$

桥接两端匹配位置和切向，邻域从零展开，接触瞬间仍严格继承旧曲线；之后再连续混合到短拱。CPU 与 GPU 共用采样路径，团块随这份路径移动，未用交叉淡出替代连线。靠拢加收为短环共约 $1.35$ 秒，是自然慢消退内部的短暂局部过程，不把整个普通环系的慢消退缩短为 CME 时长。

渲染沿用每通道 $113\times36$ 的路径纹理，普通事件使用闲置第二分支存放弱背景及换接支；最多增加 12 条路径，96 个团块预算不变，参与的每对路径初始各分配 4 个均匀错位采样的团块，密度沉积权重为 2，维持原先每支 8 个样本的密度标度，避免采样减半意外削弱冷却；该标度不是封闭质量守恒。逐路径透明度同时作用于弧丝和团块。两个普通通道各增加一个复用几何体的 Mesh，纹理/材质由原工厂统一释放；没有新增时钟、逐帧对象或 MHD 网格。

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

外部场随高度减弱且左右不对称，磁通束在弱场处展开、强场处收束。这里的 $B$ 是参数化闭合场强，不是求解感应方程得到的场。流线在局部三维法平面内按不同相位扭转，足点附近的可见束宽用 $\sin^2(\pi s)$ 收拢；该可见包络不等同于完整物理截面积。Shader 弧丝宽度也参考 $b(s,h)$，但仍是发光示踪带的展示宽度。

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
