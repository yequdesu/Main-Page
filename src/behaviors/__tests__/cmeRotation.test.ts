import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { cmeRotationAngle, cmeRotationPlan, createCmeRotation } from '../cmeRotation'
import { createMagneticDeformation, MAGNETIC, magneticSourceCoordinate, sampleMagneticStrand } from '../stellarMagnetism'
import { createFluxRopeSimulation } from '../stellarPlasma'

it('种子方案可重放且具有双向差异，旋转连续积累、闭合后不归零', () => {
  const signs = new Set<number>(), angles = new Set<number>()
  for (const seed of [0, 0.17, 0.47, 0.79, 0.999, 0.12, 0.051]) {
    const plan = cmeRotationPlan(seed)
    expect(plan).toEqual(cmeRotationPlan(seed))
    signs.add(plan.handedness); angles.add(plan.degrees)
    expect(plan.degrees).toBeGreaterThanOrEqual(15)
    expect(plan.degrees).toBeLessThanOrEqual(75)
    let previous = 0
    for (let r = 1; r < 4; r += 0.001) {
      const angle = cmeRotationAngle(r, plan) * plan.handedness
      expect(angle).toBeGreaterThanOrEqual(previous - 1e-12)
      expect(angle - previous).toBeLessThan(0.007)
      previous = angle
    }
    expect(cmeRotationAngle(10, plan)).toBeCloseTo(cmeRotationAngle(4, plan), 12)
  }
  expect(signs.size).toBe(2); expect(angles.size).toBe(7)
  expect(cmeRotationPlan(0.12).degrees).toBeGreaterThan(70)
  expect(cmeRotationPlan(0.051).degrees).toBeGreaterThan(70)
  expect(cmeRotationPlan(0.12).handedness).toBe(-cmeRotationPlan(0.051).handedness)
})

it('高度扭转固定足点与收颈，可逆、不压扁环体；新旧连接在接触时仍连续', () => {
  const a = new Vector3(), b = new Vector3()
  for (const seed of [0.17, 0.47, 0.79, 0.12, 0.051]) {
    const rotation = createCmeRotation(seed)
    const shape = createMagneticDeformation(seed, undefined, rotation.plan.handedness)
    for (let strand = 0; strand < MAGNETIC.strands; strand++) {
      const contact = 1.48 + 0.32 * ((strand * 0.618 + seed) % 1) + 1.38 * MAGNETIC.contact
      rotation.update(contact, shape)
      for (const branch of [1, 2] as const) for (let j = 0; j <= 30; j++) {
        const s = j / 30
        rotation.apply(sampleMagneticStrand(s, strand, contact, seed, branch, a, shape))
        rotation.apply(sampleMagneticStrand(magneticSourceCoordinate(s, branch), strand, contact, seed, 0, b, shape))
        expect(a.distanceTo(b)).toBeLessThan(1e-8)
      }
      for (const radius of [contact, contact + 0.3, 4]) {
        rotation.update(radius, shape)
        rotation.apply(sampleMagneticStrand(0, strand, radius, seed, 1, a, shape))
        rotation.apply(sampleMagneticStrand(1, strand, radius, seed, 1, b, shape))
        expect(a.distanceTo(b)).toBeLessThan(1e-8)
      }
    }
    for (const y of [0, rotation.neckHeight, rotation.neckHeight + 0.3, rotation.neckHeight + 2]) {
      a.set(0.8, y, 0.2); b.copy(a); rotation.apply(a)
      expect(a.y).toBe(y)
      expect(Math.hypot(a.x - rotation.centerX, a.z - rotation.centerZ)).toBeCloseTo(Math.hypot(b.x - rotation.centerX, b.z - rotation.centerZ), 12)
      if (y <= rotation.neckHeight) expect(a).toEqual(b)
      rotation.apply(a, true)
      expect(a.distanceTo(b)).toBeLessThan(1e-10)
    }
  }
})

it.each([0.47, 0.12, 0.051])('旋扭作用于实际路径和外流，开关不改变闭合时刻或普通日珥：seed=%s', seed => {
  const on = createFluxRopeSimulation(seed, true)
  const off = createFluxRopeSimulation(seed, true, undefined, undefined, false)
  on.advanceTo(8.5); off.advanceTo(8.5)
  expect(on.ejection!.closureTimes).toEqual(off.ejection!.closureTimes)
  expect(on.curveData).not.toEqual(off.curveData)
  expect(on.ejection!.positions).not.toEqual(off.ejection!.positions)
  expect(on.ejection!.velocities).not.toEqual(off.ejection!.velocities)
  expect(on.ejection!.positions.every(Number.isFinite)).toBe(true)
  const a = new Vector3(), b = new Vector3()
  for (const s of [0, 1]) {
    on.sample(s, 0, 2, a); off.sample(s, 0, 2, b)
    expect(a.distanceTo(b)).toBeLessThan(1e-9)
  }
  const quiet = createFluxRopeSimulation(0.47, false), quietOff = createFluxRopeSimulation(0.47, false, undefined, undefined, false)
  quiet.advanceTo(2); quietOff.advanceTo(2)
  expect(quiet.rotation).toBeNull()
  expect(quiet.curveData).toEqual(quietOff.curveData)
})
