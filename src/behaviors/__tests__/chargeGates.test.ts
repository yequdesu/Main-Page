import { describe, expect, it } from 'vitest'
import { CHARGE_GATE_POINTS, chargeFromInput, constrainChargeProgress, createChargeGates,
  finishChargeGate, tickChargeGates, createWheelIntentFilter, createForwardCubeAlignment,
  sampleCubeAlignment, CUBE_HOLD_SPEED, chargeGates, resetChargeGates, getOrbitHoldPhase } from '../chargeGates'
import { TIMELINE } from '../../composition/timeline'
import { getSquareContourTransitionFrame } from '../act2SquareContourTransition'
import { getPixelOrbitGeometry } from '../pixelOrbitReveal'

describe('scroll energy gates', () => {
  it('catches fast jumps in order and never charges from overshoot or inertia', () => {
    const state = createChargeGates()
    expect(constrainChargeProgress(state, 0, 1)).toBe(CHARGE_GATE_POINTS[0])
    expect(state.active).toBe(0)
    for (let i = 0; i < 100; i++) {
      expect(constrainChargeProgress(state, CHARGE_GATE_POINTS[0], 1)).toBe(CHARGE_GATE_POINTS[0])
      tickChargeGates(state, i * 16)
    }
    expect(state.energy).toBe(0)
    expect(state.clocks[0]).toBeGreaterThan(1)
    chargeFromInput(state, 1e8, 800, 1600)
    expect(state.energy).toBe(.12)
    expect(state.mode).toBe('charging')
  })
  it('requires fresh energy on re-entry, with double speed only after completion', () => {
    const state = createChargeGates(), point = CHARGE_GATE_POINTS[0]
    constrainChargeProgress(state, 0, point)
    chargeFromInput(state, 80, 800, 0)
    expect(state.energy).toBe(.1)
    constrainChargeProgress(state, point, point - .01)
    constrainChargeProgress(state, point - .01, point)
    chargeFromInput(state, 80, 800, 0)
    expect(state.energy).toBe(.1) // abandoned attempts do not unlock faster charging
    for (let i = 0; i < 9; i++) chargeFromInput(state, 80, 800, 10 + i)
    expect(state.mode).toBe('releasing')
    expect(constrainChargeProgress(state, point, 1)).toBe(point)
    finishChargeGate(state)
    expect(state.completed).toEqual([true, false])
    constrainChargeProgress(state, point + .1, point - .01)
    constrainChargeProgress(state, point - .01, point)
    expect(state.energy).toBe(0)
    chargeFromInput(state, 80, 800, 200)
    expect(state.energy).toBe(.2)
  })
  it('leaks energy when input stops, not while fresh physical input continues', () => {
    const state = createChargeGates()
    constrainChargeProgress(state, 0, 1)
    tickChargeGates(state, 0)
    chargeFromInput(state, 80, 800, 0)
    tickChargeGates(state, 100)
    expect(state.energy).toBe(.1)
    for (let time = 200; time <= 1000; time += 100) tickChargeGates(state, time)
    expect(state.energy).toBe(0)
    expect(state.active).toBe(0)
  })
  it('second gate releases after showing full energy, with no carried impulse', () => {
    const state = createChargeGates()
    state.unlocked[0] = true
    expect(constrainChargeProgress(state, CHARGE_GATE_POINTS[0] + .01, 1)).toBe(CHARGE_GATE_POINTS[1])
    for (let i = 0; i < 10; i++) chargeFromInput(state, 100, 800, i)
    expect(state.mode).toBe('releasing')
    tickChargeGates(state, 0); tickChargeGates(state, 100); tickChargeGates(state, 200)
    expect(state.active).toBe(-1)
    expect(state.released).toBe(CHARGE_GATE_POINTS[1])
    expect(state.completed).toEqual([false, true])
  })
  it('allows reversing while charging and while aligning', () => {
    for (const mode of ['charging', 'releasing'] as const) {
      const state = createChargeGates()
      constrainChargeProgress(state, 0, 1); state.mode = mode
      const back = CHARGE_GATE_POINTS[0] - .001
      expect(constrainChargeProgress(state, CHARGE_GATE_POINTS[0], back)).toBe(back)
      expect(state.active).toBe(-1)
      expect(state.energy).toBe(0)
      expect(state.unlocked[0]).toBe(false)
    }
  })
  it('filters decaying trackpad tails but keeps equal notches and renewed gestures', () => {
    const filter = createWheelIntentFilter()
    expect([120,120,120,120].map((d,i)=>filter(d,i*20))).toEqual([true,true,true,true])
    expect(filter(70,100)).toBe(true)
    expect(filter(40,120)).toBe(false)
    expect(filter(10,140)).toBe(false)
    expect(filter(120,180)).toBe(true)
    expect(filter(40,500)).toBe(true)
  })
  it('aligns to the next side face at the same positive angular speed', () => {
    for (const yaw of [-8, 0, .3, 2, 4, 13, 40]) {
      const alignment = createForwardCubeAlignment([.38,yaw,.28], [-.03,0,0])
      expect(alignment.to[1]).toBeGreaterThan(yaw)
      expect(alignment.to[1] - yaw).toBeLessThanOrEqual(Math.PI / 2 + .001)
      expect(alignment.to[1] / (Math.PI / 2)).toBeCloseTo(Math.round(alignment.to[1] / (Math.PI / 2)))
      expect(sampleCubeAlignment(alignment,0)).toEqual(alignment.from)
      expect(sampleCubeAlignment(alignment,alignment.duration)).toEqual(alignment.to)
      const a = sampleCubeAlignment(alignment, alignment.duration * .2)
      const b = sampleCubeAlignment(alignment, alignment.duration * .7)
      expect((b[1]-a[1]) / (alignment.duration * .5)).toBeCloseTo(CUBE_HOLD_SPEED)
    }
  })
  it('holds a fully vector ring and complete logo, with continuous orbit offset on release/reverse', () => {
    resetChargeGates()
    const p = CHARGE_GATE_POINTS[1]
    expect(p).toBe(TIMELINE.squareCircleMorph.end)
    const frame = getSquareContourTransitionFrame(p, 1200, 800)
    expect(frame.titleAlpha).toBe(1)
    expect(frame.titleWriteProgress).toBe(1)
    chargeGates.clocks[1] = 10
    const phase = getOrbitHoldPhase(p)
    const a = getPixelOrbitGeometry(p, 100, 1, 1, phase)
    const b = getPixelOrbitGeometry(p, 100, 1, 1, phase + .01)
    expect(a).toHaveLength(48)
    expect(a[0].x).not.toBe(b[0].x)
    expect(getOrbitHoldPhase(p + .01)).toBe(phase)
    expect(getOrbitHoldPhase(0)).toBe(0)
    expect(getPixelOrbitGeometry(p, 100, 1, 1, getOrbitHoldPhase(p))).toEqual(a)
    resetChargeGates()
  })
})
