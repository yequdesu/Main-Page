import { describe, expect, it } from 'vitest'
import type { Act3ContourTarget } from '../../composition/coreAnchors'
import {
  SQUARE_TITLE,
  SQUARE_TITLE_FONT_SCALE,
  SQUARE_WAVE_HANDOFF_RADIUS_CELLS,
  buildSquareContourLayout,
  getSquareContourTransform,
  getSquareContourTransitionFrame,
  getSquareWaveExpansionProgress,
  getSquareWaveCanvasTransform,
  getSquareWaveHandoffGeneration,
  getSquareTypedText,
  projectContourPoint,
} from '../act2SquareContourTransition'

const TARGET: Act3ContourTarget = {
  width: 1000,
  height: 700,
  central: { x: 520, y: 360, r: 40, visible: true },
  planets: [
    { x: 350, y: 320, r: 28, visible: true },
    { x: 650, y: 390, r: 34, visible: true },
    { x: 560, y: 250, r: 22, visible: true },
  ],
  orbits: [
    { points: [{ x: 300, y: 350 }, { x: 500, y: 260 }, { x: 700, y: 350 }] },
  ],
}

const FROZEN = [
  { x: 10, y: 0, opacity: 1 },
  { x: 0, y: 10, opacity: 1 },
  { x: -10, y: 0, opacity: 1 },
  { x: 0, y: -10, opacity: 1 },
]

describe('Act 2 square contour transition', () => {
  it('replaces the seed star with the macron E before typing the rest', () => {
    expect(getSquareTypedText(0.58)).toBe('*')
    expect(getSquareTypedText(0.581)).toBe('Ē')
    expect(getSquareTypedText(0.64)).toBe(SQUARE_TITLE)
  })

  it('shrinks and fades the title with the logical canvas', () => {
    const beforeFade = getSquareContourTransitionFrame(0.64, 1600, 1000)
    const halfway = getSquareContourTransitionFrame(0.68, 1600, 1000)
    const gone = getSquareContourTransitionFrame(0.72, 1600, 1000)
    expect(beforeFade.titleAlpha).toBe(1)
    expect(halfway.titleAlpha).toBeCloseTo(0.5)
    expect(gone.titleAlpha).toBe(0)
    expect(beforeFade.titleFontPx).toBeCloseTo(220 * SQUARE_TITLE_FONT_SCALE)
  })

  it('expands to radius 400 while only the logical canvas zoom changes', () => {
    const start = getSquareWaveCanvasTransform(0, 1000, 800, 20)
    const middle = getSquareWaveCanvasTransform(0.5, 1000, 800, 20)
    const handoff = getSquareWaveCanvasTransform(1, 1000, 800, 20)

    expect(getSquareWaveHandoffGeneration()).toBe(SQUARE_WAVE_HANDOFF_RADIUS_CELLS)
    expect(handoff.generation).toBe(400)
    expect(start.logicalSquareSize).toBe(20)
    expect(middle.logicalSquareSize).toBe(20)
    expect(handoff.logicalSquareSize).toBe(20)
    expect(start.logicalSpacing).toBe(22)
    expect(middle.logicalSpacing).toBe(22)
    expect(handoff.logicalSpacing).toBe(22)
    expect(start.zoom).toBe(1)
    expect(middle.zoom).toBeLessThan(start.zoom)
    expect(handoff.zoom).toBeLessThan(middle.zoom)
    expect(handoff.screenRadius).toBeCloseTo(800 * 0.38)
  })

  it('converges into the freeze with a slow-fast-slow expansion speed', () => {
    const earlyDistance = getSquareWaveExpansionProgress(0.2) -
      getSquareWaveExpansionProgress(0)
    const middleDistance = getSquareWaveExpansionProgress(0.6) -
      getSquareWaveExpansionProgress(0.4)
    const lateDistance = getSquareWaveExpansionProgress(1) -
      getSquareWaveExpansionProgress(0.8)

    expect(getSquareWaveExpansionProgress(0)).toBe(0)
    expect(getSquareWaveExpansionProgress(1)).toBe(1)
    expect(middleDistance).toBeGreaterThan(earlyDistance)
    expect(lateDistance).toBeCloseTo(earlyDistance)
    expect(getSquareWaveExpansionProgress(0.9)).toBeGreaterThan(0.99)
  })

  it('continues pulling back from the handoff and lands on the terminal target', () => {
    const layout = buildSquareContourLayout(TARGET, FROZEN, 500, 350, 22, 20, 0.5)
    const close = getSquareContourTransform(layout, 0)
    const terminal = getSquareContourTransform(layout, 1)

    expect(close.zoom).toBeCloseTo(0.5)
    expect(terminal.zoom).toBeLessThan(close.zoom)
    layout.centralSquares.forEach((square, index) => {
      const closePoint = projectContourPoint(square, layout, close)
      expect(closePoint.x).toBeCloseTo(500 + FROZEN[index].x * 22 * 0.5)
      expect(closePoint.y).toBeCloseTo(350 + FROZEN[index].y * 22 * 0.5)
    })

    const rightmost = layout.centralSquares[0]
    const terminalPoint = projectContourPoint(rightmost, layout, terminal)
    expect(terminalPoint.x + terminal.squareSize * 0.5)
      .toBeCloseTo(TARGET.central.x + TARGET.central.r)
    expect(terminal.focusX).toBe(TARGET.central.x)
    expect(terminal.focusY).toBe(TARGET.central.y)
  })

  it('deterministically samples planet outlines but excludes every orbit', () => {
    const first = buildSquareContourLayout(TARGET, FROZEN, 500, 350, 22, 20, 0.5)
    const second = buildSquareContourLayout(TARGET, FROZEN, 500, 350, 22, 20, 0.5)
    expect(second).toEqual(first)
    expect(first.peripheralSquares.length).toBeGreaterThan(0)
    expect(first.peripheralSquares.every((square) => square.source === 'planet')).toBe(true)
  })

  it('crossfades only after the full planetary framing is reached', () => {
    expect(getSquareContourTransitionFrame(0.70, 1000, 800).zoomProgress).toBe(0)
    expect(getSquareContourTransitionFrame(0.80, 1000, 800).zoomProgress).toBe(1)
    expect(getSquareContourTransitionFrame(0.80, 1000, 800).contourAlpha).toBe(1)
    expect(getSquareContourTransitionFrame(0.85, 1000, 800).contourAlpha).toBe(0)
  })
})
