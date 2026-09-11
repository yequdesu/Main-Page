import { expect, it } from 'vitest'
import { createOverview, DEFAULT_KIND, DEFAULT_SEED, parseSeed, readSelection, selectionSearch } from '../model'
import { createFluxRopeSimulation } from '../../../behaviors/stellarPlasma'
import { MAGNETIC } from '../../../behaviors/stellarMagnetism'

it('种子输入拒绝非数值及越界值，URL 可复现并安全回退', () => {
  for (const invalid of ['', ' ', 'NaN', 'Infinity', '-0.1', '1', '1.2', '0.2foo', '1e-3']) expect(parseSeed(invalid)).toBeNull()
  for (const value of ['0', '.47', ' 0.999999 ', '0.']) expect(parseSeed(value)).toBe(Number(value))
  expect(readSelection('?type=unknown&seed=oops')).toEqual({ kind: DEFAULT_KIND, seed: DEFAULT_SEED })
  expect(readSelection(selectionSearch('nested', 0.173))).toEqual({ kind: 'nested', seed: 0.173 })
})

it('SVG 直接投影共享模型路径，种子改变构型，相同选择可重放', () => {
  const overview = createOverview(0.47, 'nested'), model = createFluxRopeSimulation(0.47, false, 'nested')
  expect(overview).toEqual(createOverview(0.47, 'nested'))
  expect(overview.paths).not.toEqual(createOverview(0.17, 'nested').paths)
  expect(overview.structure).toEqual(model.structure)
  expect(overview.structure.companion).not.toBe('nested')
  expect(overview.paths).toHaveLength(MAGNETIC.strands)
  expect(overview.feet).toHaveLength(model.structure.families.length * 2)
  const first = `M${(160 + model.curveData[0] * 66).toFixed(2)},${(143 - model.curveData[1] * 76).toFixed(2)}`
  expect(overview.paths[0].startsWith(first)).toBe(true)
  expect(overview.paths.join('')).not.toMatch(/NaN|Infinity/)
})
