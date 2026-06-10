import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SpriteMaterial, Sprite, LinearFilter, Vector3 } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { _mainPlanetIndices } from './DustField'
import type { PlanetLink } from '../types'

// Smooth label opacity transition（逐字保留自原 act3.animate _labelOpacityCurrent）
// 共享变量 — 3 个 PlanetLabel 实例共用，每帧仅更新一次
let _labelOpacityCurrent = 0
let _lastLabelSp = -1
let _lastLabelTime = -1

/**
 * 行星标签 — Canvas → Sprite，每帧跟随行星世界位置。
 *
 * 原 createPlanetLabelSprite():1080-1137 + per-frame label update，逐字保留。
 * 跟随 _planetWorldPositions[idx]，聚焦时淡出。
 *
 * 援引：R3F Sprite + CanvasTexture（Drei Text 等效实现）
 */
interface PlanetLabelProps {
  trackIdx: number           // 0, 1, 2
  planetData: PlanetLink     // label + accent + url
  getWorldPosition: (idx: number) => Vector3 | null
}

export default function PlanetLabel({ trackIdx, planetData, getWorldPosition }: PlanetLabelProps) {
  const matRef = useRef<SpriteMaterial | null>(null)
  const prevTexRef = useRef<CanvasTexture | null>(null)
  const _labelOffset = useRef(new Vector3(0, 0.45, 0)).current

  // ---- Build sprite once (useMemo for render-ready on first frame) ----
  const sprite = useMemo(() => {
    // Dispose previous texture on re-creation
    if (prevTexRef.current) {
      prevTexRef.current.dispose()
      prevTexRef.current = null
    }

    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = 128
    const ctx = canvas.getContext('2d')!

    ctx.font = '500 40px "Georgia", "Times New Roman", serif'
    const tw = ctx.measureText(planetData.label).width
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

    ctx.strokeStyle = planetData.accent
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = '#f1f5f9'
    ctx.font = '500 38px "Georgia", "Times New Roman", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(planetData.label, size / 2, 128 / 2)

    const tex = new CanvasTexture(canvas)
    tex.minFilter = LinearFilter
    tex.magFilter = LinearFilter
    prevTexRef.current = tex

    const spriteMat = new SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })

    matRef.current = spriteMat

    const s = new Sprite(spriteMat)
    s.scale.set(1.8, 0.45, 1)
    s.renderOrder = 9999

    return s
  }, [planetData])

  // ---- Per-frame position + opacity ----
  useFrame((state) => {
    const mat = matRef.current
    if (!mat) return

    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    const { focusedPlanetIdx } = useScrollStore.getState()

    const inAct3 = sp >= GRID_SHIFT_START
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    // Follow planet position
    const pos = getWorldPosition(trackIdx)
    if (pos) {
      sprite.position.copy(pos).add(_labelOffset)
    }

    // Opacity: fade in during Act 3 transition, all labels fade out when any planet focused
    // Per-frame guard: only update shared _labelOpacityCurrent once per frame (not 3x)
    const isFocused = focusedPlanetIdx >= 0
    const targetOpacity = inAct3 ? (isFocused ? 0 : smooth3 * 0.82) : 0

    if (sp !== _lastLabelSp || time !== _lastLabelTime) {
      _lastLabelSp = sp
      _lastLabelTime = time
      _labelOpacityCurrent += (targetOpacity - _labelOpacityCurrent) * 0.12
    }

    mat.opacity = _labelOpacityCurrent
    sprite.visible = mat.opacity > 0.001
  })

  return <primitive object={sprite} />
}
