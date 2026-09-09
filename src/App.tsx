import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import SceneCanvas from './r3f/Canvas'
import Act1OceanVoyage from './acts/Act1OceanVoyage'
import Act2GridTransition from './acts/Act2GridTransition'
import Act3ContentPhase from './acts/Act3ContentPhase'
import { useScrollStore } from './stores/scrollStore'
import { WHITE_OUT_THRESHOLD, GRID_START, GRID_SHIFT_START } from './r3f/ScrollRig'
import { getLighthouseCapture } from './actors/LighthouseCapture'
import MainTerminal from './MainTerminal'
import { executeCommand } from './terminal/commands'
import InfoPanelTerminal from './InfoPanelTerminal'
import FloatingLabels from './actors/FloatingLabels'
import BrandTitle from './actors/BrandTitle'
import type { LabelConfig, SequenceStrategy } from './behaviors/useFloatingLabels'
import { PLANET_LINKS } from './types'
import { useDayNight } from './theme/useDayNight'
import './theme/theme.css'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

const SCROLL_VH = 25
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
  const terminalMode = useScrollStore(s => s.terminalMode)
  const echoLines = useScrollStore(s => s.echoLines)
  const inputValue = useScrollStore(s => s.inputValue)
  const { handleThemeUpdate, themeKey } = useDayNight()

  // ---- Physics state (refs — no re-render) ----
  const physRef = useRef({ target: 0, velocity: 0, lastScrollbar: 0, lastPhysics: 0, active: true })
  const clickTweenRef = useRef<gsap.core.Tween | null>(null)
  const lighthouseCapturedRef = useRef(false)
  const stRef = useRef<ScrollTrigger | null>(null)

  // ---- UI state (React — triggers re-render) ----
  const [hintVisible, setHintVisible] = useState(true)
  const [isClickPlaying, setIsClickPlaying] = useState(false)
  const [lighthouseImage, setLighthouseImage] = useState<string | null>(null)
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
  const isAct3Focused = focusedPlanetIdx >= 0 && scrollProgress >= GRID_SHIFT_START
  const isTerminalActive = terminalMode === 'active'

  // ---- Act visibility ----
  // Act 1 扩展到 GRID_SHIFT_START(0.85)：波浪展平后需与 Act2 竖线共存形成网格，
  // Act3 开始后波浪自行通过 gridOpacityMult 淡出
  const needsAct1 = (sp: number) => sp < GRID_SHIFT_START + 0.01
  const needsAct2 = (sp: number) => sp >= WHITE_OUT_THRESHOLD - 0.01
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
    if (isTerminalActive) return
    if (isAct3Focused) return
    if (isClickPlaying && clickTweenRef.current) {
      clickTweenRef.current.kill()
      clickTweenRef.current = null
      setIsClickPlaying(false)
    }
    const step = e.deltaY / (window.innerHeight * SCROLL_VH) * 0.65
    physRef.current.velocity += step
    physRef.current.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, physRef.current.velocity))
  }, [isTerminalActive, isAct3Focused, isClickPlaying])

  // ---- click fast-forward ----
  const onClick = useCallback(() => {
    if (isTerminalActive) return
    if (isClickPlaying) return
    if (isAct3Focused) return  // block fast-forward during planet focus
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
  }, [isTerminalActive, isClickPlaying, isAct3Focused, scrollProgress, setScrollProgress, syncScrollbar])

  // ---- event listeners ----
  useEffect(() => {
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('click', onClick)
    }
  }, [onWheel, onClick])

  // ---- lighthouse screenshot ----
  useEffect(() => {
    // theme 切换时清除缓存，触发重新烘焙
    lighthouseCapturedRef.current = false
  }, [themeKey])

  useEffect(() => {
    if (scrollProgress >= 0.54 && !lighthouseCapturedRef.current) {
      lighthouseCapturedRef.current = true
      const captureFn = getLighthouseCapture()
      if (captureFn) {
        const img = captureFn()
        if (img) setLighthouseImage(img)
      }
    }
  }, [scrollProgress, themeKey])

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

  // ---- Terminal callbacks ----
  const handleModeChange = useCallback((m: typeof terminalMode) => {
    useScrollStore.getState().setTerminalMode(m)
  }, [])
  const handleEchoLinesChange = useCallback((lines: string[]) => {
    useScrollStore.setState({ echoLines: lines })
  }, [])
  const handleInputChange = useCallback((v: string) => {
    useScrollStore.getState().setInputValue(v)
  }, [])
  const handleCommand = useCallback((input: string) => executeCommand(input), [])
  const labelConfigs: [LabelConfig, LabelConfig, LabelConfig] = PLANET_LINKS.map(
    (link, i) => ({
      trackIdx: i as 0 | 1 | 2,
      planetLink: link,
      maxEchoLines: 2,
    }),
  ) as [LabelConfig, LabelConfig, LabelConfig]
  const handleBuildStatusLine = useCallback((sp: number) => {
    const pct = Math.round(sp * 100)
    const actName = sp < 0.45 ? 'OceanVoyage' : sp < 0.85 ? 'GridTransition' : 'ContentPhase'
    const actNum = sp < 0.45 ? '1' : sp < 0.85 ? '2' : '3'
    return `# Act ${actNum} · ${actName} · scroll ${pct}%`
  }, [])

  return (
    <>
      <SceneCanvas>
        <Act1OceanVoyage visible={needsAct1(sp)} />
        <Act2GridTransition visible={needsAct2(sp)} />
        <Act3ContentPhase visible={needsAct3(sp)} />
      </SceneCanvas>

      <MainTerminal
        mode={terminalMode}
        echoLines={echoLines}
        inputValue={inputValue}
        onModeChange={handleModeChange}
        onEchoLinesChange={handleEchoLinesChange}
        onInputValueChange={handleInputChange}
        scrollProgress={sp}
        buildStatusLine={handleBuildStatusLine}
        onThemeUpdate={handleThemeUpdate}
        themeKey={themeKey}
        onCommand={handleCommand}
      />

      {/* Info Panel Terminal — 仅 Act 3 (ContentPhase) 渲染 */}
      {needsAct3(sp) && <InfoPanelTerminal />}

      {/* Planet Labels — 仅 Act 3 可见，组件不卸载 */}
      {needsAct3(sp) && (
        <FloatingLabels
          configs={labelConfigs}
          sequenceStrategy="proximity"
          staggerDelay={200}
          exitTimeout={15000}
          collapsedWidth={60}
          expandedWidth={200}
          collapsedHeight={36}
          expandedHeight={44}
          pbdParams={{
            anchorRangeRadius: 70,
            gap: 16,
          }}
        />
      )}

      {/* 滚动提示 */}
      {hintVisible && (
        <div className="scroll-hint" aria-hidden="true">
          <span>Scroll</span>
          <span className="click-hint">or click to skip</span>
          <div className="scroll-arrow" />
        </div>
      )}

      {/* 品牌标题（Act 2-3） */}
      <BrandTitle
        scrollProgress={sp}
        lighthouseImage={lighthouseImage}
        isClickPlaying={isClickPlaying}
        isFocused={isAct3Focused}
      />

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
