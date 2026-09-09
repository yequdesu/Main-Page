# PBD 交互说明页

这是项目文档的独立入口，说明当前融合算法，直接调用 `src/behaviors/usePBDLayout.ts`。不挂载主页、Three.js 场景或终端，也不修改主应用布局。

## 文件

| 文件 | 职责 |
|---|---|
| [main.tsx](main.tsx) | SVG 动画、播放时钟、实验参数、图层、公式章节与对比结果 |
| [model.ts](model.ts) | 可重复的二维场景、原求解器适配、独立几何指标、帧率比较 |
| [formulas.ts](formulas.ts) | 页面展示的公式与实现说明 |
| [style.css](style.css) | 响应式布局与日夜配色 |
| [model.test.ts](__tests__/model.test.ts) | 几何指标、目标语义、原求解器一致性、复位和对比 |

入口为 [pbd-layout-explainer.html](../../../docs/actors/pbd-layout-explainer.html)，完整说明为 [pbd-layout-formal.md](../../../docs/actors/pbd-layout-formal.md)。运行 `pnpm dev` 后访问 `/docs/actors/pbd-layout-explainer.html`；`pnpm build:docs` 和 `pnpm preview:docs` 用于独立构建与预览。

## 维护边界

- 求解器使用模块级状态，页面只能有一个活动会话。批量比较顺序运行各组，随后重置交互会话；不要直接嵌入主页同一运行环境。
- `targetFor()` 只计算显示用目标，指标只检查结果，不替代或修复求解器。
- 数值采用固定模拟视口单位；SVG 局部放大不改变输入。轨道是说明用路径，收缩宽度是样例值。
- rAF 在暂停、隐藏或卸载时停止；ResizeObserver 在卸载时断开。页面不订阅主页 store。
- 公式常量需与源码同步；修改算法后核对完整公式、页面公式及显示用目标。测试不固定当前算法缺陷的数值。
- 原生控件支持键盘；动态指标不逐帧朗读，操作结果通过单独的状态区提示。窄屏、深浅主题和实际交互须用浏览器检查。
