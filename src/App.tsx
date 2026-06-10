import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import SceneCanvas from './r3f/Canvas'
import Act1OceanVoyage from './acts/Act1OceanVoyage'
import Act2GridTransition from './acts/Act2GridTransition'
import Act3ContentPhase from './acts/Act3ContentPhase'
import { useScrollStore } from './stores/scrollStore'
import { WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_START, GRID_SHIFT_START } from './r3f/ScrollRig'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

const SCROLL_VH = 15
const FRICTION = 0.955
const MAX_VELOCITY = 0.025

/**
 * App 根组件 — GSAP ScrollTrigger + 滚动物理 + DOM 叠加层。
 *
 * 原 App.vue 逻辑迁移：onWheel, onClick, ScrollTrigger, GSAP ticker。
 *
 * 援引：
 *   Codrops 2025 — GSAP ScrollTrigger + R3F 混合
 *   @gsap/react useGSAP — 自动 cleanup
 */
export default function App() {
  // ---- Zustand store ----
  const { scrollProgress, setScrollProgress } = useScrollStore()

  // ---- Physics state (refs — no re-render) ----
  const physRef = useRef({ target: 0, velocity: 0, lastScrollbar: 0, lastPhysics: 0, active: true })
  const clickTweenRef = useRef<gsap.core.Tween | null>(null)
  const focusTweenRef = useRef<gsap.core.Tween | null>(null)
  const lighthouseCapturedRef = useRef(false)
  const stRef = useRef<ScrollTrigger | null>(null)

  // ---- UI state (React — triggers re-render) ----
  const [hintVisible, setHintVisible] = useState(true)
  const [isClickPlaying, setIsClickPlaying] = useState(false)
  const [isAct3Focused, setIsAct3Focused] = useState(false)
  const [brandTextVisible, setBrandTextVisible] = useState(false)
  const overlayData = useScrollStore(s => s.overlayData)

  // ---- Act visibility ----
  const needsAct1 = (sp: number) => sp < GRID_START + 0.01
  const needsAct2 = (sp: number) => sp >= WHITE_OUT_THRESHOLD - 0.01 && sp < GRID_SHIFT_START + 0.01
  const needsAct3 = (sp: number) => sp >= GRID_SHIFT_START - 0.01

  // ---- syncScrollbar ----
  const syncScrollbar = useCallback(() => {
    const h = document.body.scrollHeight - window.innerHeight
    if (h > 0) window.scrollTo(0, physRef.current.target * h)
  }, [])

  // ---- ScrollTrigger (native scrollbar) ----
  useGSAP(() => {
    document.body.style.height = window.innerHeight * SCROLL_VH + 'px'

    stRef.current = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0,
      onUpdate: (self) => {
        if (Math.abs(self.progress - physRef.current.target) < 0.0005) return
        physRef.current.lastScrollbar = performance.now()
        physRef.current.velocity = 0
        physRef.current.target = self.progress
        setScrollProgress(self.progress)
        if (self.progress > 0.02 && hintVisible) setHintVisible(false)
      },
    })

    return () => { stRef.current?.kill() }
  }, [])

  // ---- GSAP physics ticker ----
  useEffect(() => {
    const ticker = () => {
      const p = physRef.current
      if (!p.active) return
      const now = performance.now()
      if (!p.lastPhysics) { p.lastPhysics = now; return }
      const dt = Math.min(0.1, (now - p.lastPhysics) / 1000)
      p.lastPhysics = now
      const dtFrames = dt * 60

      if (now - p.lastScrollbar < 80) return
      if (isClickPlaying) return

      p.target += p.velocity * dtFrames
      if (p.target <= 0) { p.target = 0; p.velocity = 0 }
      if (p.target >= 1) { p.target = 1; p.velocity = 0 }

      p.velocity *= Math.pow(FRICTION, dtFrames)
      if (Math.abs(p.velocity) < 0.00001) p.velocity = 0

      setScrollProgress(p.target)
      syncScrollbar()
    }
    gsap.ticker.add(ticker)
    return () => { gsap.ticker.remove(ticker) }
  }, [isClickPlaying, syncScrollbar])

  // ---- wheel handler ----
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (isAct3Focused) return
    if (isClickPlaying && clickTweenRef.current) {
      clickTweenRef.current.kill()
      clickTweenRef.current = null
      setIsClickPlaying(false)
    }
    const step = e.deltaY / (window.innerHeight * SCROLL_VH) * 0.65
    physRef.current.velocity += step
    physRef.current.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, physRef.current.velocity))
  }, [isAct3Focused, isClickPlaying])

  // ---- click fast-forward ----
  const onClick = useCallback(() => {
    if (isClickPlaying) return
    if (scrollProgress >= 0.995) return
    setIsClickPlaying(true)
    physRef.current.velocity = 0

    const tweenObj = { val: physRef.current.target }
    clickTweenRef.current = gsap.to(tweenObj, {
      val: 1.0,
      duration: 2,
      ease: 'power2.inOut',
      onUpdate: () => {
        physRef.current.target = tweenObj.val
        setScrollProgress(tweenObj.val)
        syncScrollbar()
      },
      onComplete: () => {
        setIsClickPlaying(false)
        clickTweenRef.current = null
      },
    })
  }, [isClickPlaying, scrollProgress, setScrollProgress, syncScrollbar])

  // ---- event listeners ----
  useEffect(() => {
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('click', onClick)
    }
  }, [onWheel, onClick])

  // ---- brand text visibility ----
  useEffect(() => {
    setBrandTextVisible(scrollProgress >= 0.70)
  }, [scrollProgress])

  // ---- cleanup ----
  useEffect(() => {
    return () => {
      physRef.current.active = false
      stRef.current?.kill()
      ScrollTrigger.getAll().forEach((t: ScrollTrigger) => t.kill())
      document.body.style.height = ''
    }
  }, [])

  const sp = scrollProgress

  return (
    <>
      <SceneCanvas>
        <Act1OceanVoyage visible={needsAct1(sp)} />
        <Act2GridTransition visible={needsAct2(sp)} />
        <Act3ContentPhase visible={needsAct3(sp)} />
      </SceneCanvas>

      {/* 滚动提示 */}
      {hintVisible && (
        <div className="scroll-hint" aria-hidden="true">
          <span>Scroll</span>
          <span className="click-hint">or click to skip</span>
          <div className="scroll-arrow" />
        </div>
      )}

      {/* 品牌文字 */}
      {brandTextVisible && (
        <div className="brand-text" aria-hidden="true">
          <div className="brand-text-row">
            <div className="brand-text-inner">
              <p className="brand-line-1">Personal Site</p>
              <p className="brand-line-2">By YeQuDesu</p>
            </div>
          </div>
        </div>
      )}

      {/* 聚焦 SVG 叠加层 */}
      {overlayData.focused && (
        <svg className="focus-overlay" width="100%" height="100%">
          {overlayData.star && (
            <circle cx={overlayData.star.x} cy={overlayData.star.y} r={overlayData.star.r + 10}
              fill="none" stroke="#64748b" strokeWidth={1} strokeDasharray="4 6" className="overlay-ring" />
          )}
          {overlayData.planet && (
            <circle cx={overlayData.planet.x} cy={overlayData.planet.y} r={overlayData.planet.r + 8}
              fill="none" stroke="#64748b" strokeWidth={1} strokeDasharray="4 6" className="overlay-ring" />
          )}
          {overlayData.tangents?.map((t: any, i: number) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke="#94a3b8" strokeWidth={0.5} className="overlay-line" />
          ))}
        </svg>
      )}

      {/* 页脚 */}
      <footer className="app-footer">
        <span>&copy; 2025 YeQuDesu · </span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">
          闽ICP备2026019172号-1
        </a>
      </footer>
    </>
  )
}
