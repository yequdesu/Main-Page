import { describe, expect, it } from 'vitest'
import {
  buildSquareWaveBand,
  buildSquareWavePlan,
  getSquareWaveBandFrame,
  getSquareWaveFrame,
  SQUARE_WAVE_FADE_GENERATIONS,
  SQUARE_WAVE_LIFETIME,
  splitSquareWaveForContour,
} from '../squareWaveTransition'

describe('square wave transition', () => {
  it('builds a deterministic, unique and outward-only plan', () => {
    const first = buildSquareWavePlan(18)
    const second = buildSquareWavePlan(18)
    expect(second).toEqual(first)

    const occupied = new Set<string>()
    for (const cell of first) {
      const key = `${cell.x}:${cell.y}`
      expect(occupied.has(key)).toBe(false)
      occupied.add(key)
      if (cell.birthGeneration === 0) continue

      const childDistance = Math.hypot(cell.x, cell.y)
      const parentDistance = Math.hypot(cell.parentX, cell.parentY)
      expect(childDistance).toBeGreaterThan(parentDistance)
      expect(Math.abs(cell.x - cell.parentX)).toBeLessThanOrEqual(1)
      expect(Math.abs(cell.y - cell.parentY)).toBeLessThanOrEqual(1)
    }
  })

  it('moves children from their parent and expires cells after six generations', () => {
    const plan = buildSquareWavePlan(8)
    const firstChild = plan.find((cell) => cell.birthGeneration > 0)
    expect(firstChild).toBeDefined()
    const frameAtBirth = getSquareWaveFrame(plan, firstChild!.birthGeneration)
    const spriteAtBirth = frameAtBirth.find((sprite) =>
      sprite.x === firstChild?.parentX && sprite.y === firstChild?.parentY)
    expect(spriteAtBirth).toBeDefined()

    const lateFrame = getSquareWaveFrame(plan, SQUARE_WAVE_LIFETIME + 0.5)
    expect(lateFrame.some((sprite) => sprite.x === 0 && sprite.y === 0)).toBe(false)
  })

  it('keeps cells solid for three generations and fades them over the final three', () => {
    expect(SQUARE_WAVE_LIFETIME).toBe(6)
    expect(SQUARE_WAVE_FADE_GENERATIONS).toBe(3)
    const plan = buildSquareWavePlan(2)
    const atFadeStart = getSquareWaveFrame(plan, 3).find((sprite) => sprite.x === 0 && sprite.y === 0)
    const halfway = getSquareWaveFrame(plan, 4.5).find((sprite) => sprite.x === 0 && sprite.y === 0)
    expect(atFadeStart?.opacity).toBe(1)
    expect(halfway?.opacity).toBeCloseTo(0.5)
  })

  it('freezes only solid cells and lets the fading tail expire', () => {
    const plan = buildSquareWavePlan(12)
    const splitGeneration = 10
    const { solidSprites, fadingCells } = splitSquareWaveForContour(plan, splitGeneration)
    expect(solidSprites.length).toBeGreaterThan(0)
    expect(solidSprites.every((sprite) => sprite.opacity === 1)).toBe(true)
    expect(fadingCells.length).toBeGreaterThan(0)
    expect(getSquareWaveFrame(fadingCells, splitGeneration).some((sprite) => sprite.opacity < 1)).toBe(true)
    expect(getSquareWaveFrame(
      fadingCells,
      splitGeneration + SQUARE_WAVE_FADE_GENERATIONS,
    )).toHaveLength(0)
  })

  it('supports a 1000-cell radius by constructing only the live annulus', () => {
    const band = buildSquareWaveBand(1000)
    const frame = getSquareWaveBandFrame(1000)
    expect(band.length).toBeGreaterThan(10000)
    expect(band.length).toBeLessThan(100000)
    expect(frame.length).toBeGreaterThan(10000)
    expect(frame.every((sprite) => Math.hypot(sprite.x, sprite.y) > 990)).toBe(true)
  })

  it('uses Euclidean radius so axis and diagonal fronts stay circular', () => {
    const plan = buildSquareWavePlan(12)
    const axis = plan.find((cell) => cell.x === 10 && cell.y === 0)
    const diagonal = plan.find((cell) => cell.x === 7 && cell.y === 7)
    expect(axis).toBeDefined()
    expect(diagonal).toBeDefined()
    expect(Math.abs(axis!.birthGeneration - diagonal!.birthGeneration)).toBeLessThan(0.6)
  })
})
