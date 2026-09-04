import { describe, expect, it } from 'vitest'
import { getGyroOrbitWorldPoint, GYRO_RINGS } from '../orbitGeometry'

describe('gyro orbit geometry', () => {
  it('shares all three decorative orbit definitions with projection and rendering', () => {
    expect(GYRO_RINGS).toHaveLength(3)
  })

  it('produces a deterministic closed three-dimensional orbit', () => {
    const center = { x: 0, y: -1, z: -24 }
    GYRO_RINGS.forEach((config) => {
      const start = getGyroOrbitWorldPoint(config, 0, center)
      const end = getGyroOrbitWorldPoint(config, Math.PI * 2, center)
      expect(end.x).toBeCloseTo(start.x, 10)
      expect(end.y).toBeCloseTo(start.y, 10)
      expect(end.z).toBeCloseTo(start.z, 10)
    })
  })
})
