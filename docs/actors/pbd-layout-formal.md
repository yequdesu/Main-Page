# PBD 融合标签布局：形式化说明与交互实验

核对日期：2026-09-09。本文描述当前可执行实现，而非理想化的 PBD 或已完成的优化方案。

- [交互说明页：SVG 动画、参数与帧率对比](pbd-layout-explainer.html)
- [操作手册](pbd-layout-operation-guide.md)、[维护指南](pbd-layout-maintenance-guide.md)
- [求解器](../../src/behaviors/usePBDLayout.ts)、[调度与编排](../../src/behaviors/useFloatingLabels.ts)、[显示与尺寸](../../src/actors/FloatingLabels.tsx)

## 1. 现有说明与本次补充

项目已有操作手册、维护指南，以及 [2026-06-21 的历史设计](../superpowers/specs/2026-06-21-pbd-layout-design.md)。它们说明了参数与设计意图，但不足以精确复现当前算法：存在阶段顺序、速度增量单位、几何保护范围等误述，也没有可交互实验。

本文补齐符号、公式、真实执行顺序、显示层差异、已知局限及验证方法。交互页直接调用同一份 `stepPBD()`，不复制或改良求解器。主页算法保持原样。

## 2. 如何运行交互说明

```bash
pnpm dev
# 打开 http://localhost:5173/docs/actors/pbd-layout-explainer.html
```

`pnpm debug` 的同一路径也可访问。端口被占用时，以 Vite 输出为准。

独立构建与预览：

```bash
pnpm build:docs
pnpm preview:docs
# 默认 http://localhost:4173/docs/actors/pbd-layout-explainer.html
```

产物位于 `dist-docs/`，包含说明页、本地脚本/样式和本文 Markdown。运行不依赖远程字体、绘图库或公式 CDN。主应用 `pnpm build` 的入口不变；构建不会发布或部署。源码链接应在仓库中阅读，独立产物不包含整份源代码。

### 实验方法

1. 在「轨道跟随」中播放，显示目标框、方向与轨迹。实框是算法矩形，虚框是目标矩形，十字是目标中心。
2. 暂停后「单帧推进」，观察每次调用求解器后的完整输出。阶段按钮只切换讲解和辅助图，不会关闭约束，也不是一次迭代的内部快照。
3. 调整 `g`、`R`、方向偏转、展开对象或收缩宽度。参数变化从初态重启，避免把旧参数的惯性误认为新参数效果。
4. 在「标签拥挤」中比较 30/60/120fps。三组从相同初态运行相同的 10 秒模拟时间；这是算法响应比较，不是设备性能测试。
5. 在「恒星遮挡」中观察矩形净距，在「展开约束」中观察两个锚点与范围圆。红色或负数表示违反诊断条件，不会自动修正算法。

模拟视口固定为 1280×720px，局部场景只调整 SVG 取景。缩放页面不改变物理输入。每帧时间为 `1/fps`；浏览器 rAF 通过累计时间执行相应数量的步进。页面隐藏时暂停，减少动态效果偏好启用时默认暂停。

初态在 `t=0` 调用一次原求解器，执行激活初始化和约束；后续每次「单帧推进」增加一个时间步。轨道是二维示意轨道，其他预设使用静止行星；它们不复刻主页的三维投影或实时运行数据。

## 3. 术语、符号与状态

建议称为**屏幕空间动态标签布局**，求解方式为**速度跟随、力驱动排斥与位置投影的混合算法**。PBD 是设计来源，不能据此推定当前实现具有标准 PBD 的全部性质。

| 符号 | 含义 | 单位或约定 |
|---|---|---|
| $i\in\{0,1,2\}$ | FS、Code、GitHub | 固定三标签 |
| $\mathbf p_i,r_i$ | 行星屏幕中心和视觉半径 | px |
| $\mathbf s,r_s$ | 恒星屏幕中心和视觉半径 | px |
| $\mathbf x_i,\mathbf v_i$ | 标签左上角、内部速度 | px、px/s |
| $w_i,h_i$ | 算法矩形宽高 | px，不等于实测 DOM 高度 |
| $\mathbf c_i$ | 算法矩形中心 | $\mathbf x_i+(w_i/2,h_i/2)$ |
| $\mathbf t_i,\mathbf t_i^{prev}$ | 当前和上次目标左上角 | px |
| $g,R,\theta$ | 目标偏移、锚点范围、方向偏转 | px、px、角度 |
| $W,H$ | 视口尺寸 | px |
| $[a]_+$ | $\max(a,0)$ | 正部函数 |
| $\varepsilon$ | 方向与除零阈值 | 0.001 |

