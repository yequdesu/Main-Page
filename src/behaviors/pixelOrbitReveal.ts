import { TIMELINE, progress } from '../composition/timeline'

const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

// Scroll-analytic orbits: fixed staggered lanes avoid random jumps on reverse playback.
export function getPixelOrbitRevealFrame(scroll: number) {
  // Keep the original angular speed; extending the hold must add rotation,
  // not stretch the same rotation over a longer interval.
  const phase = Math.max(0, (Math.min(scroll, TIMELINE.geometricOrbitRetract.end) - TIMELINE.squareBfsWave.start) /
    (TIMELINE.squareCircleMorph.start - TIMELINE.squareBfsWave.start))
  return {
    expansion: ease(progress('geometricOrbitExpand', scroll)),
    collapse: ease(progress('geometricOrbitRetract', scroll)),
    phase,
    angle: phase * 1.65,
  }
}

export function getPixelOrbitGeometry(scroll: number, radius: number, spacing: number, squareSize: number) {
  const f = getPixelOrbitRevealFrame(scroll)
  if (f.expansion <= 0 || f.collapse >= 1) return []
  const ringRadius = Math.max(0, radius - squareSize * .5)
  return Array.from({ length: 48 }, (_, i) => {
    const a = i * Math.PI * 2 / 48 + f.angle * (1 + (i % 3) * .035)
    const front = Math.sin(a) >= 0
    const orbit = radius * (1.72 + (i % 3) * .23) * f.expansion * (1 - f.collapse)
    const x = Math.cos(a) * orbit, y = Math.sin(a) * orbit * .42
    return {
      kind: i % 4, front, x: x * .971 + y * .238, y: -x * .238 + y * .971,
      rotation: f.phase * (i % 2 ? 2 : -2) + i,
      radius: radius * (.055 + (i % 5) * .007) * Math.min(1, f.expansion * 2),
      lineWidth: Math.max(spacing, radius * .012),
      mask: front ? ringRadius * f.collapse : ringRadius,
    }
  })
}

export function createPixelOrbitRevealRenderer() {
  const raster = document.createElement('canvas')
  const c = raster.getContext('2d', { willReadFrequently: true })!
  const vector = document.createElement('canvas')
  const v = vector.getContext('2d')!
  const blend = document.createElement('canvas')
  const b = blend.getContext('2d')!
  return (
    ctx: CanvasRenderingContext2D, width: number, height: number,
    cx: number, cy: number, radius: number, spacing: number, squareSize: number, scroll: number, morph: number,
  ) => {
    if (radius <= 0 || spacing <= 0 || squareSize <= 0) return
    const geometry = getPixelOrbitGeometry(scroll, radius, spacing, squareSize)
    if (!geometry.length) return
    // Each offscreen texel IS one existing wave grid cell, not an independent
    // screen pixel. World projection and occlusion happen before occupancy sampling.
    const extent = radius * 2.7 + 24
    const minX = Math.ceil(Math.max(-extent, -cx - squareSize) / spacing)
    const minY = Math.ceil(Math.max(-extent, -cy - squareSize) / spacing)
    const maxX = Math.floor(Math.min(extent, width - cx + squareSize) / spacing)
    const maxY = Math.floor(Math.min(extent, height - cy + squareSize) / spacing)
    const rw = maxX - minX + 1, rh = maxY - minY + 1
    if (rw <= 0 || rh <= 0) return
    // One projected path and mask calculation for both representations.
    const drawGeometry = (c: CanvasRenderingContext2D) => {
      c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'
      for (const front of [false, true]) {
        for (const g of geometry) {
          if (g.front !== front) continue
          c.save()
          const mask = g.mask
          if (mask > 0) {
            c.beginPath(); c.rect(-extent, -extent, extent * 2, extent * 2)
            c.arc(0, 0, mask, 0, Math.PI * 2); c.clip('evenodd')
          }
          c.translate(g.x, g.y)
          c.rotate(g.rotation)
          c.lineWidth = g.lineWidth
          const r = g.radius
          c.beginPath()
          if (g.kind === 0) {
            c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r)
          } else if (g.kind === 3) c.arc(0, 0, r, 0, Math.PI * 2)
          else {
            const n = g.kind === 1 ? 3 : 4
            for (let j = 0; j < n; j++) {
              const theta = j * Math.PI * 2 / n - Math.PI / 2
              if (!j) c.moveTo(Math.cos(theta) * r, Math.sin(theta) * r)
              else c.lineTo(Math.cos(theta) * r, Math.sin(theta) * r)
            }
            c.closePath()
          }
          c.stroke(); c.restore()
        }
        // Every rear path is already clipped; do not erase the scene beneath it.
      }
    }
    if (morph >= 1) {
      ctx.save(); ctx.translate(cx, cy); drawGeometry(ctx); ctx.restore()
      return
    }
    if (raster.width !== rw || raster.height !== rh) { raster.width = rw; raster.height = rh }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, rw, rh)
    c.setTransform(1 / spacing, 0, 0, 1 / spacing, .5 - minX, .5 - minY)
    drawGeometry(c)
    const image = c.getImageData(0, 0, rw, rh)
    const pixels = new Path2D()
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        if (image.data[(y * rw + x) * 4 + 3] < 96) continue
        pixels.rect(cx + (minX + x) * spacing - squareSize * .5,
          cy + (minY + y) * spacing - squareSize * .5, squareSize, squareSize)
      }
    }
    if (morph <= 0) {
      ctx.save(); ctx.fillStyle = '#ffffff'; ctx.fill(pixels); ctx.restore(); return
    }
    // Mix isolated premultiplied layers additively: coincident white pixels
    // retain full opacity, without adding light to the underlying scene.
    const dpr = Math.abs(ctx.getTransform().a) || 1
    const w = Math.ceil(width * dpr), h = Math.ceil(height * dpr)
    for (const canvas of [vector, blend]) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    }
    v.setTransform(1, 0, 0, 1, 0, 0); v.clearRect(0, 0, w, h)
    v.setTransform(dpr, 0, 0, dpr, cx * dpr, cy * dpr); drawGeometry(v)
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, w, h)
    b.setTransform(dpr, 0, 0, dpr, 0, 0)
    b.fillStyle = '#ffffff'; b.globalAlpha = 1 - morph; b.fill(pixels)
    b.globalCompositeOperation = 'lighter'; b.globalAlpha = morph
    b.drawImage(vector, 0, 0, width, height)
    b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1
    ctx.drawImage(blend, 0, 0, width, height)
  }
}
