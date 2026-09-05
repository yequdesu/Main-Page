import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './debug/GeometricDemo.css'

const MOTION_DURATION = 0.5
const MAX_COUNT = 64
function makeSequence() {
  const count = 28 + Math.floor(Math.random() * 37)
  const emitters = Array.from({ length: count }, (_, index) => {
    // One random sample per depth interval avoids deliberate dense/sparse clusters.
    const u = (index + Math.random()) / count
    const x = (1 - Math.exp(-1.6 * u)) / (1 - Math.exp(-1.6))
    const spread = 65 * Math.exp(-1.4 * u)
    const radius = 108 * Math.exp(-3.2 * u) * (0.65 + Math.random() * 0.7)
    return {
      x: -250 + 530 * x + (Math.random() * 2 - 1) * spread,
      y: 210 - 410 * Math.log1p(12 * x) / Math.log(13) + (Math.random() * 2 - 1) * spread,
      radius,
      start: Math.max(0, u * 1.65 + (Math.random() - 0.5) * 0.42),
      rotation: Math.random() * 90,
    }
  })
  const first = Math.min(...emitters.map(e => e.start))
  emitters.forEach(e => { e.start -= first })
  return { emitters, duration: Math.max(...emitters.map(e => e.start)) + MOTION_DURATION + 0.35 }
}
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
  const [initialSequence] = useState(makeSequence)
  const sequence = useRef(initialSequence)
  const paths = useRef<(SVGPathElement | null)[]>([])
  const groups = useRef<(SVGGElement | null)[]>([])
  const bar = useRef<HTMLDivElement>(null)
  const phase = useRef<HTMLSpanElement>(null)
  const runtime = useRef({ time: 0, playing: true, loop: true })
  const [playing, setPlaying] = useState(true)
  const [loop, setLoop] = useState(true)
  const render = (t: number) => {
    groups.current.forEach((group, index) => {
    const emitter = sequence.current.emitters[index]
    if (!emitter) { group?.setAttribute('visibility', 'hidden'); return }
    const age = t - emitter.start
    if (!group) return
    const active = age >= 0 && age < MOTION_DURATION
    group.setAttribute('visibility', active ? 'visible' : 'hidden')
    if (!active) return
    const p = clamp(age / MOTION_DURATION)
    // Separate continuous envelopes: restrained rotation and a tighter collapse.
    const rotationProgress = Math.expm1(3 * p) / Math.expm1(3)
    const collapseProgress = Math.expm1(8 * p) / Math.expm1(8)
    const size = emitter.radius * (1 - collapseProgress)
    const rotation = emitter.rotation + 10 * age + 100 * rotationProgress
    const morph = smooth((age - 0.018) / 0.063)
    paths.current[index]?.setAttribute('d', starPath(morph))
    group.setAttribute('transform', `translate(${emitter.x} ${emitter.y}) rotate(${rotation}) scale(${size})`)
    })
    if (bar.current) bar.current.style.transform = `scaleX(${clamp(t / sequence.current.duration)})`
    if (phase.current) phase.current.textContent = t < sequence.current.duration - 0.35
      ? `随机分布 / ${sequence.current.emitters.length}枚 / 近 → 远` : '完成'
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
        if (state.time > sequence.current.duration) {
          if (state.loop) { state.time = 0; sequence.current = makeSequence() }
          else { state.time = sequence.current.duration; state.playing = false; setPlaying(false) }
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
      {Array.from({ length: MAX_COUNT }, (_, index) => <g key={index} visibility="hidden"
        ref={node => { groups.current[index] = node }}>
        <path ref={node => { paths.current[index] = node }} fill="#f6f7fa" />
      </g>)}
    </svg>
    <footer>
      <div className="geometry-progress"><div ref={bar} /></div>
      <nav>
        <button onClick={() => { sequence.current = makeSequence(); runtime.current.time = 0; runtime.current.playing = true; setPlaying(true) }}>随机重播</button>
        <button onClick={() => { runtime.current.playing = !runtime.current.playing; setPlaying(runtime.current.playing) }}>{playing ? '暂停' : '播放'}</button>
        <label><input type="checkbox" checked={loop} onChange={e => { runtime.current.loop = e.target.checked; setLoop(e.target.checked) }} />循环</label>
        <span>均匀随机 · 单枚0.5s</span>
      </nav>
    </footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<Demo />)
