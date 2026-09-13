import { describe, expect, it } from 'vitest'
import { CORE_ACTORS } from '../coreActors'
import { getDomLayer, getWebglLayer, listLayers, resolvePointerEvents } from '../layerRegistry'
import { validateActorSpecs } from '../invariants'

describe('composition registries', () => {
  it('declares the core actor/layer model without invariant warnings', () => {
    expect(CORE_ACTORS.length).toBeGreaterThan(10)
    expect(listLayers().length).toBeGreaterThan(10)
    expect(validateActorSpecs(CORE_ACTORS)).toEqual([])
  })

  it('warns when an actor uses a layer from the wrong render domain', () => {
    expect(validateActorSpecs([
      {
        id: 'badDomActor',
        domain: 'dom',
        layer: 'webgl.grid',
        lifecycle: { mount: 'always', dispose: 'none' },
      },
    ])).toContain('badDomActor: dom actor uses webgl layer "webgl.grid"')
  })

  it('returns typed layer contracts and rejects wrong layer domains', () => {
    expect(getWebglLayer('webgl.grid')).toMatchObject({
      kind: 'webgl',
      renderOrder: 2,
      depthTest: true,
      depthWrite: false,
    })
    expect(getDomLayer('dom.canvas')).toMatchObject({
      kind: 'dom',
      zIndex: 0,
      position: 'fixed',
    })
    expect(() => getWebglLayer('dom.canvas')).toThrow(/not a WebGL layer/)
    expect(() => getDomLayer('webgl.grid')).toThrow(/not a DOM\/SVG layer/)
  })

  it('resolves pointer policies into CSS pointer-events values', () => {
    expect(resolvePointerEvents('auto')).toBe('auto')
    expect(resolvePointerEvents('none')).toBe('none')
    expect(resolvePointerEvents('autoWhenVisible', true)).toBe('auto')
    expect(resolvePointerEvents('autoWhenVisible', false)).toBe('none')
  })
})
