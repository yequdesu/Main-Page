# 当前会话交接

> 日期：2026-06-18
> 分支：`Editor-CyDlen-$-Terminal-Bar`

## 当前状态

TerminalBar 抽象化重构已完成。day/night 主题系统已实现：三层同步过渡（CSS 静态元素 + 3D Scene 背景 + Terminal 颜色），GSAP 0.6s crossfade。useEchoSequence 已废弃删除。**构建通过，34 测试通过。**

## 架构

```
App.tsx ── MainTerminal (布局/字体/welcome/status + / 键激活 + onThemeUpdate) ── TerminalBar (纯引擎)
          InfoPanelTerminal (信息面板 + planet/orbit slots) ── TerminalBar (纯引擎)
          useDayNight() → handleThemeUpdate → TerminalBar + Scene

src/theme/
  theme.css          CSS 主题配置（:root + [data-theme="day"]）
  palettes.ts        色板常量 + lerp/scroll/blend 纯函数
  useDayNight.ts     Hook：store 订阅 → GSAP blend → handleThemeUpdate
```

## 近期变更清单

| 文件 | 状态 | 说明 |
|------|:---:|------|
| `src/theme/theme.css` | **新建** | CSS 变量：night/day 双主题 `--color-*` + `--tw-*` 初始值 |
| `src/theme/palettes.ts` | **新建** | 4 色板常量 + lerp/scroll/blend 函数（从 App.tsx 剥离） |
| `src/theme/useDayNight.ts` | **新建** | Hook：data-theme 写入 + GSAP blend tween + handleThemeUpdate |
| `src/stores/scrollStore.ts` | 修改 | 新增 `dayNight` 状态 + `setDayNight` / `toggleDayNight` |
| `src/terminal/commands.ts` | 修改 | day/night handler 对接 store |
| `src/App.tsx` | 修改 | 移除 ~100 行主题代码 + WHITE_OUT_END import；一行 `useDayNight()` |
| `src/App.css` | 修改 | 8 处硬编码颜色 → `var(--color-*)` |
| `src/terminal/TerminalBar.css` | 修改 | glass 背景 → `var(--tw-glass-bg, fallback)` |
| `src/r3f/ScrollRig.ts` | 修改 | 新增 `setThemeBlend()` + `_themeBlend` 模块级变量 |
| `src/r3f/ScrollInvalidator.tsx` | 修改 | 签名简化 |
| `src/terminal/useEchoSequence.ts` | **删除** | 已废弃，能力由 Slot 管线 + useTypewriter + GSAP 覆盖 |
| `src/ExperimentTerminal.tsx` | 重命名 | → `InfoPanelTerminal.tsx` |
| `docs/theme/` | **新建** | design.md + operation-guide.md + maintenance-guide.md |

## 交互模型

| 终端实例 | 激活方式 |
|----------|----------|
| **TerminalBar**（引擎） | click to toggle（唯一内置交互） |
| **MainTerminal** | click + `/` 键激活 |
| **InfoPanelTerminal** | click only |

## 主题切换模型

| 命令 | 效果 |
|------|------|
| `day` / `light` | 切换到日间模式（三层同步过渡 0.6s） |
| `night` / `dark` | 切换到夜间模式（默认） |

三层过渡：CSS `[data-theme]` 选择器（body、footer、scroll hint）+ GSAP blend → scene 背景 + Terminal `--tw-*` crossfade。

## 已解决的已知风险

1. ~~命令输出回显~~ — `useEchoSequence` 已删除，当前 GSAP `rows: 'lineByLine'` 方案满足需求
2. ~~`typewriterDone` store 死字段~~ — 确认 `useSlotOrchestration` 内部使用 `useTypewriterGate` 的本地状态，`scrollStore.typewriterDone` 是死字段但影响面小，暂不清理
3. ~~`useCommandSystem` deps 对象~~ — 影响面小，无功能问题

## 遗留技术债务

| 问题 | 优先级 |
|------|:---:|
| `scrollStore.typewriterDone` + `useTerminalState.ts` 死代码 | 🟢 低 |
| `useCommandSystem` deps 每帧重建 | 🟢 低 |
| 主题选择刷新丢失（Zustand 内存，无 localStorage 持久化） | 🟡 中 |

## 文档索引

| 文档 | 路径 |
|------|------|
| 主题设计 | [`docs/theme/design.md`](docs/theme/design.md) |
| 主题操作 | [`docs/theme/operation-guide.md`](docs/theme/operation-guide.md) |
| 主题维护 | [`docs/theme/maintenance-guide.md`](docs/theme/maintenance-guide.md) |
| 终端操作 | [`docs/terminal/operation-guide.md`](docs/terminal/operation-guide.md) |
| 终端维护 | [`docs/terminal/maintenance-guide.md`](docs/terminal/maintenance-guide.md) |
| 终端规格 | [`docs/terminal/specification.md`](docs/terminal/specification.md) |
| 维护手册 | [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) |
