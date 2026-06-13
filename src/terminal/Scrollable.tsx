import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import './Scrollable.css'

// ============================================================
// 公共接口
// ============================================================

/** overlay render prop 接收的滚动状态 */
export interface ScrollOverlayState {
  canScrollUp: boolean
  canScrollDown: boolean
}

/** 通过 ref 暴露的命令式方法 */
export interface ScrollableHandle {
  scrollBy: (options: { top: number; behavior?: ScrollBehavior }) => void
  scrollToBottom: () => void
  getLineHeight: () => number
  getScrollElement: () => HTMLDivElement | null
}

// ============================================================
// Props
// ============================================================

interface ScrollableProps {
  /** 是否允许滚动（false 时 overflow: hidden，不捕获滚轮） */
  scrollable: boolean
  /** CSS max-height，如 "calc(6 * 1.6em)" */
  maxHeight: string
  /** 滚动内容 */
  children: ReactNode
  /** overlay render prop — 声明式接收滚动状态，返回 overlay ReactNode */
  overlay?: (state: ScrollOverlayState) => ReactNode
  /** 外部触发：值变化时自动滚动到底部 */
  autoScrollKey?: number
  /** 滚动事件回调（用于外部同步状态） */
  onScrollStateChange?: (state: ScrollOverlayState) => void
  className?: string
}

// ============================================================
// 组件
// 援引：
//   Radix UI ScrollArea — overlay + viewport 分层模式
//   CSS scrollbar-width: none — 隐藏原生滚动条
// ============================================================

const Scrollable = forwardRef<ScrollableHandle, ScrollableProps>(function Scrollable(
  {
    scrollable,
    maxHeight,
    children,
    overlay,
    autoScrollKey,
    onScrollStateChange,
    className = '',
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lineHeightRef = useRef(0)

  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  // ---- 滚动状态检测 ----
  const checkScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const st = el.scrollTop
    const ch = el.clientHeight
    const sh = el.scrollHeight
    // 内容高度 ≤ 容器高度时不可滚动
    if (sh <= ch) {
      setCanScrollUp(false)
      setCanScrollDown(false)
      onScrollStateChange?.({ canScrollUp: false, canScrollDown: false })
      return
    }
    // 用剩余可滚距离判断，阈值 1px 避免 sub-pixel 误触
    const distFromTop = st
    const distFromBottom = sh - st - ch
    const up = distFromTop > 1
    const down = distFromBottom > 1
    setCanScrollUp(up)
    setCanScrollDown(down)
    onScrollStateChange?.({ canScrollUp: up, canScrollDown: down })
  }, [onScrollStateChange])

  // ---- 命令式方法 ----
  const scrollBy = useCallback(
    (options: { top: number; behavior?: ScrollBehavior }) => {
      containerRef.current?.scrollBy({
        top: options.top,
        behavior: options.behavior ?? 'smooth',
      })
    },
    []
  )

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    // 下一帧复查（内容可能异步渲染）
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight
        checkScroll()
      }
    })
  }, [checkScroll])

  const getLineHeight = useCallback(() => {
    if (lineHeightRef.current > 0) return lineHeightRef.current
    const el = containerRef.current
    if (!el) return 18
    const lh = parseFloat(getComputedStyle(el).lineHeight)
    lineHeightRef.current = Number.isNaN(lh) ? 18 : lh
    return lineHeightRef.current
  }, [])

  const getScrollElement = useCallback(() => containerRef.current, [])

  useImperativeHandle(ref, () => ({
    scrollBy,
    scrollToBottom,
    getLineHeight,
    getScrollElement,
  }), [scrollBy, scrollToBottom, getLineHeight, getScrollElement])

  // ---- autoScrollKey 变化 → 滚到底部 ----
  useEffect(() => {
    if (autoScrollKey !== undefined && autoScrollKey > 0) {
      scrollToBottom()
    }
  }, [autoScrollKey, scrollToBottom])

  // ---- 初始渲染后检查滚动状态 ----
  useEffect(() => {
    checkScroll()
  }, [checkScroll])

  return (
    <div className={`scrollable-wrapper ${className}`}>
      <div
        ref={containerRef}
        className={`scrollable-content${scrollable ? ' scrollable' : ''}`}
        style={{ maxHeight }}
        onScroll={checkScroll}
      >
        {children}
      </div>
      {overlay && (
        <div className="scrollable-overlay" aria-hidden="true">
          {overlay({ canScrollUp, canScrollDown })}
        </div>
      )}
    </div>
  )
})

export default Scrollable
