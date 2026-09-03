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
    expect(transform.wireDrawProgress).toBe(0)
    expect(transform.whiteFillProgress).toBe(0)
  })

  it('draws a full three-axis turn, fills white and freezes for handoff', () => {
    const spun = getMiniatureTransform(0.50)
    const filled = getMiniatureTransform(0.55)
    const handedOff = getMiniatureTransform(0.60)
    expect(spun.wireDrawProgress).toBe(1)
    expect(spun.rotation[0]).toBeCloseTo(Math.PI * 2 * 0.06)
    expect(spun.rotation[1]).toBeCloseTo(Math.PI * 2 * 0.32)
    expect(spun.rotation[2]).toBeCloseTo(Math.PI * 2 * 0.045)
    const scale40 = getMiniatureTransform(0.40).scale
    const scale45 = getMiniatureTransform(0.45).scale
    const scale50 = getMiniatureTransform(0.50).scale
    const firstIntervalShrink = scale40 - scale45
    const secondIntervalShrink = scale45 - scale50
    const thirdIntervalShrink = scale50 - filled.scale
    expect(firstIntervalShrink).toBeLessThan(secondIntervalShrink)
    expect(secondIntervalShrink).toBeLessThan(thirdIntervalShrink)
    expect(filled.containment).toBe(1)
    expect(filled.scale).toBeCloseTo(Math.pow(10, -3 * 0.75 * 0.75))
    expect(filled.whiteFillProgress).toBe(1)
    expect(filled.faceAlignProgress).toBe(1)
    expect(handedOff.scale).toBeCloseTo(filled.scale)
    expect(handedOff.canvasHandoffProgress).toBe(1)
    expect(handedOff.wireOpacity).toBe(0)
  })

  it('uses the same slow-to-fast quadratic curve for rotation and white fill', () => {
    const rotationHalfway = getMiniatureTransform(0.45)
    const fillHalfway = getMiniatureTransform(0.525)

    expect(rotationHalfway.rotation[0] / (Math.PI * 2 * 0.06)).toBeCloseTo(0.25)
    expect(rotationHalfway.rotation[1] / (Math.PI * 2 * 0.32)).toBeCloseTo(0.25)
    expect(rotationHalfway.rotation[2] / (Math.PI * 2 * 0.045)).toBeCloseTo(0.25)
    expect(fillHalfway.whiteFillProgress).toBeCloseTo(0.25)
    expect(fillHalfway.faceAlignProgress).toBeCloseTo(0.25)
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