屏幕 x 向右、y 向下。外部 rAF 提供正时间步，内部使用 $\Delta t=\min(dt,0.1)$。引擎以模块级 `_bodies`、`_prevTarget` 保留状态，因此 `stepPBD()` **不是纯函数，也不是 React Hook**。同一模块实例不能同时管理多个独立布局。

实际宽高由 `collapsedW/expandedW/collapsedH/expandedH/activeTrackIdx/collapsedWidths` 决定；虽然 `PBDInput` 也有 `lw/lh`，当前求解器没有读取它们。不可见标签失活并清零速度，输出零坐标；再次激活时重新初始化目标。

## 4. 一帧的真实顺序

```text
对每个标签：目标计算 → 速度预测 → 阻尼与限速 → 位置积分
重复 5 轮：
  对每个标签：缓存中心 c → A → A2 → B → C → D
  对每对标签：E
输出 x 与左右锚点；保留内部速度供下一帧使用
```

**第三阶段没有再次积分。** A/A2/E 在第一阶段位置积分之后改变速度，其效果会带到下一帧，且先经过下一帧的速度匹配和阻尼。B/C/D 在本帧直接改位置；投影后没有用实际位移重建内部速度。

五轮使用的都是完整 $\Delta t$，不是 $\Delta t/5$。增加迭代次数也会增加力的累计量，不能仅理解为“提高同一约束的求解精度”。

## 5. 目标位置：背离恒星

定义二维旋转矩阵：

$$
Q(\phi)=\begin{pmatrix}\cos\phi&-\sin\phi\\\sin\phi&\cos\phi\end{pmatrix},\qquad
\phi_i=(i-1)\theta\frac{\pi}{180}.
$$

$$
\hat{\mathbf u}_i=
\begin{cases}
\dfrac{\mathbf p_i-\mathbf s}{\|\mathbf p_i-\mathbf s\|},&\|\mathbf p_i-\mathbf s\|>\varepsilon\\
(0,-1),&\text{否则}
\end{cases}
$$

$$
\boxed{\mathbf t_i=\mathbf p_i+Q(\phi_i)\hat{\mathbf u}_i(r_i+g)-(w_i/2,h_i/2)}
$$

`g` 决定目标**中心**距行星中心的额外偏移，不是矩形边缘的保证间隙。目标方向的计算不检查恒星 `visible`；该标志只控制后面的 C 约束。

首次激活执行 $\mathbf x_i\leftarrow\mathbf t_i$、$\mathbf v_i\leftarrow0$，记录目标并跳过本次速度预测，但仍参与约束阶段。

## 6. 速度前馈、反馈与积分

当上次目标有效且 $\Delta t>\varepsilon$：

$$
\mathbf u_i=\frac{\mathbf t_i-\mathbf t_i^{prev}}{\Delta t};
\qquad\text{否则 }\mathbf u_i=0.
$$

依次执行：

$$
\mathbf v_i^*=\mathbf u_i+2.5(\mathbf t_i-\mathbf x_i)
$$

$$
\mathbf v_i\leftarrow0.92\left[\mathbf v_i+0.65(\mathbf v_i^*-\mathbf v_i)\right]
$$

$$
\operatorname{limit}(\mathbf v,M)=
\begin{cases}M\mathbf v/\|\mathbf v\|,&\|\mathbf v\|>M\\\mathbf v,&\text{否则}\end{cases}
$$

$$
\mathbf v_i\leftarrow\operatorname{limit}(\mathbf v_i,800),\qquad
\boxed{\mathbf x_i\leftarrow\mathbf x_i+\Delta t\mathbf v_i}
$$

2.5 的量纲为 $s^{-1}$；0.65 和 0.92 是每帧无量纲系数。800 是这一阶段的 **px/s 速度上限**，并不是单帧最大位移，也不能约束后续直接投影的距离。

## 7. 六类约束

每轮开始，为每个标签缓存 $\mathbf c_i=\mathbf x_i+(w_i/2,h_i/2)$，并计算 $\mathbf a_L=\mathbf x_i+(0,h_i/2)$、$\mathbf a_R=\mathbf x_i+(w_i,h_i/2)$。**同一次标签处理中的 B/C 使用这个缓存中心；B 移动后不重新计算它。** 下一轮才根据新位置重新取中心。

### A：锚点向心速度增量

$$
e_i=\max(\|\mathbf a_L-\mathbf p_i\|-R,\|\mathbf a_R-\mathbf p_i\|-R,0)
$$

当 $e_i>0$ 且 $\|\mathbf p_i-\mathbf c_i\|>\varepsilon$：

$$
\boxed{\mathbf v_i\leftarrow\mathbf v_i+20e_i\Delta t\frac{\mathbf p_i-\mathbf c_i}{\|\mathbf p_i-\mathbf c_i\|}}
$$

