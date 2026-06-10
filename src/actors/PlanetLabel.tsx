import { useMemo } from 'react'
import { CanvasTexture, SpriteMaterial, Sprite, LinearFilter } from 'three'

/**
 * Canvas → Sprite 标签工厂。
 *
 * 原 LighthouseScene.vue:1080-1137 createPlanetLabel()
 * 512×128 Canvas → Texture → SpriteMaterial → Sprite
 *
 * 援引：Drei Text 组件（简化版等效实现）
 */
export function createPlanetLabelSprite(text: string, _accentColor: string): Sprite {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  // Pill background
  ctx.font = '500 40px "Georgia", "Times New Roman", serif'
  const tw = ctx.measureText(text).width
  const padX = 28
  const pillW = Math.max(100, tw + padX * 2)
  const pillH = 56
  const pillX = (size - pillW) / 2
  const pillY = (128 - pillH) / 2
  const pillR = 10

  ctx.beginPath()
  ctx.moveTo(pillX + pillR, pillY)
  ctx.lineTo(pillX + pillW - pillR, pillY)
  ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR, pillR)
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR)
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH, pillR)
  ctx.lineTo(pillX + pillR, pillY + pillH)
  ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR, pillR)
  ctx.lineTo(pillX, pillY + pillR)
  ctx.arcTo(pillX, pillY, pillX + pillR, pillY, pillR)
  ctx.closePath()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
  ctx.fill()

  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#f1f5f9'
  ctx.font = '500 38px "Georgia", "Times New Roman", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, 128 / 2)

  const tex = new CanvasTexture(canvas)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter

  const spriteMat = new SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new Sprite(spriteMat)
  sprite.scale.set(1.8, 0.45, 1)
  sprite.renderOrder = 9999

  return sprite
}
