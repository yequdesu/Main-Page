# Planet-Label Fitting-Width 跨浏览器调试

**日期**: 2026-06-22

## 问题

折叠态 label 在 typewriter 完成后自动收缩宽度。Chrome 中宽度正确，Safari 中偏窄（如 "FS" 在 Chrome 为 30px，Safari 为 25px）。

## 调试过程

### 阶段 1: Canvas 硬编码字体

```ts
ctx.font = "0.58rem 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace"
ctx.measureText(text).width
```

| Label | Chrome | Safari | 差异 |
|-------|--------|--------|------|
| FS | 11.42px | 6.96px | -39% |
| Code | 22.84px | 13.92px | -39% |
| GitHub | 34.26px | 20.88px | -39% |

**根因**: Safari 的 Core Text 与 Chrome 的 HarfBuzz 对相同 font stack 的字形度量不一致。Canvas `font` 属性接收的是一个字符串，浏览器按自己的字体匹配逻辑选择实际字型。

### 阶段 2: DOM `.echo-prefix` 选择器

```ts
pill.querySelector('.echo-prefix').scrollWidth
```

**结果**: `domW = 0`（两浏览器均失败）。

**根因**: `.echo-prefix` class 仅在 typewriter _进行中_ 存在。`onModeChange('idle')` 触发时已完成 typing→echo 过渡，DOM 结构变为 `<span>FS</span>`（无 class）。

### 阶段 3: `.terminal-echo > span` 选择器

```ts
pill.querySelector('.terminal-echo > span:first-child')
```

**结果**: Chrome 中 `domW = 0`。span 存在但 `scrollWidth` 在 Chrome 中返回 0（inline 元素的 scrollWidth 行为不一致）。

### 阶段 4: `.terminal-echo` 容器 scrollWidth

```ts
pill.querySelector('.terminal-echo').scrollWidth
```

**结果**: `domW = 48`（所有 label 相同）。

**根因**: `.terminal-echo` 是 pill 的子容器，`scrollWidth` 返回容器固定宽度（60px pill − 12px padding = 48px），而非文本内容宽度。

### 阶段 5: ✅ `getBoundingClientRect()` + computed font fallback

```ts
const firstSpan = pill.querySelector('.terminal-echo').firstElementChild
const domW = firstSpan.getBoundingClientRect().width

// Fallback：使用元素 actual computed font
ctx.font = getComputedStyle(firstSpan).font
```

**结果**:

| Label | Chrome domW | Safari domW | fitW 差异 |
|-------|-------------|-------------|-----------|
| FS | 11.42px | 11.17px | 30 vs 30 |
| Code | 22.84px | 22.35px | 41 vs 41 |
| GitHub | 34.27px | 33.52px | 53 vs 52 |

`getBoundingClientRect()` 不受 inline/block 限制，返回元素的实际渲染矩形宽度。Canvas fallback 使用 `getComputedStyle(el).font`（而非硬编码 font stack），确保与浏览器实际渲染字型一致。

## 关键教训

1. **不要用 Canvas `font` 字符串硬编码字体栈**。不同 OS/浏览器的字体匹配逻辑不同，`measureText` 结果可能有 40% 偏差。如需 Canvas 测量，应使用 `getComputedStyle(domEl).font`。
2. **`scrollWidth` 对 inline 元素不可靠**。跨浏览器行为不一致。
3. **注意 typewriter 状态机的 DOM 结构变化**。`.echo-prefix` 仅在 typing 阶段存在，完成后变为无 class 的 `<span>`。
4. **`getBoundingClientRect().width` 是最可靠的文本宽度测量方式**。它返回元素的实际渲染盒模型宽度，与布局引擎直接关联，跨浏览器一致。

## 最终公式

```
domW = span.getBoundingClientRect().width
fitW = clamp(ceil(domW + 18), 24, 60)
```

`+18` = 左右 padding (12px) + 圆角/留白余量 (6px)。
