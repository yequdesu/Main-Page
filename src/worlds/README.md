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

48,000 deterministic, stratified roots fill the terrain; three fixed spatial
detail levels retain their original ear models throughout miniature shrink.
Instances are grouped into 16-unit tiles with conservative wind-aware bounds
for frustum culling. Tiles share exactly indexed model attributes; welding
preserves every triangle and part attribute, including derivative face normals.
Only one time uniform changes during animation. Root positions never change.
The shaders bend all parts coherently, attenuate wind at the edges, and clip the
deformed cube-local position. All three material variants share this clipping;
their kind is a compile-time constant to eliminate unused shader branches.

Lighting is a local stylized material model (sun-direction bands, backlight, root
darkening and distance haze), not new global lights or a shadow-map pass. The sky,
closed soil volume and sky window have bounded geometry. Sun and clouds are now
directional features at optical infinity inside that window, not separate disks
or wall-mounted cloud meshes. Camera-to-surface rays are calculated in cube-local
space every frame, so adjacent box faces share one continuous distant sky. The
sun's direction adapts to narrow viewports; no camera changes are needed. This version
does not implement individual stalk-to-stalk cast shadows.

The soil fills from the planting surface to the cube bottom. Its volume shader
uses cube-local noise for uneven humus, loam, clay and parent-rock horizons,
broken sediment lenses and filtered mineral flecks. Opposing/adjacent faces do
not restart UV patterns, and the texture has no time dependency. Soil mineral
grain detail is filtered below screen-pixel size during miniature shrink.

Wheat ears are never dissolved or replaced with a continuous canopy. Small
screen size does not disable them: only ordinary frustum culling and the
existing whole-world lifecycle control rendering. Density, wind and material
lighting remain unchanged. No renderer resolution or DPR reduction is used.

## Validation

- Tests cover root coverage/determinism, three batch populations, bend weights,
  shared clipping, coordinate adaptation, shell identity, unchanged progress,
  selected-world lifecycle, capture mounting and GPU resource disposal.
- Regression tests also cover exact indexed triangle equivalence, tile instance
  conservation, conservative bounds and unchanged ear visibility during shrink.
- Production build and all 9 world tests pass. Full suite: 135 passed, 3 failed.
  Unchanged failures: `miniatureParticleField` exact floating-point comparison;
  two `r3f-components` LightBeam tests lacking a jsdom Canvas context.
- Browser snapshots checked initial field coverage, miniature containment at 26%,
  and a 390×844 portrait viewport. Browser emulation is not a physical mobile
  performance test; continuous visual acceptance remains with the user.
