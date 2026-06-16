# echo-area 滚动定位调试：scrollToBottom 失效 + 无限更新循环

> 日期：2026-07-17
> 标签：debug, TerminalBar, Scrollable, useAnimateHeight, React, scroll

## 背景

TerminalBar 抽象化重构后，命令输出（`help` 等）通过声明式 `TerminalBar.Section` slot 走统一 GSAP 管线。Section 配置 `rows: 'lineByLine'` 逐行揭示内容。但 echo-area 的滚动窗口并未自动定位到命令输出的最后一行。

## 现象

1. `help` 命令触发后，Section slot 正确载入所有输出行
2. echo-area scroll window 停留在旧位置，不跟随到新内容的底部
3. 手动点击 ArrowDown 后才能看到完整输出

## 排查过程

### 第一轮：注入诊断日志

在关键路径埋入 console.log：
- `[main]` — MainTerminal: `playEcho` / `autoScrollKey` 触发
- `[cmd]` — useSlotOrchestration: `activateSlot` 行位预留 + `writeSlotLines` 每行写入
- `[height]` — useAnimateHeight: `onComplete` 触发
- `[scroll]` — Scrollable: `scrollToBottom` GO/SKIP + `pinnedToBottom` 状态

### 第二轮：发现 scrollTop 复位（scrollTop was 53）

日志显示 `useAnimateHeight.onComplete` 被反复调用，且每次 `scrollToBottom` 将 `scrollTop` 拉到底部后，下一次 `onComplete` 时 `scrollTop` 又被复位到 53px。

**根因 A：`transitionend` 监听器无条件注册**

`useAnimateHeight` 在每次 `useLayoutEffect` 中都注册 `transitionend` 监听器——即使 `curr === prev`（行数不变）未启动 CSS transition。status poll 每 250ms 触发 `echoLines` 变化，`curr === prev` 时跳过 GROW 分支但新监听器照常注册。之前动画的 `transitionend` 触达时，所有累积的监听器同时回调 → 多次 `cleanup`/`onComplete`/`scrollToBottom` 反复冲刷。

**修复：** 将 `transitionend` 监听器 + `setTimeout` 移入 GROW / SHRINK 分支内，仅当真正启动 CSS transition 时注册。

### 第三轮：发现 scrollHeight 静默增长（139→157）

`reserveLines` 预留空行后 `scrollHeight = 139`，`lineByLine` 逐行填入内容后 `scrollHeight` 增至 `157`。但 `useAnimateHeight` 只检测行数变化（`curr !== prev`），不检测 `scrollHeight` 变化。因此内容填充后的滚动更新被跳过。

```
scrollHeight 139 → 157（+18px，一行内容填充）
curr=9, prev=9 → 跳过 GROW → onComplete 不触发 → 窗口不跟随
```

**根因 B：内容填充不改变行数，useAnimateHeight 未覆盖此场景**

**修复：** 在 SHRINK / GROW 分支之后新增 `curr === prev && newH !== oldH` 分支——当行数不变但 scrollHeight 变化（内容填充致高度增减）时，直接调用 `onComplete` → `scrollToBottom`。增加 `!animatingRef.current` 守卫，避免干扰正在进行的 height transition。

### 第四轮：发现无限更新循环

日志显示 `Maximum update depth exceeded`，堆栈指向 `useSlotOrchestration` → `App.tsx` → store 更新 → 循环。

**根因 C：sync-in effect 与 sync-out effect 形成反馈环**

`useSlotOrchestration` 的 sync-in effect（从 `controlledEchoLines` 同步回内部状态）与 sync-out effect（从内部状态同步到 store）之间的反馈环。命令输出现在走 Slot 管线，不再需要外部写入 echoLines，sync-in 已无必要。

**修复：** 移除 sync-in effect。store 同步改为单向（内部 → 外部）。

### 第五轮：引入 pinnedToBottom

为了避免 `scrollToBottom` 在用户翻看历史时强制拖回底部，采用社区标准方案（援引 xterm.js、VS Code Terminal、Slack）：

- `pinnedRef` 追踪用户是否在底部（`distFromBottom <= 1`）
- `scrollToBottom` 仅在 `pinnedRef.current === true` 时执行
- 用户向上滚动 → `pinned = false` → 新内容不打断
- 用户滚回底部 → `pinned = true` → 恢复跟随

## 修复清单

| 文件 | 变更 |
|------|------|
| `useAnimateHeight.ts` | ① `transitionend` 监听器移入 GROW/SHRINK 分支；② 新增 `curr===prev && newH!==oldH` 分支直接触发 `onComplete` |
| `Scrollable.tsx` | 新增 `pinnedRef` + `scrollToBottom` 条件化 |
| `useSlotOrchestration.ts` | 移除 sync-in effect（反馈环）；timeline 重建前截断 `echoLines` 至 `totalLines` |
| `MainTerminal.tsx` | `clearEcho` 简化（不再操作外部 store）；`autoScrollKey` 改为监听 `echoLines?.length` 触发 |

## 关键设计决策

1. **scrollToBottom 不拆分为两个参数** — 所有调用方（`useAnimateHeight.onComplete`、`autoScrollKey`、命令式 ref）统一通过 `pinnedRef` 自动遵守"仅底部跟随"规则
2. **continue to use `useAnimateHeight` for scroll triggering** — 而非在业务代码中手动管理滚动时机；`useAnimateHeight` 已拥有 content height 变化的全部信息
3. **移除双向同步** — 命令输出走 Slot 管线后，`echoLines` 仅由 useSlotOrchestration 内部管理，外部 store 为只读镜像
