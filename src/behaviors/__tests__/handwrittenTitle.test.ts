import { describe, expect, it } from 'vitest'
import { buildGlyphDfsPlan, getGlyphDfsFrame } from '../handwrittenTitle'

describe('handwritten title raster DFS', () => {
  it('visits every connected glyph cell from one source with adjacent steps', () => {
    const plan = buildGlyphDfsPlan([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ])

    expect(plan.cellsByVisit).toHaveLength(5)
    expect(new Set(plan.cellsByVisit.map(({ cell }) => `${cell.x},${cell.y}`)).size).toBe(5)
    for (let index = 1; index < plan.walk.length; index += 1) {
      if (plan.walk[index].breakBefore) continue
      const dx = Math.abs(plan.walk[index].x - plan.walk[index - 1].x)
      const dy = Math.abs(plan.walk[index].y - plan.walk[index - 1].y)
      expect(Math.max(dx, dy)).toBeLessThanOrEqual(1)
    }
  })

  it('uses a pen lift for disconnected accents instead of drawing a bridge', () => {
    const plan = buildGlyphDfsPlan([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 4 },
      { x: 1, y: 4 },
    ])
    expect(plan.walk.filter((step) => step.breakBefore)).toHaveLength(1)
    expect(getGlyphDfsFrame(plan, 1, 2).visibleCellCount).toBe(4)
  })

  it('reveals monotonically and removes the active brush at completion', () => {
    const plan = buildGlyphDfsPlan(Array.from({ length: 12 }, (_, x) => ({ x, y: 0 })))
    const early = getGlyphDfsFrame(plan, 0.25, 2)
    const middle = getGlyphDfsFrame(plan, 0.5, 2)
    const complete = getGlyphDfsFrame(plan, 1, 2)

    expect(middle.visibleCellCount).toBeGreaterThan(early.visibleCellCount)
    expect(complete.visibleCellCount).toBe(12)
    expect(complete.main).toBeNull()
    expect(complete.trail).toHaveLength(0)
  })
})
