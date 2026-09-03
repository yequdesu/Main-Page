import { describe, expect, it } from 'vitest'
import type { Act3ContourTarget } from '../../composition/coreAnchors'
import {
  SQUARE_TITLE,
  buildSquareContourLayout,
  getSquareContourTransform,
  getSquareContourTransitionFrame,
  getSquareWaveFreezeGeneration,
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
    { points: [{ x: 300, y: 350 }, { x: 500, y: 260 }, { x: 700, y: 350 }, { x: 500, y: 440 }, { x: 300, y: 350 }] },
  ],
}

const FROZEN = [
  { x: 4, y: 0, opacity: 1 },
  { x: 0, y: 4, opacity: 0.8 },
  { x: -4, y: 0, opacity: 0.5 },
  { x: 0, y: -4, opacity: 0.25 },
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
    expect(beforeFade.titleFontPx).toBeGreaterThanOrEqual(72)
  })

  it('freezes the circular wave at 60% and crossfades only after the full framing is visible', () => {
    const freezeGeneration = getSquareWaveFreezeGeneration(1000, 800, 20)
    expect(freezeGeneration).toBeCloseTo((800 * 0.38) / 22)
    expect(getSquareContourTransitionFrame(0.60, 1000, 800).zoomProgress).toBe(0)
    expect(getSquareContourTransitionFrame(0.80, 1000, 800).zoomProgress).toBe(1)
    expect(getSquareContourTransitionFrame(0.80, 1000, 800).contourAlpha).toBe(1)
    expect(getSquareContourTransitionFrame(0.85, 1000, 800).contourAlpha).toBe(0)
  })

  it('preserves frozen wave identity at the close-up and lands on the terminal target', () => {
    const layout = buildSquareContourLayout(TARGET, FROZEN, 500, 350, 22, 20)
    const close = getSquareContourTransform(layout, 0)
    const terminal = getSquareContourTransform(layout, 1)

    layout.centralSquares.forEach((square, index) => {
      const closePoint = projectContourPoint(square, layout, close)
      expect(closePoint.x).toBeCloseTo(500 + FROZEN[index].x * 22)
      expect(closePoint.y).toBeCloseTo(350 + FROZEN[index].y * 22)
      expect(square.opacity).toBe(FROZEN[index].opacity)

      const terminalPoint = projectContourPoint(square, layout, terminal)
      expect(terminalPoint.x).toBeCloseTo(square.x)
      expect(terminalPoint.y).toBeCloseTo(square.y)
    })
    expect(terminal.zoom).toBeCloseTo(1)
    expect(terminal.focusX).toBe(TARGET.central.x)
    expect(terminal.focusY).toBe(TARGET.central.y)
  })

  it('deterministically samples only square outlines for planets and orbits', () => {
    const first = buildSquareContourLayout(TARGET, FROZEN, 500, 350, 22, 20)
    const second = buildSquareContourLayout(TARGET, FROZEN, 500, 350, 22, 20)
    expect(second).toEqual(first)
    expect(first.peripheralSquares.length).toBeGreaterThan(0)
    expect(first.peripheralSquares.some((square) => square.source === 'planet')).toBe(true)
    expect(first.peripheralSquares.some((square) => square.source === 'orbit')).toBe(true)
  })
})
