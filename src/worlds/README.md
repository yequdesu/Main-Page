# Act1 interior worlds

`Act1WorldHost` swaps only the contents of `MiniatureUniverse`. Debug → Composition
Runtime → Act1 内部世界 selects the world. Selection is memory-only; reload defaults
to the lighthouse. Production visitors do not receive a scene selector.

## Adding a world

- Add its ID to `Act1SceneId`, a label to `ACT1_WORLD_OPTIONS`, and a component to
  `ACT1_WORLDS`. Register its lifecycle in the actor registry.
- Components receive cube-local bounds, scroll progress, and activity. The cube
  center is `(0,0,0)`, bounds are ±32. The host cancels the legacy content offset;
  `LighthouseWorld` alone restores it so existing lighthouse coordinates match.
- Do not own the cube shell, change cameras, global lights, renderer settings,
  scene background/fog, external actors or timeline ranges.
- Dispose owned GPU assets on unmount. The host unmounts content when Act1 is no
  longer visible; selected world identity survives reverse scrolling.

## Sunset wheat implementation

48,000 deterministic, stratified roots fill the terrain; three instanced batches
use different ear detail. Each batch shares its geometry and instance attributes.
Only one time uniform changes during animation. Root positions never change.
The shaders bend all parts coherently, attenuate wind at the edges, and clip the
deformed cube-local position. All five material variants share this clipping.

Lighting is a local stylized material model (sun-direction bands, backlight, root
darkening and distance haze), not new global lights or a shadow-map pass. The sky,
sun, clouds and closed soil volume are actual bounded geometry. The sun's internal
offset adapts to narrow viewports; no camera changes are needed. This first version
does not implement individual stalk-to-stalk cast shadows.

## Validation

- Tests cover root coverage/determinism, three batch populations, bend weights,
  shared clipping, coordinate adaptation, shell identity, unchanged progress,
  selected-world lifecycle, capture mounting and GPU resource disposal.
- Production build passes. Full suite on this change: 131 passed, 3 failed.
  Unchanged failures: `miniatureParticleField` exact floating-point comparison;
  two `r3f-components` LightBeam tests lacking a jsdom Canvas context.
- Browser snapshots checked initial field coverage, miniature containment at 26%,
  and a 390×844 portrait viewport. Browser emulation is not a physical mobile
  performance test; continuous visual acceptance remains with the user.
