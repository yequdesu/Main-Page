import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './debug/GeometricDemo.css'

const DURATION = 0.7
const MOTION_DURATION = 0.5
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t) }
const mix = (a: number, b: number, t: number) => a + (b - a) * t

function starPath(morph: number) {
  const a = mix(0.55228475, 0.008, morph)
  const b = mix(1, 0.035, morph)
  const rotate = (x: number, y: number, quadrant: number) => {
    const angle = quadrant * Math.PI / 2
    return `${x * Math.cos(angle) - y * Math.sin(angle)},${x * Math.sin(angle) + y * Math.cos(angle)}`
  }
  let path = 'M0,-1'
  for (let i = 0; i < 4; i++)
    path += ` C${rotate(a, -b, i)} ${rotate(b, -a, i)} ${rotate(1, 0, i)}`
  return path + ' Z'
}

function Demo() {
  const path = useRef<SVGPathElement>(null)
  const group = useRef<SVGGElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const phase = useRef<HTMLSpanElement>(null)
  const runtime = useRef({ time: 0, playing: true, loop: true })
  const [playing, setPlaying] = useState(true)
  const [loop, setLoop] = useState(true)
  const render = (t: number) => {
    const p = clamp(t / MOTION_DURATION)
    // Separate continuous envelopes: restrained rotation and a tighter collapse.
    const rotationProgress = Math.expm1(3 * p) / Math.expm1(3)
    const collapseProgress = Math.expm1(8 * p) / Math.expm1(8)
    const size = 190 * (1 - collapseProgress)
    const rotation = 10 * Math.min(t, MOTION_DURATION) + 100 * rotationProgress
    const morph = smooth((t - 0.018) / 0.063)
    path.current?.setAttribute('d', starPath(morph))
    group.current?.setAttribute('transform', `rotate(${rotation}) scale(${size})`)
    if (bar.current) bar.current.style.transform = `scaleX(${clamp(t / DURATION)})`
    if (phase.current) phase.current.textContent = t < 0.018 ? '01 / 圆形出现' :
      t < 0.081 ? '02 / 内凹形变' : t < MOTION_DURATION ? '03 / 指数加速收束' : '04 / 完成'
  }
  useEffect(() => {
    render(0)
    let raf = 0, previous = performance.now()
    const frame = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05)
      previous = now
      const state = runtime.current
      if (state.playing) {
        state.time += dt
        if (state.time > DURATION) {
          if (state.loop) state.time = 0
          else { state.time = DURATION; state.playing = false; setPlaying(false) }
        }
      }
      render(state.time)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <main className="geometry-demo">
    <header><span>GEOMETRY STUDY / 001</span><span ref={phase} /></header>
    <svg viewBox="-400 -400 800 800" aria-label="圆形内凹为四芒星并旋转缩小">
      <g ref={group}><path ref={path} fill="#f6f7fa" /></g>
    </svg>
    <footer>
      <div className="geometry-progress"><div ref={bar} /></div>
      <nav>
        <button onClick={() => { runtime.current.time = 0; runtime.current.playing = true; setPlaying(true) }}>重播</button>
        <button onClick={() => { runtime.current.playing = !runtime.current.playing; setPlaying(runtime.current.playing) }}>{playing ? '暂停' : '播放'}</button>
        <label><input type="checkbox" checked={loop} onChange={e => { runtime.current.loop = e.target.checked; setLoop(e.target.checked) }} />循环</label>
        <span>动画 0.5s · 循环间隔 0.2s</span>
      </nav>
    </footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<Demo />)
