# Slot 编排调试记录：轮询失效、rolling 丢行、滚动闪烁

> 日期：2026-06-16
> 标签：debug, TerminalBar, Slot, GSAP, React, useEffect

## 背景

TerminalBar Slot 模式重构后，GSAP Timeline 负责时间编排（`appearAfter` 依赖解析），定时轮询由 `useEffect` + `setInterval` 驱动。

## 现象

三个回归：

1. **Section 不再刷新**：行星坐标初始显示后，后续不再更新
2. **ContentLine rolling 丢行**：ring-0 显示后，下一轮 ring-1 出现时 ring-0 消失，未呈现"由上往下"的逐行累积
3. **滚动闪烁**：内容达到 `maxEchoLines` 后，每次 rolling 更新时终端轻微闪烁

---

## 案例一：Section 轮询失效

### 根因

```typescript
// 轮询 effect
useEffect(() => {
  for (const slot of slots) {
    if (pollRef.current.has(slot.name)) continue  // ← BUG
    // ... 创建 timer
    pollRef.current.set(slot.name, timer)
  }
  return () => {
    pollRef.current.forEach(t => clearInterval(t))  // 清除 timer
    // ⚠️ 未清除 Map 条目！
  }
}, [slots, echoLines.length])
```

**时序分析：**

1. planets 激活 → `reserveLines` 改变 `echoLines.length` → effect 触发
   - 创建 planets timer → `pollRef.current.set('planets', timer1)`
2. orbits 激活 → `reserveLines` 追加行 → `echoLines.length` 再次变化 → effect 重跑
   - **cleanup**：`clearInterval(timer1)` — planets timer 被杀
   - **新 effect**：`pollRef.current.has('planets')` → **true**（Map 条目残留）
   - → `continue` 跳过 → planets 永不再创建 timer ✗

### 修复

effect 开头清理 Map，不依赖残留条目跳过：

```typescript
useEffect(() => {
  pollRef.current.forEach(t => clearInterval(t))
  pollRef.current.clear()  // ← 清空 Map
  for (const slot of slots) {
    // 不再需要 has() 检查，因为 Map 已清空
    // ...
  }
}, [slots, echoLines.length])
```

---

## 案例二：ContentLine rolling 丢行

### 根因

ContentLine 配置 `lineCount=2, overflow: rolling`，但 `getLine()` 每次只返回 **1 行**。

初始激活时 `reserveLines` 分配 2 行空位，仅写入 1 行内容。首轮 rolling 的 shift 操作用**空字符串覆盖**了第一行：

```
激活时：  echoLines[4]='ring-0', echoLines[5]=''
750ms：   shift → next[4] = next[5] = ''   ← 空串覆盖了 ring-0
          next[5] = 'ring-1'
结果：    ['', 'ring-1']  ← ring-0 永久丢失
```

### 修复

改用累积缓冲区。`getLine()` 返回的新行 push 到 buffer，满 `lineCount` 后开始 FIFO shift，不足时尾部留空：

```
t=0:    buffer=['ring-0']              → 显示 ['ring-0', '']
t=750:  buffer=['ring-0','ring-1']     → 显示 ['ring-0', 'ring-1']
t=1500: buffer=['ring-0','ring-1','ring-2'] → shift → ['ring-1','ring-2']
t=2250: shift → ['ring-2','ring-0']
```

---

## 案例三：滚动闪烁（分析，暂缓修复）

### 根因

`setInterval` 回调中 `setEchoLines(新数组)` → React re-render → 文本内容变化（ring-0→ring-1）。

`Scrollable.checkScroll` 在每次 render 时评估滚动状态。内容达到 `maxEchoLines` 后 `scrollHeight ≈ clientHeight`，1px 以内的像素宽度差异即导致 `canScrollUp`/`canScrollDown` 状态翻转 → overlay ▲/▼ opacity 切换 → 视觉闪烁。

### 拟议修复

`checkScroll` 阈值从 1px 提升至 3-5px，避免 sub-pixel 文本渲染差异触发状态变化。
