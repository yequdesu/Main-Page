import { describe, expect, it } from 'vitest'
import { Matrix4, Vector3 } from 'three'
import { interiorViewRay, sunsetSkyShader } from '../sunsetSky'

describe('bounded directional sunset', () => {
  it('samples one direction across both cut faces at their shared corner', () => {
    const camera = new Vector3(0, 4, 80)
    const identity = new Matrix4()
    const a = interiorViewRay(camera, new Vector3(31.99, 10, -32), identity)
    const b = interiorViewRay(camera, new Vector3(32, 10, -31.99), identity)
    expect(a.distanceTo(b)).toBeLessThan(.001)
    expect(sunsetSkyShader).not.toContain('vLocal.y')
  })
  it('keeps distant sky along a ray independent of wall distance and follows world rotation', () => {
    const camera = new Vector3(0, 0, 80)
    const a = interiorViewRay(camera, new Vector3(0, 0, 0), new Matrix4())
    const b = interiorViewRay(camera, new Vector3(0, 0, -32), new Matrix4())
    expect(a.distanceTo(b)).toBeLessThan(1e-12)
    const rotated = interiorViewRay(camera, new Vector3(), new Matrix4().makeRotationY(Math.PI / 2))
    expect(Math.abs(rotated.x)).toBeCloseTo(1)
    expect(Math.abs(rotated.z)).toBeLessThan(1e-12)
  })
})
