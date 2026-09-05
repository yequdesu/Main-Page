const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

// Scroll-analytic orbits: fixed staggered lanes avoid random jumps on reverse playback.
export function getPixelOrbitRevealFrame(phase: number) {
  return {
    expansion: ease(phase / .36),
    collapse: ease((phase - .70) / .26),
    angle: phase * 1.65,
  }
}

export function createPixelOrbitRevealRenderer() {
  const raster = document.createElement('canvas')
  const c = raster.getContext('2d', { willReadFrequently: true })!
  return (
    ctx: CanvasRenderingContext2D, width: number, height: number,
    cx: number, cy: number, radius: number, spacing: number, squareSize: number, phase: number,
  ) => {
    if (radius <= 0 || spacing <= 0 || squareSize <= 0) return
    const f = getPixelOrbitRevealFrame(phase)
    if (f.collapse >= 1 || f.expansion <= 0) return
    // Each offscreen texel IS one existing wave grid cell, not an independent
    // screen pixel. World projection and occlusion happen before occupancy sampling.
    const extent = radius * 2.7 + 24
    const minX = Math.ceil(Math.max(-extent, -cx - squareSize) / spacing)
    const minY = Math.ceil(Math.max(-extent, -cy - squareSize) / spacing)
    const maxX = Math.floor(Math.min(extent, width - cx + squareSize) / spacing)
    const maxY = Math.floor(Math.min(extent, height - cy + squareSize) / spacing)
    const rw = maxX - minX + 1, rh = maxY - minY + 1
    if (rw <= 0 || rh <= 0) return
    if (raster.width !== rw || raster.height !== rh) { raster.width = rw; raster.height = rh }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, rw, rh)
    c.setTransform(1 / spacing, 0, 0, 1 / spacing, .5 - minX, .5 - minY)
    c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'
    const orbitScale = f.expansion * (1 - f.collapse)
    const ringRadius = Math.max(0, radius - squareSize * .5)
    for (const front of [false, true]) {
      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI * 2 / 48 + f.angle * (1 + (i % 3) * .035)
        const z = Math.sin(a)
        if ((z >= 0) !== front || orbitScale <= .001) continue
        const orbit = radius * (1.72 + (i % 3) * .23) * orbitScale
        const x = Math.cos(a) * orbit, y = Math.sin(a) * orbit * .42
        c.save()
        const mask = front ? ringRadius * f.collapse : ringRadius
        if (mask > 0) {
          c.beginPath(); c.rect(-extent, -extent, extent * 2, extent * 2)
          c.arc(0, 0, mask, 0, Math.PI * 2); c.clip('evenodd')
        }
        c.translate(x * .971 + y * .238, -x * .238 + y * .971)
        c.rotate(phase * (i % 2 ? 2 : -2) + i)
        c.lineWidth = Math.max(spacing, radius * .012)
        const r = radius * (.055 + (i % 5) * .007) * Math.min(1, f.expansion * 2)
        c.beginPath()
        if (i % 4 === 0) {
          c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r)
        } else if (i % 4 === 3) c.arc(0, 0, r, 0, Math.PI * 2)
        else {
          const n = i % 4 === 1 ? 3 : 4
          for (let j = 0; j < n; j++) {
            const theta = j * Math.PI * 2 / n - Math.PI / 2
            if (!j) c.moveTo(Math.cos(theta) * r, Math.sin(theta) * r)
            else c.lineTo(Math.cos(theta) * r, Math.sin(theta) * r)
          }
          c.closePath()
        }
        c.stroke(); c.restore()
      }
      if (!front) {
        // Clear rear artwork without painting a background over the actual scene.
        c.save(); c.globalCompositeOperation = 'destination-out'
        c.beginPath(); c.arc(0, 0, ringRadius, 0, Math.PI * 2); c.fill(); c.restore()
      }
    }
    const image = c.getImageData(0, 0, rw, rh)
    ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.beginPath()
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        if (image.data[(y * rw + x) * 4 + 3] < 96) continue
        ctx.rect(cx + (minX + x) * spacing - squareSize * .5,
          cy + (minY + y) * spacing - squareSize * .5, squareSize, squareSize)
      }
    }
    ctx.fill(); ctx.restore()
  }
}
