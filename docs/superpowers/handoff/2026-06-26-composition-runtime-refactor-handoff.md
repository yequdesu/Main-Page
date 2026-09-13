# Composition Runtime 重构交接

**日期**: 2026-06-26
**目标分支**: `feat/integrated-scene-refactor`
**参考设计**: [`2026-06-22-timeline-system-handoff.md`](./2026-06-22-timeline-system-handoff.md)
**当前状态**: Composition Runtime 底座与核心动画迁移基本完成；可视化排轴编辑器尚未开始。

## 交接结论

本次重构已经把项目从「组件内部各自调度动画」推进到「actor 声明身份、层级、数据输入输出，runtime 负责 timeline、sequence、anchor、effect scope 和 debug 可观测性」的形态。当前代码仍保留 React/Three/GSAP 的项目形态，但核心动画关系已经开始向函数式、声明式的全局目标收敛。

这份文档不是替代设计文档，而是说明当前实现的落点、验证情况、剩余风险，以及后续可视化排轴器应该从哪里接入。

## 已落地模块

| 模块 | 作用 |
| --- | --- |
| `src/composition/timeline.ts` | 定义 scroll progress 到 act/segment 的可逆映射，是排轴器的时间基准。 |
| `src/composition/sequenceStore.ts` | 管理 sequence 的启停与调试可见状态，避免把阶段判断散落在组件里。 |
| `src/composition/anchorStore.ts` | 存放 actor 产出的跨层坐标和数据锚点，供其他 actor 消费。 |
| `src/composition/layerRegistry.ts` | 描述 WebGL、DOM、canvas/SVG 等层的注册关系，为后续层级可视化和约束检查留接口。 |
| `src/composition/actorRegistry.ts` | 汇总 actor 声明，包括 actor 名称、所在层、依赖数据、产出数据。 |
| `src/composition/coreActors.ts` | 当前核心 actor 声明入口。 |
| `src/composition/coreAnchors.ts` | 当前核心 anchor 名称和类型入口。 |
| `src/composition/coreSequences.ts` | 当前主要 sequence 定义入口。 |
| `src/composition/effectScope.ts` | 统一清理 GSAP tween、timer、RAF、listener 等副作用。 |
| `src/composition/frameScheduler.ts` | 为每帧调度和后续 phase/invariant 检查留出口。 |
| `src/composition/debug/CompositionPanel.tsx` | 当前 debug panel，用于展示 runtime 状态。 |

## 当前迁移状态

可逆滚动动画仍是第一约束。当前 timeline 以 scroll progress 为输入，actor 根据确定性函数和 runtime 数据计算画面状态，因此从头滑到尾、再反向滑回去，理论上不依赖一次性播放状态。

跨 actor 数据已经从直接模块引用逐步迁移到 anchor:

- `LightBeam` 发布光束世界坐标与方向。
- `OceanWaves` 读取光束 anchor，不再依赖光束组件内部变量。
- `Planets` 发布行星、屏幕点、中心星等 anchor。
- `WindChimeLines` 使用纯布局函数和 mesh cylinder 实现线段，避免原 WebGL line 在刷新、滚动、深度和抗锯齿条件下偶发不可见。
- `FloatingLabels`、guide/debug 线读取 screen anchor，不再自行推断其他组件状态。

副作用管理已经部分收敛到 `EffectScope`。终端、标签显示、昼夜切换、滚动点击 tween、标题等逻辑已经开始使用统一清理模型，降低刷新、StrictMode 和 debug 命令下的残留风险。

## 重要实现备注

风铃线曾经使用 Three.js 原生 line。该实现在线宽、深度、透明度、刷新顺序和部分设备渲染路径上不够稳定，表现为从页面顶部刷新后滚动到对应区间时偶发不可见或只剩一根线。当前已经改成 cylinder mesh，视觉上仍是细线，但渲染路径更稳定，也更容易被后续层级调试工具检查。

Vite dev server 在重构过程中出现过旧 transform 缓存，典型报错是仍尝试导入已经移除的 `_beamWorldDirection` 之类旧导出。遇到这类问题优先重启 dev server，再判断是否是真代码问题。

底部 `Scroll` / `or click to skip` 提示已经移除。若 `layerRegistry.ts` 中仍保留旧提示层声明，后续可以在确认不再恢复该 UI 后清理。

部分旧文档或注释在 PowerShell 中可能显示为乱码，这是编码显示问题，不影响 runtime。若后续要统一文档质量，可单独做一次编码清理，不建议混在动画架构改动里。

## 已验证内容

- `corepack pnpm build` 在最新重构后通过。
- `corepack pnpm test` 在 runtime 迁移阶段通过，覆盖 15 个测试文件、67 个测试。
- `debug` 命令触发后不再导致页面空白。
- 风铃线在 `sp≈0.760` 附近刷新后滚动验证可见，当前实现不再依赖原生 line。
- 底部 scroll hint DOM 和可见文本已从页面移除。

## 剩余工作

可视化编辑器还没有开始。后续工作重点应放在 runtime 之上，而不是重新把逻辑写回各个 actor:

- 在 debug panel 中加入 scroll progress scrubber、sequence 跳转和当前 act/segment 定位。
- 展示 actor 依赖图、anchor 输入输出、所在层和当前可见状态。
- 增加层级检查: z-index、WebGL render order、DOM/canvas/SVG stacking context、pointer-events。
- 增加简单布局检查: anchor 是否缺失、屏幕坐标是否越界、元素是否重叠、关键节点是否超出安全区域。
- 增加 visual regression 截图基线，至少覆盖起点、主要 act 切换点、风铃线区间、收尾区间。
- 把更多组件内部的阶段判断迁移到 `coreSequences.ts` 或 timeline range helper。
- 把更多跨组件临时状态迁移到 anchor store，禁止新增直接组件间导入运行时变量。
- 为 `frameScheduler` 增加 phase invariant: producer 必须先于 consumer 更新，consumer 读取不到 anchor 时必须能给出明确 debug 信息。

## 后续接手入口

建议下一步从这些文件开始:

- `src/composition/timeline.ts`
- `src/composition/coreSequences.ts`
- `src/composition/coreActors.ts`
- `src/composition/coreAnchors.ts`
- `src/composition/debug/CompositionPanel.tsx`
- `src/actors/README.md`

新增动画时优先补 actor 声明、sequence 声明和 anchor 声明，再写具体视觉组件。这样后续排轴器才能直接读取项目结构，而不是再从组件源码中反推动画关系。

## 文档状态

本交接文档替代此前的 `docs/superpowers/specs/2026-06-25-composition-runtime-design.md`。旧设计稿已经删除，后续架构说明应优先维护当前 handoff 和 `src/actors/README.md`。
