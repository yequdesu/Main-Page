import { expect, it } from 'vitest'
import { MAGNETIC } from '../stellarMagnetism'
import { PROMINENCE_MORPHOLOGIES, createProminenceStructure, selectProminenceMorphology } from '../stellarMorphology'

it('结构抽样符合基准权重，一大两小不再占据全部事件', () => {
  const counts = new Map<string, number>()
  for (let i = 0; i < 10000; i++) {
    const kind = selectProminenceMorphology((i + 0.5) / 10000)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  for (const item of PROMINENCE_MORPHOLOGIES) expect(counts.get(item.kind)).toBe(item.weight * 100)
  for (const sample of [0, 0.1, 0.5, 0.99, 1]) {
    expect(['bilateral', 'isolated']).not.toContain(selectProminenceMorphology(sample, 'bilateral', 'isolated'))
  }
})

it('六种构型具有不同的环系数量和足点关系，内部尺寸与朝向继续变化', () => {
  const sideSigns = new Set<number>(), oneSidedCounts = new Set<number>(), clusterCounts = new Set<number>()
  for (let i = 0; i < 30; i++) {
    const seed = (i + 0.5) / 30
    for (const { kind } of PROMINENCE_MORPHOLOGIES) {
      const structure = createProminenceStructure(seed, kind), f = structure.families
      expect(f.reduce((sum, family) => sum + family.strands, 0)).toBe(MAGNETIC.strands)
      for (const family of f) {
        expect(family.strands).toBeGreaterThanOrEqual(2)
        expect(family.width).toBeGreaterThan(0)
        expect(family.height).toBeGreaterThan(0)
        expect(Math.abs(family.offsetX) + family.width).toBeLessThan(2.1)
      }
      if (kind === 'isolated') expect(f.length).toBe(1)
      if (kind === 'one-sided') {
        oneSidedCounts.add(f.length); sideSigns.add(Math.sign(f[1].offsetX))
        for (const neighbor of f.slice(1)) expect(Math.sign(neighbor.offsetX)).toBe(Math.sign(f[1].offsetX))
      }
      if (kind === 'crossed') {
        expect(f.length).toBe(2)
        expect(f[0].yaw * f[1].yaw).toBeLessThan(0)
        expect(f[1].height).toBeLessThan(f[0].height * 0.8)
      }
      if (kind === 'nested') for (const inner of f.filter(item => item.sourceKind === kind).slice(1)) expect(Math.abs(inner.offsetX - f[0].offsetX) + inner.width).toBeLessThan(f[0].width)
      if (kind === 'cluster') {
        const small = f.filter(item => item.sourceKind === 'cluster'), hosts = f.filter(item => item.sourceKind !== 'cluster')
        clusterCounts.add(small.length)
        expect(hosts.length).toBeGreaterThanOrEqual(1)
        expect(f.length).toBeLessThanOrEqual(6)
        expect(Math.max(...hosts.map(item => item.height))).toBeGreaterThan(0.35)
        expect(Math.max(...small.map(item => item.height))).toBeLessThan(0.43)
        expect(Math.max(...hosts.map(item => item.height))).toBeGreaterThan(Math.max(...small.map(item => item.height)) * 1.8)
      }
      if (kind === 'bilateral') {
        expect(f.length).toBe(3)
        expect(f[1].offsetX * f[2].offsetX).toBeLessThan(0)
      }
    }
  }
  expect(sideSigns.size).toBe(2)
  expect([...oneSidedCounts].sort()).toEqual([2, 3])
  expect([...clusterCounts].sort()).toEqual([3, 4])
})

it('相同种子可复现，自动生成能覆盖全部构型且同类事件的参数不同', () => {
  const kinds = new Set<string>()
  for (let i = 0; i < 100; i++) {
    const seed = (i + 0.5) / 100
    const a = createProminenceStructure(seed)
    expect(a).toEqual(createProminenceStructure(seed))
    expect(a).toEqual(createProminenceStructure(seed, a.kind))
    kinds.add(a.kind)
  }
  expect(kinds.size).toBe(PROMINENCE_MORPHOLOGIES.length)
  expect(createProminenceStructure(0.2, 'isolated').families).not.toEqual(createProminenceStructure(0.7, 'isolated').families)
})


it('低矮环簇和嵌套拱廊始终在同一事件内伴随另一种完整类型，种子覆盖其余五类', () => {
  for (const kind of ['cluster', 'nested'] as const) {
    const companions = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const structure = createProminenceStructure((i + 0.5) / 2000, kind)
      expect(structure.companion).not.toBe(kind)
      expect(structure.companion).not.toBeNull()
      companions.add(structure.companion!)
      expect(new Set(structure.families.map(f => f.sourceKind))).toEqual(new Set([kind, structure.companion]))
      expect(structure.families.length).toBeLessThanOrEqual(6)
      expect(structure.families.reduce((sum, f) => sum + f.strands, 0)).toBe(12)
      for (const type of [kind, structure.companion!]) {
        const part = structure.families.filter(f => f.sourceKind === type)
        const limits = { isolated: [1, 1], 'one-sided': [2, 3], crossed: [2, 2], nested: [2, 3], cluster: [3, 4], bilateral: [3, 3] }[type]
        expect(part.length).toBeGreaterThanOrEqual(limits[0])
        expect(part.length).toBeLessThanOrEqual(limits[1])
      }
    }
    expect(companions.size).toBe(5)
  }
})
