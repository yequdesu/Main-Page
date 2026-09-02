import { BoxGeometry, Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { buildReefObstacleMask } from '../reefObstacleMask'

describe('reef obstacle mask', () => {
  it('rasterises the actual mesh footprint into ocean coordinates', () => {
    const source = new Group()
    const reef = new Mesh(new BoxGeometry(2, 2, 2))
    reef.name = 'Plane'
    source.add(reef)

    const resolution = 64
    const mask = buildReefObstacleMask(
      source,
      { resolution, modelScale: 1, centerZ: 0, dilation: 0 },
      { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
    )

    const center = mask[32 * resolution + 32]
    const corner = mask[2 * resolution + 2]
    const occupied = mask.reduce((count, value) => count + (value > 0 ? 1 : 0), 0)
    expect(center).toBe(255)
    expect(corner).toBe(0)
    expect(occupied).toBeGreaterThan(150)
    expect(occupied).toBeLessThan(400)
  })
})

