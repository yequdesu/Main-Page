export type LayerDomain = 'webgl' | 'dom' | 'svg'

export type PointerPolicy = 'none' | 'auto' | 'autoWhenVisible'
export type CssPointerEvents = 'none' | 'auto'
export type BlendMode = 'normal' | 'additive'

export interface WebglLayerContract {
  kind: 'webgl'
  renderOrder: number
  depthTest: boolean
  depthWrite: boolean
  transparent: boolean
  blending?: BlendMode
  sort?: 'default' | 'manual' | 'instanced'
}

export interface DomLayerContract {
  kind: 'dom' | 'svg'
  zIndex: number
  position: 'fixed' | 'absolute'
  pointerEvents: PointerPolicy
  visibility?: 'mount' | 'hidden' | 'opacity'
}

export type LayerContract = WebglLayerContract | DomLayerContract

export interface RegisteredLayer {
  id: string
  contract: LayerContract
  description?: string
}

export const LAYERS = {
  'webgl.oceanLines': {
    id: 'webgl.oceanLines',
    contract: { kind: 'webgl', renderOrder: -1, depthTest: true, depthWrite: true, transparent: true, blending: 'normal' },
    description: 'Procedural Gerstner ocean with toon bands, reef foam and lighthouse response.',
  },
  'webgl.lightBeam': {
    id: 'webgl.lightBeam',
    contract: {
      kind: 'webgl',
      renderOrder: 0,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      blending: 'additive',
    },
  },
  'webgl.planets': {
    id: 'webgl.planets',
    contract: { kind: 'webgl', renderOrder: 1, depthTest: true, depthWrite: true, transparent: true },
  },
  'webgl.planetEffects': {
    id: 'webgl.planetEffects',
    contract: { kind: 'webgl', renderOrder: 1, depthTest: true, depthWrite: false, transparent: true },
  },
  'webgl.planetHalo': {
    id: 'webgl.planetHalo',
    contract: { kind: 'webgl', renderOrder: 9999, depthTest: true, depthWrite: false, transparent: true },
  },
  'webgl.star': {
    id: 'webgl.star',
    contract: { kind: 'webgl', renderOrder: 1, depthTest: true, depthWrite: false, transparent: true },
  },
  'webgl.grid': {
    id: 'webgl.grid',
    contract: { kind: 'webgl', renderOrder: 2, depthTest: true, depthWrite: false, transparent: true },
  },
  'webgl.debris': {
    id: 'webgl.debris',
    contract: { kind: 'webgl', renderOrder: 2, depthTest: true, depthWrite: false, transparent: true, sort: 'instanced' },
  },
  'dom.canvas': {
    id: 'dom.canvas',
    contract: { kind: 'dom', zIndex: 0, position: 'fixed', pointerEvents: 'auto' },
  },
  'dom.scrollHint': {
    id: 'dom.scrollHint',
    contract: { kind: 'dom', zIndex: 5, position: 'fixed', pointerEvents: 'none' },
  },
  'svg.focusOverlay': {
    id: 'svg.focusOverlay',
    contract: { kind: 'svg', zIndex: 5, position: 'fixed', pointerEvents: 'none' },
  },
  'dom.focusInversionBlocks': {
    id: 'dom.focusInversionBlocks',
    contract: { kind: 'dom', zIndex: 25, position: 'fixed', pointerEvents: 'none' },
    description: 'Topmost focus-only difference-blend blocks for the vertical center axis.',
  },
  'dom.brandTitle': {
    id: 'dom.brandTitle',
    contract: { kind: 'dom', zIndex: 10, position: 'fixed', pointerEvents: 'none' },
  },
  'dom.planetLabels': {
    id: 'dom.planetLabels',
    contract: { kind: 'dom', zIndex: 10, position: 'fixed', pointerEvents: 'autoWhenVisible' },
  },
  'dom.planetLabelBackdrop': {
    id: 'dom.planetLabelBackdrop',
    contract: { kind: 'dom', zIndex: 9, position: 'fixed', pointerEvents: 'auto' },
  },
  'dom.planetLabelExpanded': {
    id: 'dom.planetLabelExpanded',
    contract: { kind: 'dom', zIndex: 11, position: 'fixed', pointerEvents: 'autoWhenVisible' },
  },
  'svg.planetLabelGuides': {
    id: 'svg.planetLabelGuides',
    contract: { kind: 'svg', zIndex: 5, position: 'fixed', pointerEvents: 'none' },
  },
  'svg.planetLabelDebug': {
    id: 'svg.planetLabelDebug',
    contract: { kind: 'svg', zIndex: 8, position: 'fixed', pointerEvents: 'none' },
  },
  'dom.lusionAtmosphere': {
    id: 'dom.lusionAtmosphere',
    contract: { kind: 'dom', zIndex: 4, position: 'fixed', pointerEvents: 'none' },
    description: 'Independent Act 3 atmosphere overlay for Lusion particles and Tyndall light shafts.',
  },
  'dom.miniatureAbsorptionTrails': {
    id: 'dom.miniatureAbsorptionTrails',
    contract: { kind: 'dom', zIndex: 8, position: 'fixed', pointerEvents: 'none' },
    description: 'Screen-edge circle trails absorbed by the Act 1 miniature cube.',
  },
  'dom.act2SquareContourTransition': {
    id: 'dom.act2SquareContourTransition',
    contract: { kind: 'dom', zIndex: 7, position: 'fixed', pointerEvents: 'none' },
    description: 'Continuous square wave, Earendel title and deterministic Act 3 contour reveal.',
  },
  'dom.mainTerminal': {
    id: 'dom.mainTerminal',
    contract: { kind: 'dom', zIndex: 15, position: 'fixed', pointerEvents: 'auto' },
  },
  'dom.infoPanel': {
    id: 'dom.infoPanel',
    contract: { kind: 'dom', zIndex: 20, position: 'fixed', pointerEvents: 'auto' },
  },
  'dom.footer': {
    id: 'dom.footer',
    contract: { kind: 'dom', zIndex: 20, position: 'fixed', pointerEvents: 'none' },
  },
  'dom.debugPanel': {
    id: 'dom.debugPanel',
    contract: { kind: 'dom', zIndex: 1000, position: 'fixed', pointerEvents: 'auto' },
  },
} as const satisfies Record<string, RegisteredLayer>

export type LayerId = keyof typeof LAYERS

export function getLayer(id: LayerId): RegisteredLayer {
  return LAYERS[id]
}

export function getWebglLayer(id: LayerId): WebglLayerContract {
  const layer = getLayer(id)
  if (layer.contract.kind !== 'webgl') {
    throw new Error(`Layer "${id}" is not a WebGL layer`)
  }
  return layer.contract
}

export function getDomLayer(id: LayerId): DomLayerContract {
  const layer = getLayer(id)
  if (layer.contract.kind !== 'dom' && layer.contract.kind !== 'svg') {
    throw new Error(`Layer "${id}" is not a DOM/SVG layer`)
  }
  return layer.contract
}

export function resolvePointerEvents(policy: PointerPolicy, visible = true): CssPointerEvents {
  if (policy === 'autoWhenVisible') return visible ? 'auto' : 'none'
  return policy
}

export function listLayers(): RegisteredLayer[] {
  return Object.values(LAYERS)
}
