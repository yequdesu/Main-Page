# 磁拱环交互图鉴

入口为 [stellar-morphology-explainer.html](../../../docs/actors/stellar-morphology-explainer.html)。运行 `pnpm dev` 后访问 `/docs/actors/stellar-morphology-explainer.html`；`pnpm build:docs` 与 `pnpm preview:docs` 独立构建和预览 PBD、磁拱环与 [CME 逸散](../cme/README.md)说明，不改变主应用入口。独立构建不复制模型资源目录。

## 文件与职责

| 文件 | 职责 |
|---|---|
| [main.tsx](main.tsx) | React 入口 |
| [App.tsx](App.tsx) | 六类说明、种子表单、URL、播放控制与 SVG 图鉴 |
| [Preview.tsx](Preview.tsx) | 正交相机、旋转控制、局部日面预览及资源所有权 |
| [Lifecycle.tsx](Lifecycle.tsx) | 分环系 SVG 包络、条件重组说明与阶段跳转 |
| [Recoil.tsx](Recoil.tsx) | 共享脉冲响应与两侧整体升降的 SVG、两侧/中央对比及阶段跳转 |
| [Redraw.tsx](Redraw.tsx) | 共享出生表的整线代际 SVG、沿线方向、下一代跳转及重组阶段进度 |
| [model.ts](model.ts) | 种子校验、说明文案、共享模拟路径的 SVG 正投影 |
| [style.css](style.css) | 桌面与移动端布局 |
| [model.test.ts](__tests__/model.test.ts) | URL/种子边界、可复现性和真实路径投影验证 |

## 种子与组成

支持 `?type=nested&seed=0.47&t=2.5`；类型须为共享注册表的六种标识之一，种子为 `[0, 1)` 的十进制数，时间范围为 0–36 秒。无效 URL 参数回退到默认值；表单无效值提示错误并保留现有结果。预设、随机与手动输入使用同一生成入口，复制链接包含类型、种子和时间。

图鉴复用 [stellarMorphology.ts](../../behaviors/stellarMorphology.ts) 与 [stellarPlasma.ts](../../behaviors/stellarPlasma.ts)。嵌套拱廊和低矮环簇必须绑定另一种类型；结果中的 `companion` 和 `sourceKind` 用于展示组合及每个环系的归属。两类可以相互伴随，不能用增加同类型数量代替。模型规则、公式与适用边界见[日珥降阶模型](../../../docs/stellar-plasma-model.md)。

SVG 卡片直接投影模拟第 8 秒的路径表；三维预览默认也暂停于第 8 秒。支持 0.35×、1×、2× 播放，阶段按钮覆盖初生、生长、稳定、松弛、回缩与结束。复制链接重放类型、种子、时间和默认正视图，不保存拖动后的相机。六类卡片随种子重新积分一次，播放时不重算卡片。

生命周期公式由 [stellarLifecycle.ts](../../behaviors/stellarLifecycle.ts) 提供，[stellarReorganization.ts](../../behaviors/stellarReorganization.ts) 为各环系生成独立时序、弱背景磁通配置和条件重组方案。SVG 包络表示原有环系的几何高度，在交接完成处截止；[Redraw.tsx](Redraw.tsx) 与生产模型共用 [stellarRedraw.ts](../../behaviors/stellarRedraw.ts) 的出生表，展示丝线代数、方向箭头、绘入/擦除前沿、数量上限与最短生长间隔。点击“下一条新丝线”查看槽位回收和新代接入；生长向外补入、稳定期暂停、消退向内补入。SVG 为更新规则示意，不是实际投影；勾选“显示丝线层次”查看三维路径的内外顺序，开关仅改变着色。

普通环系自然消退为 12–15.6 秒，CME 残留拱廊的主要回缩约 4.4 秒；这不是所有真实事件的统一比例。条件重组先用 0.30 秒预生长，再用 0.65 秒按层次启动、沿弧长交接；旧主环完全退出。中央过渡环交错保留约一半丝线，两侧保持完整数量；中央接住原拱顶，停留 0.12 秒后每隔 0.12 秒由外向内启动一条丝线，每条回落 0.40 秒、沿方向擦除 0.40 秒；两侧短环用 0.28 秒转向低拱平衡轮廓，在 0.50 秒内振荡上抬，随后约 0.62 秒完成整束主要回落，低拱继续整体收拢；几何不按层次排队，仅沿线擦除每隔 0.18 秒启动下一条，退场窗口为 0.38 秒。按钮可跳至向内更迭、预生长、交接、中央承接/回落、分支分离、中央逐条退场、振荡上抬、整束回落和重组结束，避免把短环退场一并压缩到交接窗口。三支在预生长、交接、回落和退场时共用弯曲空间走廊，邻接拱足固定在同一区域内的不同位置；最终路径保留高度与纵深，在分隔面附近调整横向轮廓。常量见 `LOCAL_RECONNECTION`；本页事件为 36 秒，主页为 30–38 秒。短环脉冲响应复用 [stellarRecoil.ts](../../behaviors/stellarRecoil.ts)，两侧按几何偏离增强起伏、中央较弱且衰减更快；保留“回缩过冲 / 首次回弹 / 衰减振荡”跳转；第二幅 SVG 显示两侧共同升降趋势与基础振荡，另有“开始上抬 / 上抬末段 / 整体回落”跳转。丝线换代仍是发光结构的艺术近似；公式见[非对称生命周期](../../../docs/stellar-plasma-model.md#足点锚定的非对称生命周期)。

## 渲染与生命周期

采用 `flat`、`frameloop="demand"` 和正交相机。换种子、时间回退、诊断开关与视角变动请求新帧；播放中由 `useFrame` 推进并调用 `invalidate()`，暂停时停止连续请求。Drei OrbitControls 响应拖动/缩放并请求渲染。页面隐藏或预览离开视口时暂停，返回后需手动播放。没有额外 RAF 或定时器。依据：[R3F 按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance)、[invalidate API](https://r3f.docs.pmnd.rs/api/hooks)。

预览拥有一个 [stellarActivity](../../actors/assets/stellarActivity.ts) 实例，仅开启首个日珥通道。使用工厂的 `layoutLocal()` 在局部切平面绘制，复用现行发光材质、物质团块及共享路径表；其余通道透明度保持为零。常规 `layout()` 可恢复主页日面坐标。种子/类型变化或时间回退只重建 CPU 模拟，保留 GPU 纹理对象；卸载释放该实例的几何体、材质、路径及重绘纹理。旋转控制与磁通区域标记由 R3F/Drei 管理。发生重组的种子从初始时刻就标出 C、D 两个弱背景区域；卡片仍仅显示原有主体环系，分类描述初始构型，不强制退场保持同一拓扑。

新增类型时同步更新共享注册表、模型约束与本文案；图鉴不要另写一套 SVG 几何曲线；代际示意应继续调用共享出生表、方向及沿线绘制进度。验证覆盖种子、组合、初态回退与资源释放；视觉修改还需检查桌面/窄屏的预览、表单、播放、切换视角、足点与卡片。
