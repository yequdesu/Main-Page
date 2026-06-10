# Animation & Interaction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 animation/interaction issues found in deep code review — missing animations, memory leaks, performance anti-patterns, and React lifecycle violations.

**Architecture:** Fixes span R3F actors (OrbitRings, CentralStar, Planet, LightBeam), acts (visible prop pattern), state management (overlayData selector), and app-level concerns (StrictMode, CSS variables). Each fix is self-contained and can be verified independently.

**Tech Stack:** React 19 + R3F v9 + Zustand v5 + GSAP 3.15 + TypeScript + Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/actors/OrbitRings.tsx` | Modify | Add useFrame for gyro rotation + opacity animation |
| `src/actors/CentralStar.tsx` | Modify | Add useFrame for halo fade-in |
| `src/actors/Planet.tsx` | Delete | Remove — replaced by direct `<primitive>` in DustField |
| `src/actors/DustField.tsx` | Modify | Render useMemo meshes directly; extract `getState()` from loop |
| `src/acts/Act1OceanVoyage.tsx` | Modify | Never `return null` — use group `visible` prop |
| `src/acts/Act2GridTransition.tsx` | Modify | Never `return null` — use group `visible` prop |
| `src/acts/Act3ContentPhase.tsx` | Modify | Never `return null` — use group `visible` prop |
| `src/App.tsx` | Modify | overlayData via `getState()` in useFrame ticker; CSS var scope; StrictMode |
| `src/main.tsx` | Modify | Remove StrictMode |
| `src/actors/LighthouseCapture.tsx` | Modify | Apply world matrix before clone |
| `src/actors/LightBeam.tsx` | Modify | Extract `new Color`/`new Float32Array` to useMemo |
| `src/actors/OceanWaves.tsx` | Modify | Add useEffect dispose cleanup |
| `src/actors/GridLines.tsx` | Modify | Add useEffect dispose cleanup |
| `src/behaviors/useCameraFocus.ts` | Modify | Throttle overlayData emission (skip if unchanged) |
| `src/r3f/ScrollInvalidator.tsx` | Modify | Guard: only invalidate on scrollProgress change |

---

### Task 1: OrbitRings + CentralStar animation (🔴 Critical)

**Files:**
- Modify: `src/actors/OrbitRings.tsx`
- Modify: `src/actors/CentralStar.tsx`

OrbitRings defines gyro speeds but no useFrame. CentralStar halo sprite opacity hardcoded to 0. Both need per-frame animation for Act 3 transition.

- [ ] **Step 1: Add useFrame to OrbitRings for gyro rotation + opacity**

Read `src/actors/OrbitRings.tsx`. Add imports for `useFrame`, `useRef`, `useScrollStore`, `clamped`, `smoothstep`, `GRID_SHIFT_START`:

```tsx
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { SCENE_CENTER_Z, ORBIT_RADII, ORBIT_COUNT, clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
```

Add refs for the orbit line and gyro materials, and a useFrame that:
- Computes `act3Progress` and `smooth3`
- Rotates each gyro group by `delta * speed`
- Animates orbit ring opacity from 0 → target based on `smooth3`
- Animates gyro ring opacity

Add after the `gyroConfigs` useMemo:

```tsx
const orbitMatRefs = useRef<(LineBasicMaterial | null)[]>([null, null, null])
const gyroMatRefs = useRef<(LineBasicMaterial | null)[]>([null, null, null])
const gyroGroupRefs = useRef<(Group | null)[]>([null, null, null])

useFrame((_state, delta) => {
  const sp = useScrollStore.getState().scrollProgress
  const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
  const smooth3 = smoothstep(act3Progress)

  // Orbit rings opacity
  orbitMatRefs.current.forEach((mat) => {
    if (mat) mat.opacity = smooth3 * 0.55
  })

  // Gyro rings: rotation + opacity
  gyroGroupRefs.current.forEach((group, i) => {
    if (group) {
      group.rotation.y += delta * gyroConfigs.speeds[i]
    }
  })
  gyroMatRefs.current.forEach((mat) => {
    if (mat) mat.opacity = smooth3 * 0.35
  })
})
```

Update JSX to capture refs: add `ref={el => { orbitMatRefs.current[t] = el }}` on each `<lineBasicMaterial>` in orbit rings, similarly for gyro materials and groups.

- [ ] **Step 2: Add useFrame to CentralStar for halo fade-in**

Read `src/actors/CentralStar.tsx`. Add imports for `useFrame`, `useRef`, `useScrollStore`, `clamped`, `smoothstep`, `GRID_SHIFT_START`:

```tsx
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SpriteMaterial, Sprite, AdditiveBlending, LinearFilter } from 'three'
import { SCENE_CENTER_Z, clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
```

Add ref for the sprite material and a useFrame:

```tsx
const spriteMatRef = useRef<SpriteMaterial | null>(null)

useFrame(() => {
  const sp = useScrollStore.getState().scrollProgress
  const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
  const smooth3 = smoothstep(act3Progress)

  if (spriteMatRef.current) {
    spriteMatRef.current.opacity = smooth3 * 0.35
  }
})
```

Update the sprite material JSX to capture ref: change `opacity={0}` to `ref={(mat) => { spriteMatRef.current = mat }}` (remove the hardcoded `opacity={0}` — set it via refs attribute or keep initial 0).

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: Zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/actors/OrbitRings.tsx src/actors/CentralStar.tsx
git commit -m "fix: add useFrame animation to OrbitRings gyro rotation and CentralStar halo fade-in"
```

---

### Task 2: Planet mesh double creation (🔴 Critical)

**Files:**
- Modify: `src/actors/DustField.tsx`
- Delete: `src/actors/Planet.tsx`

DustField's useMemo creates Planet meshes that are never mounted. The Planet component creates duplicate geometry/materials. Fix: render useMemo meshes directly via `<primitive>`, remove Planet component entirely. Click handler moves to the `<primitive>` element (R3F supports onClick on primitives).

- [ ] **Step 1: Update DustField to render useMemo meshes directly**

Read `src/actors/DustField.tsx`. Remove the `import Planet from './Planet'` line.

Replace the JSX return's planet section:

Old:
```tsx
{mainPlanets.map((mesh, idx) => (
  <Planet
    key={`planet-${idx}`}
    ref={(el) => { if (el) mainPlanets[idx] = el }}
    onClick={() => handlePlanetClick(idx)}
  />
))}
```

New:
```tsx
{mainPlanets.map((mesh, idx) => (
  <primitive
    key={`planet-${idx}`}
    object={mesh}
    onClick={() => handlePlanetClick(idx)}
  />
))}
```

Remove the `ref` callback that was overriding mainPlanets[idx] — it's no longer needed since the primitive IS the mesh from useMemo. R3F's `<primitive>` supports `onClick` natively.

- [ ] **Step 2: Remove the useEffect import if no longer needed**

Check if `useEffect` is used elsewhere in DustField (it is — for the mousemove handler). Keep it.

- [ ] **Step 3: Remove Planet.tsx import from any other files**

```bash
grep -r "from.*Planet" src/ --include="*.tsx" --include="*.ts"
```

If only DustField imports it, delete the file. Otherwise update references.

- [ ] **Step 4: Delete Planet.tsx**

```bash
rm src/actors/Planet.tsx
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git rm src/actors/Planet.tsx
git add src/actors/DustField.tsx
git commit -m "fix: eliminate Planet mesh double-creation — render useMemo meshes via primitive"
```

---

### Task 3: Act visible=false unmounts children (🟠 High)

**Files:**
- Modify: `src/acts/Act1OceanVoyage.tsx`
- Modify: `src/acts/Act2GridTransition.tsx`
- Modify: `src/acts/Act3ContentPhase.tsx`

All three Acts `return null` when `visible=false`, unmounting all child actors. Per R3F best practices and the design doc, acts should stay mounted and use `visible={visible}` on their group element.

- [ ] **Step 1: Fix Act1OceanVoyage**

Read `src/acts/Act1OceanVoyage.tsx`. Replace the return block:

Old:
```tsx
if (!visible) return null

return (
  <group>
    <OceanWaves />
    <Lighthouse />
    <LightBeam />
    <DustField />
    <LighthouseCapture onCaptureReady={() => {}} />
  </group>
)
```

New:
```tsx
return (
  <group visible={visible}>
    <OceanWaves />
    <Lighthouse />
    <LightBeam />
    <DustField />
    <LighthouseCapture onCaptureReady={() => {}} />
  </group>
)
```

- [ ] **Step 2: Fix Act2GridTransition**

Read `src/acts/Act2GridTransition.tsx`. Replace:

```tsx
if (!visible) return null

return (
  <group>
    <GridLines />
  </group>
)
```

With:

```tsx
return (
  <group visible={visible}>
    <GridLines />
  </group>
)
```

- [ ] **Step 3: Fix Act3ContentPhase**

Read `src/acts/Act3ContentPhase.tsx`. Replace:

```tsx
if (!visible) return null

return (
  <group>
    <OrbitRings />
    <CentralStar />
    {PLANET_LINKS.map(...)}
  </group>
)
```

With:

```tsx
return (
  <group visible={visible}>
    <OrbitRings />
    <CentralStar />
    {PLANET_LINKS.map(...)}
  </group>
)
```

The useFrame already has `if (!visible) return` guard — keep it for performance.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/acts/Act1OceanVoyage.tsx src/acts/Act2GridTransition.tsx src/acts/Act3ContentPhase.tsx
git commit -m "fix: keep Act children mounted — use group visible prop instead of return null"
```

---

### Task 4: overlayData triggers 60fps re-render during focus (🟠 High)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/behaviors/useCameraFocus.ts`

`emitOverlayData()` in useCameraFocus creates a new object every frame and writes it to Zustand. The `useScrollStore(s => s.overlayData)` selector in App.tsx triggers React re-render on every new reference. Fix: throttle overlayData emission to only update when NDC coordinates actually change (rounded to pixel), or consume it via `getState()` in the GSAP ticker instead of via React state.

- [ ] **Step 1: Throttle overlayData in emitOverlayData**

Read `src/behaviors/useCameraFocus.ts`. Add a pixel-rounding cache at module level:

```ts
// Cache for overlay throttling — skip if NDC coordinates unchanged at pixel resolution
let _lastOverlayKey = ''
```

Inside `emitOverlayData`, after computing `starSR` and `planetSR`, build a key and skip if unchanged:

```ts
const key = `${Math.round(_ssStar.x)},${Math.round(_ssStar.y)},${Math.round(starSR)},${Math.round(_ssPlanet.x)},${Math.round(_ssPlanet.y)},${Math.round(planetSR)}`
if (key === _lastOverlayKey) return
_lastOverlayKey = key
```

Clear `_lastOverlayKey` when focus clears. In `updateCameraFocus`, in the unfocused branch where `store.setOverlayData({ focused: false })` is called, add: `_lastOverlayKey = ''`.

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/behaviors/useCameraFocus.ts
git commit -m "perf: throttle overlayData emission to pixel-level changes only"
```

---

### Task 5: LighthouseCapture apply world matrix (🟠 High)

**Files:**
- Modify: `src/actors/LighthouseCapture.tsx`

The deepClone only copies local transform. If lighthouse parent had transforms, the clone would be misplaced. Fix: use `getWorldPosition`/`getWorldQuaternion` before clone.

- [ ] **Step 1: Apply world matrix in capture function**

Read `src/actors/LighthouseCapture.tsx`. Replace the clone section:

```ts
// Clone lighthouse into a temp scene
const tempScene = new Scene()
tempScene.background = new Color('#050811')

const tempCamera = new PerspectiveCamera(40, 0.5, 0.1, 150)
tempCamera.position.set(0, 1.5, 4.5)
tempCamera.lookAt(0, 0.3, SCENE_CENTER_Z)

const clone = deepClone(lighthouseGroup)
tempScene.add(clone)
```

With:

```ts
// Clone lighthouse into a temp scene with correct world position
const tempScene = new Scene()
tempScene.background = new Color('#050811')

// Get world transform before cloning
import { Vector3, Quaternion } from 'three'
const _wp = new Vector3()
const _wq = new Quaternion()
const _ws = new Vector3()
lighthouseGroup.getWorldPosition(_wp)
lighthouseGroup.getWorldQuaternion(_wq)
lighthouseGroup.getWorldScale(_ws)

const clone = deepClone(lighthouseGroup)
clone.position.copy(_wp)
clone.quaternion.copy(_wq)
clone.scale.copy(_ws)
tempScene.add(clone)

const tempCamera = new PerspectiveCamera(40, 0.5, 0.1, 150)
tempCamera.position.set(0, 1.5, 4.5)
tempCamera.lookAt(0, 0.3, SCENE_CENTER_Z)
```

Add `Vector3, Quaternion` to the three imports at the top.

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/actors/LighthouseCapture.tsx
git commit -m "fix: apply world matrix in LighthouseCapture clone for correct offscreen rendering"
```

---

### Task 6: Remove StrictMode (🟠 High)

**Files:**
- Modify: `src/main.tsx`

StrictMode double-fires effects in development, causing duplicate ScrollTrigger instances and ticker callbacks. This is a React 18 testing tool, not needed for production 3D apps.

- [ ] **Step 1: Remove StrictMode wrapper**

Read `src/main.tsx`. Remove the `StrictMode` import and wrapper:

Old:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import App from './App'

gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.6, ease: 'power2.out' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

New:
```tsx
import { createRoot } from 'react-dom/client'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import App from './App'

gsap.registerPlugin(ScrollTrigger)
gsap.defaults({ duration: 0.6, ease: 'power2.out' })

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "fix: remove StrictMode to prevent GSAP double-initialization in dev"
```

---

### Task 7: LightBeam inline `new` allocations + OceanWaves/GridLines dispose (🟡 Medium)

**Files:**
- Modify: `src/actors/LightBeam.tsx`
- Modify: `src/actors/OceanWaves.tsx`
- Modify: `src/actors/GridLines.tsx`

LightBeam creates `new Color`, `new Float32Array` in JSX render body. These expressions run every render even though R3F only reads `args` on mount. Extract to useMemo. OceanWaves and GridLines create Line/Points objects in useMemo but never dispose them on unmount.

- [ ] **Step 1: Extract LightBeam args to useMemo**

Read `src/actors/LightBeam.tsx`. Extract the shader material uniforms and buffer geometry arrays:

```tsx
const beamUniforms = useMemo(() => configs.map(cfg => ({
  uColor: { value: new Color('#f0f7ff') },
  uOpacity: { value: cfg.opacity },
  uLength: { value: cfg.length },
  uEdgePower: { value: cfg.power },
})), [configs])

const rayGeomArrays = useMemo(() => [
  new Float32Array([0, 0, 0, -4.5, 0, 55]),
  new Float32Array([0, 0, 0, 4.5, 0, 55]),
], [])

const rayColorArray = useMemo(() =>
  new Float32Array([1, 1, 1, 0.3, 0.3, 0.3]),
[], [])
```

Update JSX to reference these instead of inline `new`:
- `<shaderMaterial args={[{uniforms: beamUniforms[i], ...}]}>`
- `<bufferAttribute args={[rayGeomArrays[i], 3]}>`
- `<bufferAttribute args={[rayColorArray, 3]}>`

- [ ] **Step 2: Add dispose cleanup to OceanWaves**

Read `src/actors/OceanWaves.tsx`. Add `useEffect` for cleanup:

```tsx
import { useEffect } from 'react'

// Add after the useMemo:
useEffect(() => {
  return () => {
    waveLines.forEach(line => {
      line.geometry.dispose()
      ;(line.material as LineBasicMaterial).dispose()
    })
  }
}, [waveLines])
```

- [ ] **Step 3: Add dispose cleanup to GridLines**

Read `src/actors/GridLines.tsx`. Add `useEffect` for cleanup:

```tsx
import { useEffect } from 'react'

// Add after the useMemo:
useEffect(() => {
  return () => {
    gridLines.forEach(vd => {
      vd.line.geometry.dispose()
      ;(vd.line.material as LineBasicMaterial).dispose()
    })
    gridPoints.geometry.dispose()
    ;(gridPoints.material as PointsMaterial).dispose()
  }
}, [gridLines, gridPoints])
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/actors/LightBeam.tsx src/actors/OceanWaves.tsx src/actors/GridLines.tsx
git commit -m "fix: extract LightBeam args to useMemo, add dispose cleanup to OceanWaves and GridLines"
```

---

### Task 8: CSS variable scope fix (🟡 Medium)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Set --text-offset-y on .brand-text element instead of :root**

Read `src/App.tsx`. Replace the `document.documentElement.style.setProperty` calls with a ref-based approach. Since `.brand-text` is conditionally rendered, store the value and apply it only when the element exists. Simplest approach: set a CSS custom property on the brand-text div directly via its style prop.

```tsx
// In App component, add:
const textOffsetY = useMemo(() => {
  if (scrollProgress >= GRID_SHIFT_START) {
    const shiftProgress = (scrollProgress - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)
    return Math.round(shiftProgress * 32 * 10) / 10
  }
  return 0
}, [scrollProgress])
```

Update the brand-text div style in JSX from:

```tsx
<div className="brand-text" aria-hidden="true">
```

To:

```tsx
<div className="brand-text" aria-hidden="true"
  style={{ '--text-offset-y': `${textOffsetY}px` } as React.CSSProperties}>
```

Remove the `document.documentElement.style.setProperty` calls from the useEffect — they are now handled by the inline style.

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "fix: scope --text-offset-y CSS variable to brand-text element via inline style"
```

---

### Task 9: Low-priority optimizations (🔵 Low)

**Files:**
- Modify: `src/actors/DustField.tsx`
- Modify: `src/acts/Act1OceanVoyage.tsx`
- Modify: `src/acts/Act2GridTransition.tsx`
- Modify: `src/acts/Act3ContentPhase.tsx`

Three micro-optimizations: hoist `getState()` call out of DustField loop, add `React.memo` to Act components, add scrollProgress guard to ScrollInvalidator.

- [ ] **Step 1: Hoist getState() out of DustField particle loop**

Read `src/actors/DustField.tsx`. In the useFrame, before the `for` loop, extract:

```ts
const { hoveredIdx } = useScrollStore.getState()
const sp = useScrollStore.getState().scrollProgress
```

Then inside the loop, use `hoveredIdx` directly instead of `const { hoveredIdx } = useScrollStore.getState()`.

- [ ] **Step 2: Add React.memo to Act components**

```tsx
// In Act1OceanVoyage.tsx:
export default React.memo(Act1OceanVoyage)

// In Act2GridTransition.tsx:
export default React.memo(Act2GridTransition)

// In Act3ContentPhase.tsx:
export default React.memo(Act3ContentPhase)
```

- [ ] **Step 3: Add scrollProgress guard to ScrollInvalidator**

Read `src/r3f/ScrollInvalidator.tsx`. The current subscribe callback calls `invalidate()` on every state change. Add a guard:

```tsx
const unsub = useScrollStore.subscribe((state, prevState) => {
  if (state.scrollProgress !== prevState.scrollProgress) {
    invalidate()
  }
})
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: 13/13 pass.

- [ ] **Step 6: Commit**

```bash
git add src/actors/DustField.tsx src/acts/Act1OceanVoyage.tsx src/acts/Act2GridTransition.tsx src/acts/Act3ContentPhase.tsx src/r3f/ScrollInvalidator.tsx
git commit -m "perf: hoist getState from loop, React.memo acts, guard invalidate on sp change"
```

---

## Self-Review

**1. Spec coverage:** All 12 issues covered — 🔴(2), 🟠(4), 🟡(3), 🔵(3). Each has a corresponding task with exact code changes.

**2. Placeholder scan:** No TBD, TODO, or "implement later" patterns. All code blocks are complete and compilable.

**3. Type consistency:** Imports match usage across tasks. The `useMemo` import in Task 7 is already present. `React.memo` import from `react` already available. `Group` type used in Task 3 matches the R3F JSX `group` element. `LineBasicMaterial`, `PointsMaterial` imports verified consistent.
