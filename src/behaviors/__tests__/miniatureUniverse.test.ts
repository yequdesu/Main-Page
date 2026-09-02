import { describe, expect, it } from 'vitest'
import {
  containOceanX,
  getContainedBeamDepthScale,
  getMiniatureTransform,
} from '../miniatureUniverse'

describe('miniature universe transition', () => {
  it('is an exact identity before the transition', () => {
    const transform = getMiniatureTransform(0.39)
    expect(transform.progress).toBe(0)
    expect(transform.containment).toBe(0)
    expect(transform.scale).toBe(1)
    expect(transform.rotation).toEqual([0, 0, 0])
    expect(transform.wireOpacity).toBe(0)
  })

  it('frames the cube around 49% and keeps shrinking to invisibility', () => {
    const framed = getMiniatureTransform(0.49)
    const gone = getMiniatureTransform(0.60)
    expect(framed.containment).toBe(1)
    expect(framed.scale).toBeLessThan(0.26)
    expect(framed.scale).toBeGreaterThan(0.23)
    expect(framed.wireOpacity).toBeGreaterThan(0.99)
    expect(gone.scale).toBeCloseTo(0.001)
    expect(gone.wireOpacity).toBe(0)
  })

  it('soft-caps only offscreen ocean vertices and is reversible', () => {
    expect(containOceanX(20, 1)).toBe(20)
    expect(containOceanX(80, 0)).toBe(80)
    expect(containOceanX(80, 1)).toBeGreaterThan(28)
    expect(containOceanX(80, 1)).toBeLessThan(31.5)
    expect(containOceanX(-80, 1)).toBeCloseTo(-containOceanX(80, 1))
    expect(containOceanX(80, getMiniatureTransform(0.39).containment)).toBe(80)
  })

  it('shortens the beam only as containment enters', () => {
    expect(getContainedBeamDepthScale(0)).toBe(1)
    expect(getContainedBeamDepthScale(1)).toBeCloseTo(0.42)
  })
})
