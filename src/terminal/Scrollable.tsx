import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useEffectScope } from '../composition/effectScope'
import './Scrollable.css'

export interface ScrollOverlayState {
  canScrollUp: boolean
  canScrollDown: boolean
}

export interface ScrollableHandle {
  scrollBy: (options: { top: number; behavior?: ScrollBehavior }) => void
  scrollToBottom: () => void
  getLineHeight: () => number
  getScrollElement: () => HTMLDivElement | null
}

interface ScrollableProps {
  scrollable: boolean
  maxHeight: string
  children: ReactNode
  overlay?: (state: ScrollOverlayState) => ReactNode
  autoScrollKey?: number
  onScrollStateChange?: (state: ScrollOverlayState) => void
  className?: string
}

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
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lineHeightRef = useRef(0)
  const pinnedRef = useRef(true)
  const id = useId()
  const scope = useEffectScope(`terminal.scrollable.${id}`)

  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  const checkScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    const st = el.scrollTop
    const ch = el.clientHeight
    const sh = el.scrollHeight
    if (sh <= ch) {
      setCanScrollUp(false)
      setCanScrollDown(false)
      onScrollStateChange?.({ canScrollUp: false, canScrollDown: false })
      return
    }

    const distFromBottom = sh - st - ch
    const up = st > 1
    const down = distFromBottom > 1
    pinnedRef.current = distFromBottom <= 1
    setCanScrollUp(up)
    setCanScrollDown(down)
    onScrollStateChange?.({ canScrollUp: up, canScrollDown: down })
  }, [onScrollStateChange])

  const scrollBy = useCallback((options: { top: number; behavior?: ScrollBehavior }) => {
    containerRef.current?.scrollBy({
      top: options.top,
      behavior: options.behavior ?? 'smooth',
    })
  }, [])

  const scrollToBottom = useCallback(() => {
    if (!pinnedRef.current) return
    const el = containerRef.current
    if (!el) return

    el.scrollTop = el.scrollHeight
    scope.requestAnimationFrame(() => {
      if (!pinnedRef.current) return
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight
        checkScroll()
      }
    })
  }, [checkScroll, scope])

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

  useEffect(() => {
    if (autoScrollKey !== undefined && autoScrollKey > 0) {
      scrollToBottom()
    }
  }, [autoScrollKey, scrollToBottom])

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
