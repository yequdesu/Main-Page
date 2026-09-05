import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './debug/GeometricDemo.css'

const MOTION_DURATION = 0.5
const COUNT = 20
const INTERVAL = 0.085
const DURATION = (COUNT - 1) * INTERVAL + MOTION_DURATION + 0.35
const EMITTERS = Array.from({ length: COUNT }, (_, index) => {
  const u = index / (COUNT - 1)
  // Logarithmic rise: steep near the viewer, flattening toward the distance.
  // Compress spacing along with size, like perspective foreshortening.
  const x = (1 - Math.exp(-1.6 * u)) / (1 - Math.exp(-1.6))
  return {
    x: -260 + 550 * x,
    y: 230 - 440 * Math.log1p(12 * x) / Math.log(13),
    radius: 85 * Math.exp(-2.8 * u),
    start: index * INTERVAL,
  }
})
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
  const paths = useRef<(SVGPathElement | null)[]>([])
  const groups = useRef<(SVGGElement | null)[]>([])
  const bar = useRef<HTMLDivElement>(null)
  const phase = useRef<HTMLSpanElement>(null)
  const runtime = useRef({ time: 0, playing: true, loop: true })
  const [playing, setPlaying] = useState(true)
  const [loop, setLoop] = useState(true)
  const render = (t: number) => {
    EMITTERS.forEach((emitter, index) => {
    const age = t - emitter.start
    const group = groups.current[index]
    if (!group) return
    const active = age >= 0 && age < MOTION_DURATION
    group.setAttribute('visibility', active ? 'visible' : 'hidden')
    if (!active) return
    const p = clamp(age / MOTION_DURATION)
    // Separate continuous envelopes: restrained rotation and a tighter collapse.
    const rotationProgress = Math.expm1(3 * p) / Math.expm1(3)
    const collapseProgress = Math.expm1(8 * p) / Math.expm1(8)
    const size = emitter.radius * (1 - collapseProgress)
    const rotation = 10 * age + 100 * rotationProgress
    const morph = smooth((age - 0.018) / 0.063)
    paths.current[index]?.setAttribute('d', starPath(morph))
    group.setAttribute('transform', `translate(${emitter.x} ${emitter.y}) rotate(${rotation}) scale(${size})`)
    })
    if (bar.current) bar.current.style.transform = `scaleX(${clamp(t / DURATION)})`
    if (phase.current) phase.current.textContent = t < EMITTERS[COUNT - 1].start + MOTION_DURATION
      ? 'LOG CURVE / 近 → 远' : '完成'
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
    <header><span>GEOMETRY STUDY / 002</span><span ref={phase} /></header>
    <svg viewBox="-400 -400 800 800" aria-label="四芒星沿对数曲线从近到远依次出现消失">
      {EMITTERS.map((_, index) => <g key={index} visibility="hidden"
        ref={node => { groups.current[index] = node }}>
        <path ref={node => { paths.current[index] = node }} fill="#f6f7fa" />
      </g>)}
    </svg>
    <footer>
      <div className="geometry-progress"><div ref={bar} /></div>
      <nav>
        <button onClick={() => { runtime.current.time = 0; runtime.current.playing = true; setPlaying(true) }}>重播</button>
        <button onClick={() => { runtime.current.playing = !runtime.current.playing; setPlaying(runtime.current.playing) }}>{playing ? '暂停' : '播放'}</button>
        <label><input type="checkbox" checked={loop} onChange={e => { runtime.current.loop = e.target.checked; setLoop(e.target.checked) }} />循环</label>
        <span>20枚 · 单枚0.5s</span>
      </nav>
    </footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<Demo />)
