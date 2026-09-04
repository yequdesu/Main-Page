import { describe, expect, it } from 'vitest'
import {
  containOceanX,
  getDirectedFaceAlignmentRotation,
  getContainedBeamDepthScale,
  getMiniatureTransform,
} from '../miniatureUniverse'

describe('miniature universe transition', () => {
  it('is an exact identity before the transition', () => {
    const transform = getMiniatureTransform(0.24)
    expect(transform.progress).toBe(0)
    expect(transform.containment).toBe(0)
    expect(transform.scale).toBe(1)
    expect(transform.rotation).toEqual([0, 0, 0])
    expect(transform.wireOpacity).toBe(0)
    expect(transform.wireDrawProgress).toBe(0)
    expect(transform.whiteFillProgress).toBe(0)
  })

  it('draws a full three-axis turn, fills white and freezes for handoff', () => {
    const spun = getMiniatureTransform(0.45)
    const filled = getMiniatureTransform(0.55)
    const handedOff = getMiniatureTransform(0.60)
    expect(spun.wireDrawProgress).toBe(1)
    expect(spun.rotation[0]).toBeCloseTo(Math.PI * 2 * 0.06)
    expect(spun.rotation[1]).toBeCloseTo(Math.PI * 2 * 0.32)
    expect(spun.rotation[2]).toBeCloseTo(Math.PI * 2 * 0.045)
    expect(getMiniatureTransform(0.35).scale).toBeLessThan(0.2)
    expect(filled.containment).toBe(1)
    expect(filled.scale).toBeCloseTo(Math.pow(10, -3 * 0.75 * 0.75))
    expect(filled.whiteFillProgress).toBe(1)
    expect(filled.faceAlignProgress).toBe(1)
    expect(handedOff.scale).toBeCloseTo(filled.scale)
    expect(handedOff.canvasHandoffProgress).toBe(1)
    expect(handedOff.wireOpacity).toBe(0)
  })

  it('soft-caps only offscreen ocean vertices and is reversible', () => {
    expect(containOceanX(20, 1)).toBe(20)
    expect(containOceanX(80, 0)).toBe(80)
    expect(containOceanX(80, 1)).toBeGreaterThan(28)
    expect(containOceanX(80, 1)).toBeLessThan(31.5)
    expect(containOceanX(-80, 1)).toBeCloseTo(-containOceanX(80, 1))
    expect(containOceanX(80, getMiniatureTransform(0.24).containment)).toBe(80)
  })

  it('shortens the beam only as containment enters', () => {
    expect(getContainedBeamDepthScale(0)).toBe(1)
    expect(getContainedBeamDepthScale(1)).toBeCloseTo(0.42)
  })

  it('keeps face alignment rotating forward around the vertical axis', () => {
    const start = getMiniatureTransform(0.45).rotation
    const cameraFacing = [-0.027, 0, 0] as const
    const halfway = getDirectedFaceAlignmentRotation(start, cameraFacing, 0.5)
    const aligned = getDirectedFaceAlignmentRotation(start, cameraFacing, 1)

    expect(halfway[1]).toBeGreaterThan(start[1])
    expect(aligned[1]).toBeGreaterThan(halfway[1])
    expect(aligned[1]).toBeCloseTo(Math.PI)
    expect(aligned[0]).toBeCloseTo(cameraFacing[0])
    expect(aligned[2]).toBeCloseTo(cameraFacing[2])
  })
})