范围半径直接是 $R$，不叠加 $r_i+g$。这是软拉回，输出锚点不保证落在范围内。两个锚点相距 $w_i$，同时落入同一半径 R 圆内的必要条件是 $w_i\le2R$；主页展开宽 200px、R=70px 不满足该条件。

### A2：近距离排斥速度增量

令 $d_i=\|\mathbf c_i-\mathbf p_i\|$。当 $\varepsilon<d_i<r_i+10$：

$$
\boxed{\mathbf v_i\leftarrow\mathbf v_i+400(r_i+10-d_i)\Delta t\frac{\mathbf c_i-\mathbf p_i}{d_i}}
$$

20、400 可按 $s^{-2}$ 理解，乘距离和时间后得到速度增量，单位 **px/s**。源码局部变量名 `accel` 不表示该变量仍是 px/s²。

### B：行星遮挡位置投影

遍历所有可见行星 j，令：

$$
d_{ij}=\|\mathbf c_i-\mathbf p_j\|,\qquad
\rho_{ij}=\max(w_i/2,h_i/2)+r_j+4.
$$

当 $\varepsilon<d_{ij}<\rho_{ij}$：

$$
\boxed{\mathbf x_i\leftarrow\mathbf x_i+(\rho_{ij}-d_{ij})\frac{\mathbf c_i-\mathbf p_j}{d_{ij}}}
$$

这是中心距离近似，既不是严格矩形–圆碰撞，也不是以矩形半对角线构造的完整外接圆。多颗行星造成的修正使用同一缓存中心，因此不能把一轮后的结果当作全部碰撞均已解开。

### C：恒星遮挡位置投影

仅恒星可见时执行，令 $d_s=\|\mathbf c_i-\mathbf s\|$。当 $\varepsilon\le d_s<r_s+8$：

$$
\boxed{\mathbf x_i\leftarrow\mathbf x_i+(r_s+8-d_s)\frac{\mathbf c_i-\mathbf s}{d_s}}
$$

只保护标签中心；没有加上标签宽高。因此矩形的一部分仍可能侵入恒星圆。距离小于 $\varepsilon$ 时原辅助函数不进行投影。

### D：视口截断

$$
x_i^x\leftarrow\max(12,\min(W-w_i-12,x_i^x))
$$

$$
x_i^y\leftarrow\max(12,\min(H-h_i-12,x_i^y))
$$

该阶段不改速度。截断可能再次引入 B/C 的冲突。如果视口小于矩形加两侧边距，则根本不存在完全容纳它的位置。

### E：标签互斥与动量交换

对每对激活标签 $i<j$，计算：

$$
o_x=\min(x_i^x+w_i,x_j^x+w_j)-\max(x_i^x,x_j^x)
$$

$$
o_y=\min(x_i^y+h_i,x_j^y+h_j)-\max(x_i^y,x_j^y).
$$

只有 $o_x>2$ 且 $o_y>2$ 才触发。取穿透深度 $\delta=\min(o_x,o_y)$；当 $o_x<o_y$ 时沿 x 轴，否则沿 y 轴。法向 $\mathbf n$ 根据左上角相对位置从 j 指向 i；坐标相等时取正方向。

施加排斥前记录 $q=(\mathbf v_i-\mathbf v_j)\cdot\mathbf n$，随后：

$$
a=\min(180\delta\Delta t,200)
$$

$$
\mathbf v_i\leftarrow\mathbf v_i+\frac a2\mathbf n,\qquad
\mathbf v_j\leftarrow\mathbf v_j-\frac a2\mathbf n.
$$

若 $q<0$，再执行：

$$
J=\frac{0.4q}{2},\qquad
\mathbf v_i\leftarrow\mathbf v_i-J\mathbf n,\qquad
\mathbf v_j\leftarrow\mathbf v_j+J\mathbf n.
$$

`MAX_ACCEL=200` 实际限制的是已乘 $\Delta t$ 的速度增量幅值。每轮都可能再次累加，位置不会在 E 内直接变化。2px 是每个轴的触发阈值，不是保证最大穿透量为 2px。

## 8. 输出、调度与显示层

输出最终左上角和按最终位置重算的左右锚点，保留内部速度。没有标准 PBD 常见的 $\mathbf v\leftarrow(\mathbf x_{new}-\mathbf x_{old})/\Delta t$ 步骤。

主页的附加链路：

