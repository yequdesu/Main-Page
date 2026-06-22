import { useRef, useLayoutEffect, useEffect } from 'react'

// ============================================================
// useAnimateHeight — 内容高度变化时 CSS transition 动画过渡
//
// 使用 CSS transition + offsetHeight 标准模式：
//   offsetHeight 强制浏览器在 height=oldH 处计算布局快照，
//   使后续 height=newH 被识别为属性变更 → 触发 CSS transition。
//   这是 JS 触发 CSS transition 的唯一可靠方式。
//
//   animatingRef 合并连续增长：
//   多次 push 时仅更新 height 目标值而不重设 transition，
//   确保视觉上呈现"内容持续推送"的流畅感。
//
// 场景：
//   GROW 无动画运行中 → lock oldH + 新 transition
//   GROW 动画运行中   → 仅改 height 目标值（transition 自然转向）
//   SHRINK            → 始终 lock oldH + 新 transition
//   行数不变（Phase 2）→ 仅更新 prevHeightRef，不触发动画
//
// 援引：
//   CSS transition + offsetHeight — JS→CSS transition 标准触发方式
//   CSS ease = cubic-bezier(0.25, 0.1, 0.25, 1.0)
//   useLayoutEffect — 同步执行避免 DOM→动画间的 paint flash
// ============================================================

interface AnimateHeightOptions {
  /** 每行变化对应的动画时长（秒），默认 0.3 */
  durationPerLine?: number
  /** 动画完成后的回调（如 scrollToBottom） */
  onComplete?: () => void
}

export function useAnimateHeight(
  getElement: () => HTMLElement | null | undefined,
  items: readonly unknown[],
  options: AnimateHeightOptions = {},
): void {
  const lineCount = items.length
  const prevLineCount = useRef(lineCount)
  const prevHeightRef = useRef(0)
  const animatingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ref 存储回调/参数，避免放入 useLayoutEffect 依赖数组
  const getElRef = useRef(getElement)
  getElRef.current = getElement
  const optsRef = useRef(options)
  optsRef.current = options

  useLayoutEffect(() => {
    const el = getElRef.current()
    if (!el) return

    const { durationPerLine = 0.3, onComplete } = optsRef.current

    const prev = prevLineCount.current
    const curr = lineCount
    prevLineCount.current = curr

    const newH = el.scrollHeight
    const oldH = prevHeightRef.current

    // ---- SHRINK / GROW ----
    let animating = false
    let lineDelta = 0

    if (curr < prev && oldH > 0 && newH < oldH) {
      animating = true
      lineDelta = prev - curr
      animatingRef.current = true
      el.style.overflow = 'hidden'
      el.style.height = oldH + 'px'
      el.style.transition = `height ${(lineDelta * durationPerLine)}s ease`
      el.offsetHeight
      el.style.height = newH + 'px'
    } else if (curr > prev && oldH > 0) {
      animating = true
      lineDelta = curr - prev
      if (!animatingRef.current) {
        animatingRef.current = true
        el.style.overflow = 'hidden'
        el.style.height = oldH + 'px'
        el.style.transition = `height ${durationPerLine}s ease`
        el.offsetHeight
        el.style.height = newH + 'px'
      } else {
        el.style.height = newH + 'px'
      }
    } else if (curr === prev && oldH > 0 && newH !== oldH && !animatingRef.current) {
      // 行数不变但 scrollHeight 变化（内容填充致高度增减）→ 直接滚动
      onComplete?.()
    }

    if (animating) {
      // ---- 仅在启动 transition 时注册清理回调 ----
      const cleanup = () => {
        el.style.height = ''
        el.style.transition = ''
        el.style.overflow = ''
        animatingRef.current = false
        el.removeEventListener('transitionend', cleanup)
        if (timerRef.current) clearTimeout(timerRef.current)
        onComplete?.()
      }
      el.addEventListener('transitionend', cleanup, { once: true })
      timerRef.current = setTimeout(
        cleanup,
        (lineDelta * durationPerLine) * 1000 + 200,
      )
    }

    prevHeightRef.current = el.scrollHeight
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [items])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      const el = getElRef.current()
      if (el) {
        el.removeEventListener('transitionend', () => {})
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }
  }, [])
}
