import { useEffect, useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { smoothstep } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { useActorRuntime } from '../composition/actorRuntime'
import { useEffectScope } from '../composition/effectScope'
import { useScrollStore } from '../stores/scrollStore'
import './BrandTitle.css'

// ============================================================
// BrandTitle �?品牌标题 DOM 叠加�?
//
// �?App.tsx 抽离，独立维护。内部拆分为 BrandIcon（灯塔截图）
// �?BrandText（主/副标题文字）�?
//
// 全部滚动进度完成（sp = 1）后出现，行星聚焦时 GSAP 淡出
// 期间向上位移 -90px 腾出空间，行星聚焦时 GSAP 淡出�?
// ============================================================

// ---- 时间常量（与动画排轴无关，仅用于样式计算�?----

/** line1（主标题 + icon）淡入区间终�?*/
const LINE_1_FADE_END = 0.82
/** line2（副标题）淡入区间起�?*/
const LINE_2_FADE_START = 0.82
/** line2 淡入区间终点 */
const LINE_2_FADE_END = 0.92
/** grid shift 期间文字上移总量（px�?*/
const TEXT_OFFSET_MAX = -90

// ============================================================
// Props
// ============================================================

export interface BrandTitleProps {
  scrollProgress: number
  /** 灯塔截图 data URL，null 时隐藏图�?*/
  lighthouseImage: string | null
  /** 点击快进期间禁用 CSS transition */
  isClickPlaying: boolean
}

// ============================================================
// BrandIcon �?灯塔截图
// ============================================================

const BrandIcon = ({ src, opacity }: { src: string | null; opacity: number }) => {
  if (!src) return null
  return (
    <img src={src} alt="" className="brand-title-icon" style={{ opacity }} />
  )
}

// ============================================================
// BrandText �?�?副标�?
// ============================================================

const BrandText = ({
  line1Opacity,
  line2Opacity,
}: {
  line1Opacity: number
  line2Opacity: number
}) => (
  <div className="brand-title-text">
    <p className="brand-title-main" style={{ opacity: line1Opacity }}>
      Personal Site
    </p>
    <p className="brand-title-sub" style={{ opacity: line2Opacity }}>
      By YeQuDesu
    </p>
  </div>
)

// ============================================================
// BrandTitle �?容器组件
// ============================================================

export default function BrandTitle({
  scrollProgress,
  lighthouseImage,
  isClickPlaying,
}: BrandTitleProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const completionRef = useRef<HTMLDivElement | null>(null)
  const focusTweenRef = useRef<gsap.core.Tween | null>(null)
  const completionTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const effectScope = useEffectScope('brandTitle')
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)

  // ---- 显示控制：仅在全部滚动进度完成时显示 ----
  const sp = scrollProgress
  const visible = sp >= TIMELINE.act3ContentPhase.end - 0.000001
  const isFocused = focusedPlanetIdx >= 0 && sp >= TIMELINE.act3Shift.start
  useActorRuntime('brandTitle', visible && !isFocused)

  // ---- line1 / icon 淡入（smoothstep, 0.70 �?0.82�?----
  const line1T = Math.max(0, Math.min(1, (sp - TIMELINE.brandTitle.start) / (LINE_1_FADE_END - TIMELINE.brandTitle.start)))
  const line1Opacity = smoothstep(line1T)

  // ---- line2 淡入（smoothstep, 0.82 �?0.92�?----
  const line2T = Math.max(0, Math.min(1, (sp - LINE_2_FADE_START) / (LINE_2_FADE_END - LINE_2_FADE_START)))
  const line2Opacity = smoothstep(line2T)

  // ---- grid shift 文字位移 ----
  let textOffsetY = 0
  if (sp >= TIMELINE.act3Shift.start) {
    const t = (sp - TIMELINE.act3Shift.start) / (1.0 - TIMELINE.act3Shift.start)
    textOffsetY = TEXT_OFFSET_MAX * smoothstep(t)
  }

  // ---- 100% 触发的渐入渐出：离开 100% 时从当前进度反向播放 ----
  useLayoutEffect(() => {
    const el = completionRef.current
    if (!el) return

    gsap.set(el, { opacity: 0 })
    const timeline = gsap.timeline({ paused: true })
      .to(el, {
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out',
      })
    completionTimelineRef.current = timeline

    return () => {
      timeline.kill()
      completionTimelineRef.current = null
    }
  }, [])

  useEffect(() => {
    const timeline = completionTimelineRef.current
    if (!timeline) return
    if (visible) timeline.play()
    else timeline.reverse()
  }, [visible])

  // ---- 行星聚焦：GSAP 淡出 ----
  useEffect(() => {
    if (focusTweenRef.current) focusTweenRef.current.kill()
    effectScope.cancel('replace focus tween')

    const el = rootRef.current
    if (!el) return

    focusTweenRef.current = effectScope.addTween(gsap.to(el, {
      opacity: isFocused ? 0 : 1,
      marginTop: isFocused ? -24 : 0,
      duration: 0.5,
      ease: 'power2.out',
      overwrite: 'auto',
    }))
  }, [effectScope, isFocused])

  // ---- cleanup ----
  useEffect(() => {
    return () => {
      focusTweenRef.current?.kill()
      effectScope.cancel('unmount')
    }
  }, [effectScope])

  return (
    <div
      ref={rootRef}
      className={`brand-title${isClickPlaying ? ' no-transition' : ''}`}
      aria-hidden="true"
      style={{ '--text-offset-y': `${textOffsetY}px` } as React.CSSProperties}
    >
      <div ref={completionRef} className="brand-title-content">
        <div className="brand-title-row">
          <BrandIcon src={lighthouseImage} opacity={line1Opacity} />
          <BrandText line1Opacity={line1Opacity} line2Opacity={line2Opacity} />
        </div>
      </div>
    </div>
  )
}

export { BrandIcon, BrandText }
