import { describe, expect, it } from 'vitest'
import {
  ABSORPTION_TRAIL_END,
  ABSORPTION_TRAIL_START,
  buildAbsorptionTrailSpecs,
  buildRandomAbsorptionTrailBatch,
  getAbsorptionSpawnDensity,
  getAbsorptionTrailFrame,
} from '../miniatureAbsorptionTrails'

const viewport = { width: 1200, height: 800 }
const cubeBounds = { x: 430, y: 240, width: 340, height: 320 }

describe('miniature absorption trails', () => {
  it('builds deterministic staggered tracks inside the absorption window', () => {
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

  it('randomizes batch count and properties while constraining the final arrival', () => {
    const batch = buildRandomAbsorptionTrailBatch(0x1234abcd)
    expect(batch.specs.length).toBeGreaterThanOrEqual(128)
    expect(batch.specs.length).toBeLessThanOrEqual(192)
    expect(batch.finalArrival).toBeGreaterThanOrEqual(0.56)
    expect(batch.finalArrival).toBeLessThan(0.57)
    expect(Math.max(...batch.specs.map((track) => track.end))).toBe(batch.finalArrival)
    expect(buildRandomAbsorptionTrailBatch(0x1234abcd)).toEqual(batch)
    expect(buildRandomAbsorptionTrailBatch(0x76543210)).not.toEqual(batch)
  })

  it('uses a sparse-dense-sparse bell function for arrival counts', () => {
    expect(getAbsorptionSpawnDensity(0)).toBeCloseTo(0)
    expect(getAbsorptionSpawnDensity(0.5)).toBeCloseTo(1)
    expect(getAbsorptionSpawnDensity(1)).toBeCloseTo(0)

    const specs = buildAbsorptionTrailSpecs(160, 0x10203040, 0.568)
    const phases = specs.map((spec) => (spec.end - 0.472) / (0.568 - 0.472))
    const edgeCount = phases.filter((phase) => phase < 0.2 || phase > 0.8).length
    const centerCount = phases.filter((phase) => phase >= 0.4 && phase <= 0.6).length
    expect(centerCount).toBeGreaterThan(edgeCount)
  })

  it('starts outside the viewport and converges on one exact center point', () => {
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
      expect(frame.target.x).toBeCloseTo(cubeBounds.x + cubeBounds.width * 0.5)
      expect(frame.target.y).toBeCloseTo(cubeBounds.y + cubeBounds.height * 0.5)
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
