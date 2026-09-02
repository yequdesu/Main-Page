import { describe, expect, it } from 'vitest'
import { buildMiniatureWireGeometry } from '../../actors/MiniatureUniverse'

describe('miniature wire geometry', () => {
  it('contains twelve edges drawn outward from one seed corner', () => {
    const geometry = buildMiniatureWireGeometry()
    const positions = geometry.getAttribute('position')
    const distances = geometry.getAttribute('aPathDistance')

    expect(positions.count).toBe(24)
    expect(distances.count).toBe(24)
    const values = Array.from(distances.array as Float32Array)
    expect(values.filter((value) => value === 0)).toHaveLength(3)
    expect(Math.max(...values)).toBe(1)
    geometry.dispose()
  })
})
