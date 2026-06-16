# TerminalBar 抽象化重构 — 会话交接

> 日期：2026-06-16
> 分支：`componentization-experiment`

## 当前状态

TerminalBar 已抽象化为纯容器引擎。MainTerminal 承载 MainPage 专属配置，与 ExperimentTerminal 形成对称架构。**构建通过，34 测试通过。需要在 `pnpm dev` 中验证行为完整性。**

## 架构

```
App.tsx ── MainTerminal (布局/字体/welcome/status + / 键激活) ── TerminalBar (纯引擎)
          ExperimentTerminal (实验布局 + planet/orbit slots) ── TerminalBar (纯引擎)
```

## 变更清单

| 文件 | 状态 | 说明 |
|------|:---:|------|
| `src/terminal/TerminalBar.tsx` | 重写 | 移除所有默认值 + propsToSlots；layout 必传；内容仅通过 Slot children；移除 `'key'` activationMode；添加 `getDefaultLines` prop |
| `src/MainTerminal.tsx` | **新建** | MainPage 专属封装：布局/字体/welcome/status line + `/` 键激活 |
| `src/App.tsx` | 修改 | TerminalBar → MainTerminal；移除 useTerminalActivation + keydown 监听；移除 handleTypewriterDoneChange |
| `src/terminal/useTerminalActivation.ts` | 删除 | 逻辑合并进 MainTerminal |
| `src/ExperimentTerminal.tsx` | 修改 | 添加 `borderRadius` + `fontFamily` 到 layout（TerminalBarLayout 必需字段） |
| `src/terminal/useCommandSystem.ts` | 修改 | `playEcho` 返回类型 `Promise<void>` → `void` |

## 删除的 legacy 代码（本次 + 上次累计）

**本次新增删除：**
- `DEFAULTS` 对象（text/layout/animation/behavior 默认值合并）
- `propsToSlots()` / `mergeSlots()` 函数
- `latestPropsRef`
- Props: `buildStatusLine`, `buildStatusLines`, `contentLines`, `statusLinePrefix`, `welcomeText`
- Interfaces: `TerminalBarTextConfig`, `TerminalBarLayoutConfig`, `TerminalBarAnimationConfig`, `TerminalBarBehaviorConfig`, `TerminalBarContentLine`
- `ActivationMode` 的 `'key'` 变体
- `useTerminalActivation.ts` + 测试文件
- App.tsx 中的 `handleTypewriterDoneChange`、`onTerminalKeyDown` 监听
- 未使用的 `EchoStrategy` import、dead animation 字段、`typewriterDone`/`onTypewriterDoneChange` props

**上次已删除：**
- `buildStatusLine(s)` 的 useEffect（单行 + 多行，~65 行）
- `contentLines` useEffect + `\0c:N` 内部标记（~45 行）
- `displayLine` 函数
- `isSlotMode` 三元分支渲染（~35 行）
- `useTerminalState` 调用（TerminalBar 不再使用，文件保留）
- legacy `useTypewriter` 实例
- `echoLinesRef` / `statusLineIdx` / `contentLineIdxRef` 等 ref

## 交互模型

| 终端实例 | 激活方式 |
|----------|----------|
| **TerminalBar**（引擎） | click to toggle（唯一内置交互） |
| **MainTerminal** | click + `/` 键激活 |
| **ExperimentTerminal** | click only |

## TerminalBar 精简后接口

```ts
interface TerminalBarProps {
  layout: TerminalBarLayout        // 必传（maxEchoLines, maxWidth, borderRadius, padding, fontSize, fontFamily, zIndex, positioning）
  text?: TerminalBarText            // promptChar（默认 '$'）+ placeholder
  animation?: TerminalBarAnimation  // 仅 heightAnimPerLine
  behavior?: TerminalBarBehavior    // activationMode（默认 'click'）+ blurTimeout（默认 100）
  // 受控状态: mode, echoLines, inputValue
  // 命令: onCommand, onClear, getDefaultLines
  // 样式: scrollProgress, onThemeUpdate, className
  // 内容: children (Slot.Welcome / Slot.Section / Slot.ContentLine)
}
```

## pnpm dev 验证清单

1. **主终端**：Typewriter → status line 出现 → 点击激活 → `/` 激活 → `help` → `clear` → 状态行滚动更新
2. **实验终端**（Act 3 左上角）：点击激活，planet/orbit 动画正常
3. **高度动画**：`help` 输出增长平滑、`clear` 收缩平滑
4. **颜色过渡**：Act 1→Act 2 文字颜色实时跟随 scrollProgress 变化
5. **多终端共存**：底部主终端 + 实验终端各自独立运行

## 已知风险 / 可能需要修复

1. **命令输出回显**：`playEcho` 当前同步追加，未经过 `useEchoSequence` 两阶段动画。
2. **`useCommandSystem` deps 对象**：每次 render 重建，回调每次重新创建。
3. **`typewriterDone` store 字段**：`handleTypewriterDoneChange` 已移除，但 `scrollStore` 中 `typewriterDone` 字段和 `setTypewriterDone` 方法仍存在（无消费者）。可考虑后续清理。

## 不变文件

- `slots.tsx`、`useSlotOrchestration.ts`、`useCommandSystem.ts`（仅 playEcho 类型变更）、`useAnimateHeight.ts`、`useTypewriter.ts`
- `Scrollable.tsx/css`、`commands.ts`
- CSS 文件
