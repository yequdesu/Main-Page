import { describe, expect, it, vi } from 'vitest'
import { createPixelOrbitRevealRenderer, getPixelOrbitGeometry, getPixelOrbitRevealFrame } from '../pixelOrbitReveal'
import { TIMELINE } from '../../composition/timeline'
import { afterMiniature } from '../../composition/transitionTiming'

describe('pixel orbit reveal', () => {
  it('preserves original expansion and rotation speed while extending the middle hold', () => {
    const start = TIMELINE.squareBfsWave.start
    const span = TIMELINE.squareCircleMorph.start - start
    for (const phase of [0, .1, .2, .36, .5]) {
      const t = Math.min(1, phase / .36)
      const frame = getPixelOrbitRevealFrame(start + phase * span)
      expect(frame.expansion).toBeCloseTo(t * t * t * (t * (t * 6 - 15) + 10), 10)
      expect(frame.angle).toBeCloseTo(phase * 1.65, 10)
    }
    const hold = getPixelOrbitRevealFrame(afterMiniature(.63))
    expect(hold.expansion).toBe(1)
    expect(hold.collapse).toBe(0)
    const a = getPixelOrbitRevealFrame(afterMiniature(.66))
    const b = getPixelOrbitRevealFrame(afterMiniature(.67))
    expect(b.angle - a.angle).toBeCloseTo((.01 / .09) * 1.65, 10)
  })
  it('retracts with the title, spans the morph and finishes before planet launch', () => {
    expect(getPixelOrbitRevealFrame(0).expansion).toBe(0)
    expect(getPixelOrbitRevealFrame(afterMiniature(.635)).expansion).toBe(1)
    expect(getPixelOrbitRevealFrame(TIMELINE.squareTitleFade.start).collapse).toBe(0)
    expect(TIMELINE.geometricOrbitRetract.start).toBe(TIMELINE.squareTitleFade.start)
    expect(getPixelOrbitRevealFrame(TIMELINE.squareCircleMorph.end).collapse).toBeLessThan(1)
    expect(getPixelOrbitRevealFrame(TIMELINE.geometricOrbitRetract.end).collapse).toBe(1)
    expect(TIMELINE.geometricOrbitRetract.end).toBeLessThan(TIMELINE.squarePlanetFlights.start)
    expect(getPixelOrbitRevealFrame(1).collapse).toBe(1)
  })
  it('is independent of playback order', () => {
    const p = afterMiniature(.66)
    const frame = getPixelOrbitRevealFrame(p)
    getPixelOrbitRevealFrame(1)
    expect(getPixelOrbitRevealFrame(p)).toEqual(frame)
    expect(frame.collapse).toBeGreaterThan(getPixelOrbitRevealFrame(afterMiniature(.64)).collapse)
  })
  it('shares 48 deterministic white-shape transforms and front/rear masks', () => {
    const p = afterMiniature(.66)
    const shapes = getPixelOrbitGeometry(p, 100, 1.1, 1)
    expect(shapes).toHaveLength(48)
    for (let kind = 0; kind < 4; kind++) expect(shapes.filter(g => g.kind === kind)).toHaveLength(12)
    expect(shapes.filter(g => !g.front).every(g => g.mask === 99.5)).toBe(true)
    expect(shapes.filter(g => g.front).every(g => g.mask > 0 && g.mask < 99.5)).toBe(true)
    getPixelOrbitGeometry(afterMiniature(.69), 100, 1.1, 1)
    expect(getPixelOrbitGeometry(p, 100, 1.1, 1)).toEqual(shapes)
    expect(getPixelOrbitGeometry(TIMELINE.geometricOrbitRetract.end, 100, 1.1, 1)).toEqual([])
  })
  it('uses the shared vector paths without pixel reads after handoff, and stops after retraction', () => {
    const context = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      beginPath: vi.fn(), rect: vi.fn(), arc: vi.fn(), clip: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), stroke: vi.fn(),
      getImageData: vi.fn(), clearRect: vi.fn(), setTransform: vi.fn(),
    }
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D)
    try {
      const render = createPixelOrbitRevealRenderer()
      for (const [width, height] of [[1200, 700], [390, 844]]) {
        render(context as unknown as CanvasRenderingContext2D,
          width, height, width / 2, height / 2, 100, 1.1, 1,
          TIMELINE.squareCircleMorph.end, 1)
      }
      expect(context.stroke).toHaveBeenCalledTimes(96)
      expect(context.getImageData).not.toHaveBeenCalled()
      expect(context.setTransform).not.toHaveBeenCalled()
      render(context as unknown as CanvasRenderingContext2D,
        1200, 700, 600, 350, 100, 1.1, 1, TIMELINE.geometricOrbitRetract.end, 1)
      expect(context.stroke).toHaveBeenCalledTimes(96)
    } finally { spy.mockRestore() }
  })
})
