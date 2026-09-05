import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Vector3 } from 'three'
import './debug/OrbitDemo.css'

const CORE = 72
const COUNT = 48
const STEP = 1 / 120
type Body = { p: Vector3; v: Vector3; radius: number; phase: number; orbit: number; tilt: number; speed: number; spin: number; angle: number; kind: number }
function target(body: Body, time: number) {
  const a = body.phase + time * body.speed
  const x = Math.cos(a) * body.orbit
  const y = Math.sin(a) * body.orbit
  return new Vector3(x, y * Math.cos(body.tilt), y * Math.sin(body.tilt))
}
function createBodies(): Body[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const body: Body = {
      p: new Vector3(), v: new Vector3(), radius: 6 + Math.random() * 6,
      phase: i * Math.PI * 2 / COUNT + Math.random() * .08,
      orbit: 142 + Math.random() * 78, tilt: 1.12 + Math.random() * .26,
      speed: .20 + Math.random() * .08, spin: (Math.random() < .5 ? -1 : 1) * (.35 + Math.random() * .65),
      angle: Math.random() * Math.PI * 2, kind: i % 4,
    }
    body.p.copy(target(body, 0))
    return body
  })
}

// Fixed-step, damped orbital attraction plus soft repulsion and hard separation.
function step(bodies: Body[], time: number) {
  for (const b of bodies) {
    const force = target(b, time).sub(b.p).multiplyScalar(2.8).addScaledVector(b.v, -2.2)
    b.v.addScaledVector(force, STEP)
    b.p.addScaledVector(b.v, STEP)
    b.angle += b.spin * STEP
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]
        const delta = b.p.clone().sub(a.p)
        const distance = delta.length()
        const min = a.radius + b.radius + 5
        if (distance >= min * 1.5) continue
        delta.divideScalar(Math.max(distance, .0001))
        if (pass === 0) {
          const strength = (1 - distance / (min * 1.5)) * 30 * STEP
          a.v.addScaledVector(delta, -strength)
          b.v.addScaledVector(delta, strength)
        }
        if (distance < min) {
          a.p.addScaledVector(delta, -(min - distance) * .5)
          b.p.addScaledVector(delta, (min - distance) * .5)
          const approach = b.v.clone().sub(a.v).dot(delta)
          if (approach < 0) {
            a.v.addScaledVector(delta, approach * .5)
            b.v.addScaledVector(delta, -approach * .5)
          }
        }
      }
      const minCore = CORE + a.radius + 8
      if (a.p.length() < minCore) a.p.setLength(minCore)
    }
  }
}

function Demo() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const paused = useRef(false)
  const [playing, setPlaying] = useState(true)
  const restart = useRef(() => {})
  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    let bodies = createBodies(), time = 0, accumulator = 0, last = 0, frame = 0
    let width = 0, height = 0, dpr = 1
    restart.current = () => { bodies = createBodies(); time = 0; accumulator = 0 }
    const resize = () => {
      width = el.clientWidth; height = el.clientHeight
      dpr = window.devicePixelRatio || 1
      el.width = Math.round(width * dpr); el.height = Math.round(height * dpr)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el); resize()
    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, .05) : 0
      last = now
      if (!paused.current) {
        accumulator += dt
        while (accumulator >= STEP) { time += STEP; step(bodies, time); accumulator -= STEP }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0b1528'; ctx.fillRect(0, 0, width, height)
      const scale = Math.min(width / 560, height / 480)
      ctx.translate(width / 2, height / 2); ctx.scale(scale, scale)
      // Orthographic projection retains a graphic 2D look; depth determines occlusion.
      const lean = -.24
      const items: { b: Body | null; z: number }[] = bodies.map(b => ({ b, z: b.p.z }))
      items.push({ b: null, z: 0 })
      items.sort((a, b) => a.z - b.z)
      for (const item of items) {
        if (!item.b) {
          ctx.fillStyle = '#f2f3f5'
          ctx.beginPath(); ctx.arc(0, 0, CORE, 0, Math.PI * 2); ctx.fill()
          continue
        }
        const b = item.b
        ctx.save()
        ctx.translate(b.p.x * Math.cos(lean) - b.p.y * Math.sin(lean), b.p.x * Math.sin(lean) + b.p.y * Math.cos(lean))
        ctx.rotate(b.angle)
        ctx.strokeStyle = b.p.z < 0 ? '#8796ae' : '#f2f3f5'
        ctx.lineWidth = 1.35 / Math.max(.65, scale)
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.beginPath()
        const r = b.radius
        if (b.kind === 0) {
          ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r)
        } else if (b.kind === 3) ctx.arc(0, 0, r, 0, Math.PI * 2)
        else {
          const sides = b.kind === 1 ? 3 : 4
          for (let k = 0; k < sides; k++) {
            const angle = k * Math.PI * 2 / sides - Math.PI / 2
            const x = Math.cos(angle) * r, y = Math.sin(angle) * r
            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          ctx.closePath()
        }
        ctx.stroke(); ctx.restore()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [])
  return <main className="orbit-demo">
    <canvas ref={canvas} />
    <header><span>GEOMETRY STUDY / 003</span><span>ORBITAL PRIMITIVES</span></header>
    <footer>
      <div>十字 · 三角形 · 正方形 · 圆 / 三维轨道 · 二维投影</div>
      <nav>
        <button onClick={() => { paused.current = !paused.current; setPlaying(!paused.current) }}>{playing ? '暂停' : '播放'}</button>
        <button onClick={() => restart.current()}>重新分布</button>
        <span>48 ELEMENTS / REPULSION</span>
      </nav>
    </footer>
  </main>
}
createRoot(document.getElementById('root')!).render(<Demo />)
