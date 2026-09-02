import { BoxGeometry, Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildReefObstacleMask,
  buildReefProximityField,
  OCEAN_BOUNDS,
  OCEAN_CENTER_Z,
} from '../reefObstacleMask'
import { MINIATURE_CUBE_HALF_SIZE, MINIATURE_PIVOT } from '../miniatureUniverse'

describe('reef obstacle mask', () => {
  it('keeps the ocean bounds inside the miniature cube', () => {
    expect(OCEAN_CENTER_Z).toBe(MINIATURE_PIVOT[2])
    expect(OCEAN_BOUNDS.maxX).toBeLessThan(MINIATURE_CUBE_HALF_SIZE)
    expect(-OCEAN_BOUNDS.minX).toBeLessThan(MINIATURE_CUBE_HALF_SIZE)
    expect(OCEAN_BOUNDS.maxZ - OCEAN_CENTER_Z).toBeLessThan(MINIATURE_CUBE_HALF_SIZE)
    expect(OCEAN_CENTER_Z - OCEAN_BOUNDS.minZ).toBeLessThan(MINIATURE_CUBE_HALF_SIZE)
  })

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

  it('builds a smooth outward proximity field around the footprint', () => {
    const resolution = 9
    const mask = new Uint8Array(resolution * resolution)
    mask[4 * resolution + 4] = 255
    const field = buildReefProximityField(mask, resolution, 4)
    const sample = (x: number, y: number, channel: number) => (
      field[(y * resolution + x) * 4 + channel]
    )

    expect(sample(4, 4, 0)).toBe(255)
    expect(sample(4, 4, 1)).toBe(255)
    expect(sample(5, 4, 1)).toBeGreaterThan(sample(7, 4, 1))
    expect(sample(0, 0, 1)).toBe(0)
    expect(sample(0, 0, 3)).toBe(255)
  })
})
