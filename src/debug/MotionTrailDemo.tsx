import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createMotionPath,
  getMotionTrailFrame,
  type MotionPoint,
  type MotionTrailConfig,
} from './motionTrail'
import './MotionTrailDemo.css'

interface DemoSettings {
  duration: number
  finalRadius: number
  trailSpacing: number
  shrinkRate: number
  waypointCount: number
  randomness: number
}

interface NormalizedPoint {
  x: number
  y: number
}

const DEFAULT_SETTINGS: DemoSettings = {
  duration: 4,
  finalRadius: 36,
  trailSpacing: 8,
  shrinkRate: 24,
  waypointCount: 4,
  randomness: 0.52,
}

const nextSeed = (seed: number): number => (seed + 0x9e3779b9) >>> 0

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="motion-control">
      <span>{label}</span>
      <output>{value}{unit ?? ''}</output>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function drawCircle(ctx: CanvasRenderingContext2D, point: MotionPoint, radius: number): void {
  if (radius <= 0.01) return
  ctx.beginPath()
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
  ctx.fill()
}

export default function MotionTrailDemo() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const draggingRef = useRef<'a' | 'b' | null>(null)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [start, setStart] = useState<NormalizedPoint>({ x: 0.18, y: 0.68 })
  const [end, setEnd] = useState<NormalizedPoint>({ x: 0.82, y: 0.32 })
  const [seed, setSeed] = useState(0x1a2b3c4d)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [showGuides, setShowGuides] = useState(true)

  const startPx = useMemo(() => ({ x: start.x * size.width, y: start.y * size.height }), [start, size])
  const endPx = useMemo(() => ({ x: end.x * size.width, y: end.y * size.height }), [end, size])
  const config: MotionTrailConfig = useMemo(() => ({ ...settings, ...size }), [settings, size])
  const path = useMemo(() => createMotionPath(startPx, endPx, config, seed), [startPx, endPx, config, seed])
  const drainDuration = settings.finalRadius / Math.max(0.001, settings.shrinkRate)
  const totalDuration = settings.duration + drainDuration

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width))
      const height = Math.max(1, Math.round(entry.contentRect.height))
      setSize({ width, height })
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) {
      lastFrameTimeRef.current = null
      return
    }
    let raf = 0
    const tick = (now: number) => {
      const previous = lastFrameTimeRef.current ?? now
      lastFrameTimeRef.current = now
      const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000))
      setElapsed((current) => {
        const next = Math.min(totalDuration, current + dt)
        if (next >= totalDuration) setPlaying(false)
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, totalDuration])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(size.width * dpr))
    const pixelHeight = Math.max(1, Math.round(size.height * dpr))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
      canvas.style.width = `${size.width}px`
      canvas.style.height = `${size.height}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)

    if (showGuides) {
      ctx.save()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.beginPath()
      path.samples.forEach((sample, index) => {
        if (index === 0) ctx.moveTo(sample.point.x, sample.point.y)
        else ctx.lineTo(sample.point.x, sample.point.y)
      })
      ctx.stroke()
      ctx.setLineDash([])

      for (const [label, point] of [['A', startPx], ['B', endPx]] as const) {
        ctx.fillStyle = '#0b1020'
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.78)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(point.x, point.y, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#cbd5e1'
        ctx.font = '700 10px ui-monospace, SFMono-Regular, Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, point.x, point.y + 0.5)
      }
      ctx.restore()
    }

    const frame = getMotionTrailFrame(path, config, elapsed)
    ctx.save()
    ctx.fillStyle = '#f8fafc'
    for (const circle of frame.trail) drawCircle(ctx, circle.point, circle.radius)
    drawCircle(ctx, frame.main.point, frame.main.radius)
    ctx.restore()
  }, [config, elapsed, endPx, path, showGuides, size, startPx])

  const resetForParameterChange = useCallback((next: Partial<DemoSettings>) => {
    setSettings((current) => ({ ...current, ...next }))
    setElapsed(0)
    setPlaying(false)
  }, [])

  const replay = useCallback(() => {
    setSeed((current) => nextSeed(current))
    setElapsed(0)
    setPlaying(true)
  }, [])

  const changePath = useCallback(() => {
    setSeed((current) => nextSeed(current))
    setElapsed(0)
    setPlaying(false)
  }, [])

  const pointFromEvent = useCallback((event: React.PointerEvent<HTMLCanvasElement>): NormalizedPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0.04, Math.min(0.96, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0.06, Math.min(0.94, (event.clientY - rect.top) / rect.height)),
    }
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const distanceA = Math.hypot(point.x - startPx.x, point.y - startPx.y)
    const distanceB = Math.hypot(point.x - endPx.x, point.y - endPx.y)
    if (Math.min(distanceA, distanceB) > 24) return
    draggingRef.current = distanceA <= distanceB ? 'a' : 'b'
    event.currentTarget.setPointerCapture(event.pointerId)
    setElapsed(0)
    setPlaying(false)
  }, [endPx, startPx])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    const point = pointFromEvent(event)
    if (draggingRef.current === 'a') setStart(point)
    else setEnd(point)
  }, [pointFromEvent])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    setSeed((current) => nextSeed(current))
    setElapsed(0)
  }, [])

  const frame = getMotionTrailFrame(path, config, elapsed)

  return (
    <main className="motion-demo" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="motion-demo__canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="圆形曲线运动与拖尾效果画布"
      />

      <section className="motion-demo__panel">
        <header>
          <div>
            <p>MOTION TRAIL / 01</p>
            <h1>圆形曲线运动</h1>
          </div>
          <span className={playing ? 'is-playing' : ''}>{playing ? 'PLAY' : 'HOLD'}</span>
        </header>

        <div className="motion-demo__actions">
          <button type="button" onClick={() => setPlaying((current) => !current)}>
            {playing ? '暂停' : elapsed >= totalDuration ? '停留中' : '继续'}
          </button>
          <button type="button" onClick={replay}>重播 / 新轨迹</button>
          <button type="button" onClick={changePath}>只换轨迹</button>
        </div>

        <div className="motion-demo__controls">
          <RangeControl label="运动时长" value={settings.duration} min={1} max={10} step={0.1} unit="s" onChange={(value) => resetForParameterChange({ duration: value })} />
          <RangeControl label="终态半径" value={settings.finalRadius} min={8} max={96} step={1} unit="px" onChange={(value) => resetForParameterChange({ finalRadius: value })} />
          <RangeControl label="拖尾间距" value={settings.trailSpacing} min={2} max={30} step={1} unit="px" onChange={(value) => resetForParameterChange({ trailSpacing: value })} />
          <RangeControl label="缩小速率 i" value={settings.shrinkRate} min={1} max={100} step={1} unit="px/s" onChange={(value) => resetForParameterChange({ shrinkRate: value })} />
          <RangeControl label="随机控制点" value={settings.waypointCount} min={1} max={8} step={1} onChange={(value) => resetForParameterChange({ waypointCount: value })} />
          <RangeControl label="轨迹偏移" value={settings.randomness} min={0.05} max={1.2} step={0.01} onChange={(value) => resetForParameterChange({ randomness: value })} />
        </div>

        <label className="motion-demo__toggle">
          <input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} />
          显示轨迹与 A/B 拖拽点
        </label>

        <footer>
          <span>{Math.round(frame.progress * 100).toString().padStart(3, '0')}%</span>
          <span>{frame.trail.length} TRAIL NODES</span>
          <span>{Math.round(frame.speed)} PX/S</span>
        </footer>
      </section>

      <p className="motion-demo__hint">拖动 A / B 调整端点 · 重播时自动更换随机曲线</p>
    </main>
  )
}
