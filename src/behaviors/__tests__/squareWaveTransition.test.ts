import { describe, expect, it } from 'vitest'
import {
  buildSquareWavePlan,
  getRequiredSquareWaveGenerations,
  getSquareWaveFrame,
  SQUARE_WAVE_LIFETIME,
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

  it('moves children from their parent and expires cells after four generations', () => {
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

  it('uses Euclidean radius so axis and diagonal fronts stay circular', () => {
    const plan = buildSquareWavePlan(12)
    const axis = plan.find((cell) => cell.x === 10 && cell.y === 0)
    const diagonal = plan.find((cell) => cell.x === 7 && cell.y === 7)
    expect(axis).toBeDefined()
    expect(diagonal).toBeDefined()
    expect(Math.abs(axis!.birthGeneration - diagonal!.birthGeneration)).toBeLessThan(0.6)
  })

  it('allocates enough generations to cross the viewport corners', () => {
    const width = 1920
    const height = 1080
    const squareSize = 48
    const spacing = squareSize * 1.1
    const generations = getRequiredSquareWaveGenerations(width, height, squareSize)
    expect(generations).toBeGreaterThan(Math.hypot(width * 0.5, height * 0.5) / spacing)

    const finalRing = getSquareWaveFrame(
      buildSquareWavePlan(generations),
      generations - 0.001,
    )
    expect(finalRing.every((sprite) =>
      Math.abs(sprite.x * spacing) - squareSize * 0.5 > width * 0.5 ||
      Math.abs(sprite.y * spacing) - squareSize * 0.5 > height * 0.5,
    )).toBe(true)
  })
})
