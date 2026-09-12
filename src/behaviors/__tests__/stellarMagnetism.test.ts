import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { MAGNETIC, createMagneticDeformation, magneticFieldStrength, magneticFluxRadius, magneticSourceCoordinate, sampleMagneticStrand } from '../stellarMagnetism'

it('磁重联切换时新旧路径逐点重合，随后上下支分离且没有自由断头', () => {
  const a = new Vector3(), b = new Vector3(), seed = 0.37
  const shape = createMagneticDeformation(seed)
  for (let strand = 0; strand < MAGNETIC.strands; strand++) {
    const jitter = (strand * 0.618 + seed) % 1
    const radius = 1.48 + 0.32 * jitter + 1.38 * MAGNETIC.contact
    for (const branch of [1, 2] as const) for (let i = 0; i <= 100; i++) {
      const s = i / 100
      sampleMagneticStrand(s, strand, radius, seed, branch, a, shape)
      sampleMagneticStrand(magneticSourceCoordinate(s, branch), strand, radius, seed, 0, b, shape)
      expect(a.distanceTo(b)).toBeLessThan(1e-8)
    }
    for (const r of [radius, radius + 0.15, 4]) {
      sampleMagneticStrand(0, strand, r, seed, 1, a, shape)
      sampleMagneticStrand(1, strand, r, seed, 1, b, shape)
      expect(a.distanceTo(b)).toBeLessThan(1e-8)
      for (const s of [0, 1]) {
        sampleMagneticStrand(s, strand, r, seed, 2, a, shape)
        sampleMagneticStrand(s, strand, 1, seed, 0, b, shape)
        expect(a.distanceTo(b)).toBeLessThan(1e-8)
      }
    }
    sampleMagneticStrand(0, strand, 4, seed, 1, a, shape)
    sampleMagneticStrand(0.5, strand, 4, seed, 2, b, shape)
    expect(a.y - b.y).toBeGreaterThan(1)
  }
})

it('局部截面遵循磁通守恒，随高度和左右场强不同而变化', () => {
  const seed = 0.23
  const flux = (s: number, h: number) => magneticFieldStrength(s, h, seed) * Math.PI * magneticFluxRadius(s, h, seed) ** 2
  expect(flux(0.2, 0)).toBeCloseTo(flux(0.8, 3), 12)
  expect(magneticFluxRadius(0.5, 3, seed)).toBeGreaterThan(magneticFluxRadius(0.5, 0, seed))
  expect(magneticFluxRadius(0.1, 1, seed)).not.toBeCloseTo(magneticFluxRadius(0.9, 1, seed), 3)
})

it('环系的归一化拱顶形状不同，质量负载会改变形状而非仅改变统一半径', () => {
  const a = createMagneticDeformation(0.12), b = createMagneticDeformation(0.47)
  expect(Math.abs(a.apexPower - b.apexPower)).toBeGreaterThan(0.1)
  expect(Math.abs(a.dipCenter - b.dipCenter)).toBeGreaterThan(0.05)
  const cold = createMagneticDeformation(0.3), hot = createMagneticDeformation(0.3)
  const mass = new Float64Array([0.3, 0.4, 0.45, 0.6]), branches = new Uint8Array(4)
  const coldMass = new Float64Array(4).fill(0.1), hotMass = new Float64Array(4).fill(1)
  for (let i = 0; i < 600; i++) {
    cold.step(1 / 120, 1, mass, coldMass, branches)
    hot.step(1 / 120, 1, mass, hotMass, branches)
  }
  expect(cold.component(0.45, 1)).toBeLessThan(hot.component(0.45, 1) - 0.03)
  expect(cold.component(0, 1)).toBe(0)
  expect(Math.abs(cold.component(1, 1))).toBeLessThan(1e-10)
})

it('不同环系的质量只作用于各自的形变模态', () => {
  const a = createMagneticDeformation(0.3), b = createMagneticDeformation(0.3)
  const position = new Float64Array([0.4, 0.6, 0.4, 0.6]), branches = new Uint8Array(4)
  const temperatureA = new Float64Array([0.1, 0.2, 0.1, 0.1])
  const temperatureB = new Float64Array([0.1, 0.2, 1, 1])
  for (let i = 0; i < 300; i++) {
    a.step(1 / 120, 1, position, temperatureA, branches, 0, 2)
    b.step(1 / 120, 1, position, temperatureB, branches, 0, 2)
  }
  expect(a.displacement).toEqual(b.displacement)
})
