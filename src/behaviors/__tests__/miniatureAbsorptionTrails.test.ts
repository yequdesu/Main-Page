import { describe, expect, it } from 'vitest'
import {
  ABSORPTION_TRAIL_END,
  ABSORPTION_TRAIL_START,
  buildAbsorptionTrailSpecs,
  getAbsorptionTrailFrame,
} from '../miniatureAbsorptionTrails'

const viewport = { width: 1200, height: 800 }
const cubeBounds = { x: 430, y: 240, width: 340, height: 320 }

describe('miniature absorption trails', () => {
  it('builds deterministic staggered tracks that finish before white fill', () => {
    const first = buildAbsorptionTrailSpecs()
    const second = buildAbsorptionTrailSpecs()
    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(10)
    expect(Math.min(...first.map((track) => track.start))).toBeGreaterThanOrEqual(ABSORPTION_TRAIL_START)
    expect(Math.max(...first.map((track) => track.end))).toBeLessThan(ABSORPTION_TRAIL_END)
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index].end).toBeGreaterThan(first[index - 1].end)
    }
  })

  it('starts outside the viewport and lands on the visible cube boundary', () => {
    for (const spec of buildAbsorptionTrailSpecs()) {
      const sp = (spec.start + spec.end) * 0.5
      const frame = getAbsorptionTrailFrame(
        spec,
        sp,
        viewport.width,
        viewport.height,
        cubeBounds,
      )
      expect(frame.active).toBe(true)
      const outside = frame.start.x < 0 || frame.start.x > viewport.width ||
        frame.start.y < 0 || frame.start.y > viewport.height
      expect(outside).toBe(true)
      const onVerticalEdge = Math.abs(frame.target.x - cubeBounds.x) < 0.001 ||
        Math.abs(frame.target.x - (cubeBounds.x + cubeBounds.width)) < 0.001
      const onHorizontalEdge = Math.abs(frame.target.y - cubeBounds.y) < 0.001 ||
        Math.abs(frame.target.y - (cubeBounds.y + cubeBounds.height)) < 0.001
      expect(onVerticalEdge || onHorizontalEdge).toBe(true)
    }
  })

  it('keeps every trail sample on a straight line and collapses before arrival', () => {
    const spec = buildAbsorptionTrailSpecs()[0]
    const mid = getAbsorptionTrailFrame(
      spec,
      spec.start + (spec.end - spec.start) * 0.5,
      viewport.width,
      viewport.height,
      cubeBounds,
    )
    const dx = mid.target.x - mid.start.x
    const dy = mid.target.y - mid.start.y
    for (const circle of mid.circles) {
      const cx = circle.point.x - mid.start.x
      const cy = circle.point.y - mid.start.y
      expect(Math.abs(dx * cy - dy * cx)).toBeLessThan(0.001)
    }

    const nearEnd = getAbsorptionTrailFrame(
      spec,
      spec.end - (spec.end - spec.start) * 0.001,
      viewport.width,
      viewport.height,
      cubeBounds,
    )
    expect(Math.max(...nearEnd.circles.map((circle) => circle.radius))).toBeLessThan(0.001)
    expect(getAbsorptionTrailFrame(
      spec,
      spec.end,
      viewport.width,
      viewport.height,
      cubeBounds,
    ).active).toBe(false)
  })
})
