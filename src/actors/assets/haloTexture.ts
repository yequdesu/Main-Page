import { CanvasTexture, LinearFilter } from 'three'

/** 创建独立的径向渐变贴图，由调用方负责释放。 */
export function makeHaloTexture(stops: [number, string][], size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [position, color] of stops) gradient.addColorStop(position, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  return texture
}
