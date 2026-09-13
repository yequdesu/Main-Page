# Task 2 Report — StudioShell state host

**Status:** Done

**Commit:** `5d44ac8` (`feat(studio): add StudioShell — top-level state host`)

**Files created:**
- `src/debug/StudioShell.tsx` (115 lines)

**Summary:**
- Created the top-level state host component `StudioShell` that owns all shared state (`modelKey`, `env`, `helpers`, `selectedNode`, `viewportMode`, `sceneTree`, `modelRef`)
- Exports types `HelperState`, `ViewportMode`, `SceneTreeNode` consumed by sub-panels
- Composes `StudioToolbar`, `SceneExplorer`, `StudioViewport`, `PropertyPanel`, `StatusBar`, and a themed `<Leva />`
- Default helpers: grid + axes enabled (bbox + wireframe disabled)
- Model change handler resets selection and scene tree, and syncs environment from registry
- Imports `MODEL_REGISTRY` and `EnvPreset` from the refactored `../models`

**Concerns:**
- None so far; all imports reference components not yet built (StudioToolbar, SceneExplorer, StudioViewport, PropertyPanel, StatusBar, StudioLayout.css) — these will be created in subsequent tasks