- `Planets` / `useScreenProjection` 发布投影，`useFloatingLabels` 在独立 rAF 中读取。rAF 频率随显示与调度变化，并非固定 60fps。
- 布局缓存仅比较三标签 x/y，全部差异小于 0.5px 时复用旧缓存；这不代表实时数据订阅不会引起其他 React 更新。
- `InfoPanelTerminal` 进入 idle 后打开入场门控。`pbdReady` 仅检查已有非零输出，不检查收敛误差。
- `proximity` 计算了排序延迟，但显示组件仍以 `showCount` 按索引解锁；不能把配置值理解为严格的最近者先出现或真正同时出现。
- 欢迎文字结束后优先测量 DOM，Canvas `measureText()` 仅作后备。视觉宽度以 500ms CSS 过渡收缩，算法在 250ms 后切换宽度，引导线在 500ms 后放行。
- 宽度适配使用 $\operatorname{clamp}(\lceil textWidth+18\rceil,24,collapsedWidth)$。算法高度为 36/44px，但 DOM 高度由内容决定；不能认为传入这个参数就设置了元素高度。
- 主页还对 `transform` 使用 150ms CSS 过渡；实验页直接绘制求解结果，避免将显示层滞后误认为求解器行为。
- 引导线从左右锚点和两个顶部角点中选距行星最近者，间隙超过 11px 才出现，两端缩进 3px；它不是四边任意点上的严格最短线段。

## 9. 实验指标

指标由 [model.ts](../../src/docs/pbd/model.ts) 在原求解器输出上独立计算。

最大两标签重叠面积（非总面积）：

$$
A_{max}=\max_{i<j}[o_x]_+[o_y]_+.
$$

矩形到恒星圆的净距：

$$
d_x=\max(x_i^x-s_x,0,s_x-x_i^x-w_i),\quad
d_y=\max(x_i^y-s_y,0,s_y-x_i^y-h_i)
$$

$$
G_{min}=\min_i(\sqrt{d_x^2+d_y^2}-r_s).
$$

这是最近距离减半径；负数说明相交，不是完整的最小平移分离距离。锚点越界量为各标签 A 约束 $e_i$ 的最大值，使用最终输出锚点重新计算。隐藏标签不参与指标。

## 10. 已知局限与改进边界

| 当前事实 | 影响 | 尚未实施的方向 |
|---|---|---|
| 每帧固定平滑/阻尼系数，五轮重复完整 dt | 响应依赖帧率和迭代次数 | 时间一致的平滑或固定步长设计 |
| A/A2/E 改速度，下一帧才间接改位置 | 可形成残余重叠或长期拉扯 | 区分必须满足的几何约束与跟随偏好 |
| B/C 中心近似、中心缓存、D 后截断 | 避让可能不完整或互相抵消 | 矩形–圆检测、逐次更新几何、最终残差检查 |
| 展开尺寸与 R 的双锚点目标冲突 | 持续拉回压力 | 单连接锚点或展开专用规则 |
| DOM 尺寸和动画不完全等于算法状态 | 碰撞盒、可见位置、引导线不一致 | 统一尺寸与显示时钟 |
| 模块级状态、固定三个标签 | 多实例会相互干扰 | 独立状态容器；按实际需要再扩展数量 |

当前不保证找到无重叠解，没有候选方位回退，没有主终端/品牌标题的禁入区域，也没有输入时的位置锁定。不能仅通过增加排斥刚度宣称已解决这些问题。

## 11. 维护与验收

公式常量以 [求解器](../../src/behaviors/usePBDLayout.ts) 为准；页面公式位于 [formulas.ts](../../src/docs/pbd/formulas.ts)，场景、指标和实验时钟适配位于 [model.ts](../../src/docs/pbd/model.ts) / [main.tsx](../../src/docs/pbd/main.tsx)。修改求解器后同时核对本文和页面公式。

交互页在独立文档入口加载求解器；比较帧率时顺序重置同一个模块状态，结束后再重置交互会话。不要把该页面直接挂到主页同一 React 树中，否则其 reset 会影响主页布局。

```bash
pnpm test --run src/behaviors/__tests__/usePBDLayout.test.ts src/docs/pbd/__tests__/model.test.ts
pnpm build:docs
```

浏览器核对：播放/暂停、单帧、复位、各预设、滑块、展开/收缩宽度、图层、公式切换、帧率对比；检查窄屏布局、负净距和锚点越界的含义。测试不把已知缺陷的具体数值作为永久正确答案。

## 12. 参考来源

- Müller 等：[Position Based Dynamics](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)，§3.1 的预测—投影—速度重建流程。这里只引用其框架，不把论文性质直接套用到混合实现。
- Macklin 等：[XPBD: Position-Based Simulation of Compliant Constrained Dynamics](https://matthias-research.github.io/pages/publications/XPBD.pdf)，讨论约束刚度与时间步、迭代次数的关系。当前项目没有实现 XPBD 的柔顺度和乘子求解。
