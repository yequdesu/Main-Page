# actors/

`actors/` 封装可渲染或可交互的场景主体。actor 内部可以继续使用 R3F `useFrame`、GSAP、CSS transition、PBD 或自定义 shader，但�?actor 的身份、层级、数据读写和副作用生命周期必须通过 `src/composition/` �?runtime contract 暴露�?

## 当前 Actor

| 文件 | 对象类型 | 主要驱动 | Runtime 接入 |
|---|---|---|---|
| `Lighthouse.tsx` | 静�?Mesh �?| scroll group transform | actor + layer |
| `LightBeam.tsx` | Cone / Line / Glow / PointLight | scroll + elapsed time | actor + layer + beam anchors |
| `OceanWaves.tsx` | Line / curtain mesh | scroll + elapsed time + beam anchors | actor + layer + anchor consumer |
| `DustField.tsx` | Mesh + InstancedMesh2 | scroll + elapsed time | actor + layer |
| `GridLines.tsx` | Lines + points | scroll progress | actor + layer |
| `Planets.tsx` | Planet meshes / halos | scroll + elapsed time | actor + layer + world/screen anchors |
| `WindChimeLines.tsx` | SVG/WebGL-style chime lines | pure wind-chime layout function | actor + layer |
| `CentralStar.tsx` | Mesh + sprites | scroll + elapsed time | actor + layer + screen anchor |
| `OrbitRings.tsx` | Orbit reference lines | scroll progress | actor + layer |
| `OrbitalRing.tsx` | Single orbit line loop | scroll progress | actor + layer |
| `FloatingLabels.tsx` | DOM terminal pills | sequence + PBD layout | actor + layer + effect scopes |
| `PlanetLabelGuideLines.tsx` | SVG guide lines | label layout phase + anchors | actor + layer |
| `PlanetLabelDebug.tsx` | Debug overlay | anchors | actor + layer |

## Dependency Rules

Actors must not import another actor's mutable module state. Cross-actor data should be represented as anchors or sequence signals.

Current important data edges:

| Producer | Consumer | Data |
|---|---|---|
| `LightBeam` | `OceanWaves` | `anchor.beam.worldOrigin`, `anchor.beam.worldDirection` |
| `Planets` | `PlanetClickHandler`, focus logic | `anchor.planet.*.world` |
| screen projection | `FloatingLabels`, guide lines, focus overlays | `anchor.planet.*.screen`, `anchor.centralStar.screen` |
| label layout | `PlanetLabelGuideLines` | per-label layout phase / measured width |

## Authoring Rules

- Register actor identity with `useActorRuntime`.
- Read render policy from `layerRegistry` instead of hardcoding z-index, renderOrder, depth policy or pointer rules.
- Publish shared positions, bounds or layout facts through anchors.
- Keep scroll-driven visuals reversible: the same `scrollProgress` must recreate the same visual state.
- Put event-driven or completion-driven flow into `sequenceStore` signals/phases.
- Track GSAP tweens, timers, rAF callbacks and transition fallback cleanup with `EffectScope`.
- Keep expensive per-frame math in mutable refs or pure behavior helpers; avoid high-frequency React state updates.

## Adding A New Actor

1. Add the visual implementation under `src/actors/`.
2. Add or reuse a layer entry in `src/composition/layerRegistry.ts`.
3. Add an actor spec in `src/composition/coreActors.ts`.
4. If it shares data, add typed anchor helpers in `src/composition/coreAnchors.ts`.
5. If it participates in non-reversible event flow, add sequence phases/signals in `src/composition/coreSequences.ts`.
6. Verify it appears in the composition debug panel with correct actor, layer, anchor and effect ownership.
