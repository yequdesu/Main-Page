# Design Spec: Scroll Easing & Lighthouse-as-Text

**Date:** 2026-06-06
**Status:** Approved

---

## 1. Feature 1: Scroll Momentum with InertiaPlugin

### 1.1 Goal

Replace the current ScrollTrigger `scrub: 0.4` with real physics-based momentum. When the user stops scrolling, the animation should continue sliding for 1–2 seconds before coming to rest (exponential decay, not linear catch-up).

### 1.2 Architecture

```
wheel delta → normalized step → tracker.progress update
                                    ↓
                          InertiaPlugin.track() detects velocity,
                          overshoots, and decays back
                                    ↓
                          scrollProgress (reactive)
                                    ↓
                          effectiveProgress (scroll or click)
                                    ↓
                          LighthouseScene prop
```

### 1.3 Implementation (App.vue)

```js
import { InertiaPlugin } from 'gsap/InertiaPlugin'
gsap.registerPlugin(InertiaPlugin)

const tracker = { progress: 0 }

InertiaPlugin.track(tracker, 'progress', {
  resistance: 400,
  bounds: { min: 0, max: 1 },
  onUpdate: () => {
    scrollProgress.value = tracker.progress
    window.scrollTo(0, tracker.progress * _maxScroll)
  }
})
```

**Wheel handler:**

```js
function onWheel(e) {
  if (isClickPlaying.value && _clickTween) {
    _clickTween.kill(); _clickTween = null
    isClickPlaying.value = false
  }
  const step = e.deltaY / (window.innerHeight * SCROLL_VH)
  const next = Math.min(1, Math.max(0, tracker.progress + step * 0.8))
  tracker.progress = next
}
```

**Click fast-forward (unchanged easing):**

```js
function onClick() {
  if (isClickPlaying.value) return
  if (scrollProgress.value >= 0.995) return
  isClickPlaying.value = true
  _maxScroll = document.body.scrollHeight - window.innerHeight

  const tweenObj = { val: scrollProgress.value }
  _clickTween = gsap.to(tweenObj, {
    val: 1.0,
    duration: 2,
    ease: 'power2.inOut',
    onUpdate: () => {
      tracker.progress = tweenObj.val  // drive through tracker so Inertia stays in sync
      clickProgress.value = tweenObj.val
      window.scrollTo(0, tweenObj.val * _maxScroll)
    },
    onComplete: () => {
      isClickPlaying.value = false
      _clickTween = null
    }
  })
}
```

### 1.4 ScrollTrigger Role Change

ScrollTrigger remains only to sync the browser scrollbar position (cosmetic). It no longer writes `scrollProgress`. The `updateScroll` callback is removed.

### 1.5 Parameters

| Param | Value | Explanation |
|-------|-------|-------------|
| `resistance` | `400` | Higher = shorter inertia tail. 400 gives ~1.5s decay. |
| `velocity scale` | `0.8` | Multiplier on normalized wheel delta. |
| `SCROLL_VH` | `15` | Unchanged — body height divisor. |

---

## 2. Feature 1b: Fix Click Fast-Forward Text Jump

### 2.1 Root Cause

`updateTextOffsetCSS()` sets `--text-offset-y` every frame. The DOM element has `transition: transform 1.2s ease-out`. When click tween reaches `sp=1.0` in 2s, the CSS transition is still interpolating toward a stale intermediate value. The next JS frame forces it to the final value → visual snap.

### 2.2 Fix

During `isClickPlaying`, disable CSS transitions on the brand text element:

```html
<div class="brand-text" :class="{ 'no-transition': isClickPlaying }">
```

```css
.brand-text.no-transition {
  transition: none !important;
}
```

This lets JS own the transform 100% during click playback. When click ends, the class is removed and CSS transitions resume for subsequent scroll-driven changes.

### 2.3 Reversibility

When the user interrupts a click with the wheel and scrolls backward, `isClickPlaying` becomes `false` and the class is removed. The text position follows `scrollProgress` down smoothly via CSS transition, since the progress changes at a natural scroll pace (not instantaneous).

---

## 3. Feature 2: Lighthouse Replaces "i" in "Site"

### 3.1 Visual Concept

At `sp ≈ 0.55`, the 3D lighthouse model fades out (hidden by fog). At `sp ≈ 0.70`, the text "Personal Site" fades in — but the "i" position is left empty. A transparent PNG of the lighthouse (captured from the 3D model) then descends from above into the "i" slot. The subtitle "By YeQuDesu" fades in slightly after, left-aligned with "Personal".

All animations are **scrollProgress-driven and fully reversible** — scrolling backward reverses each transition.

### 3.2 Timing Map

| Event | `scrollProgress` range | Behavior |
|-------|------------------------|----------|
| 3D lighthouse hidden | 0.55 | `lighthouseGroup.visible = false` |
| Lighthouse capture | 0.55 (once) | Offscreen render → base64 PNG |
| "Personal S [ ] t e" fade in | 0.70 → 0.82 | Letters appear, "i" slot empty |
| Lighthouse descends into "i" | 0.78 → 0.88 | Image drops from ~40px above into slot |
| "By YeQuDesu" fade in | 0.82 → 0.92 | Fade-in, left-aligned with "Personal" |

### 3.3 DOM Structure

```html
<div class="brand-text" :class="{ 'no-transition': isClickPlaying }">
  <p class="brand-line-1">
    <span class="char">P</span>
    <span class="char">e</span>
    <span class="char">r</span>
    <span class="char">s</span>
    <span class="char">o</span>
    <span class="char">n</span>
    <span class="char">a</span>
    <span class="char">l</span>
    <span class="char char-space">&nbsp;</span>
    <span class="char">S</span>
    <span class="char char-i-slot"><!-- placeholder for "i" --></span>
    <span class="char">t</span>
    <span class="char">e</span>
  </p>
  <p class="brand-line-2">By YeQuDesu</p>
  <img
    v-if="lighthouseImage"
    :src="lighthouseImage"
    class="lighthouse-char"
    :style="lighthouseCharStyle"
  />
</div>
```

- `char-i-slot`: fixed-width empty `<span>` (`width: ~0.45em`, matching the "i" character advance width in the chosen font)
- `lighthouse-char`: `position: absolute`, dimensions ~1.2× the line height

### 3.4 Lighthouse Image Capture

**Trigger:** first time `scrollProgress >= 0.55`.

**Procedure:**

1. Create offscreen `WebGLRenderer`:
   - `alpha: true`
   - `setClearColor(0x000000, 0)`
   - `setPixelRatio(Math.min(devicePixelRatio, 3))`
   - Canvas size: `512 × 1024`
2. Clone `lighthouseGroup` into a temporary `Scene`:
   - Remove beam elements (cones, rays, glow) from clone
   - Set tower rotation to face camera
3. Position orthographic or perspective camera to frame tower at ~80% canvas height
4. `renderer.render(tempScene, captureCamera)`
5. Export: `canvas.toDataURL('image/png')` → store as reactive string
6. Dispose offscreen renderer, temp scene, clone

**Reversibility:** If sp drops below 0.55, 3D model reappears. The captured image stays in memory (hidden via `v-if` or opacity). No re-capture needed.

### 3.5 Lighthouse Positioning

Each frame (in a `watch` on `effectiveProgress` or in the animation loop callback):

```js
const slot = document.querySelector('.char-i-slot')
if (!slot) return
const slotRect = slot.getBoundingClientRect()

// Descent: 40px above → 0px in slot
const tDescent = smoothstep(clamp((sp - 0.78) / (0.88 - 0.78), 0, 1))
const offsetY = -40 * (1 - tDescent) // px above slot

lighthouseCharStyle.value = {
  left: slotRect.left + 'px',
  top:  slotRect.top + offsetY + 'px',
  width: slotRect.width * 1.1 + 'px',
  height: 'auto',
  opacity: tDescent  // also fades in as it descends
}
```

Math uses `smoothstep(t) = t²(3 - 2t)` for natural easing. Reversible: scrolling back raises the lighthouse and fades it out.

### 3.6 Subtitle ("By YeQuDesu")

- Opacity driven by `sp` in range 0.82 → 0.92, smoothstep interpolated
- CSS: `.brand-line-2 { text-align: left; }` — left-aligned within its container
- Both lines share the same left edge (flex-start alignment on the column flex container)
- The whole block is centered on screen via `align-items: center` on the parent, but `brand-line-2` has `align-self: flex-start` so its text starts at the same x-position as "Personal"

### 3.7 Font & Sizing

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| "Personal S [i] t e" | Georgia, serif | `clamp(1.8rem, 4.5vw, 3.5rem)` | 400 | `#222` |
| "By YeQuDesu" | Georgia, serif | `clamp(0.8rem, 1.6vw, 1.1rem)` | 400 | `#888` |
| `char-i-slot` | same | same | — | — |

The `char-i-slot` width must match the actual advance width of "i" in Georgia at the current font size. Use `0.45em` as starting value; verify with a quick DOM measurement on mount.

### 3.8 Files Changed

| File | Changes |
|------|---------|
| `src/App.vue` | InertiaPlugin setup, wheel handler rewrite, ScrollTrigger simplified, brand text DOM restructured, lighthouse capture logic, position calculation, new CSS |
| `src/components/LighthouseScene.vue` | Expose `lighthouseGroup` visibility control hook for capture timing (or `watch` sp internally); add method/getter for external capture access |

---

## 4. Edge Cases

| Scenario | Handling |
|----------|----------|
| User scrolls fast past 0.55 | Capture fires once (flag guard), 3D model hidden, text appears normally |
| User scrolls backward below 0.55 | 3D model reappears, text/lighthouse image fade out via same progress interpolation |
| User clicks during text animation | `.no-transition` class disables CSS transitions, JS owns all positions |
| User interrupts click with wheel | `isClickPlaying` → false, `.no-transition` removed, CSS transitions resume, InertiaPlugin re-tracks from current position |
| Very wide/narrow viewport | `clamp()` font sizing + `getBoundingClientRect()` for lighthouse slot keeps alignment correct |
| Lighthouse capture fails | `v-if="lighthouseImage"` hides the `<img>`, text still renders; "i" slot stays empty (graceful degradation) |

---

## 5. Non-Goals

- Hand-drawn SVG lighthouse (deferred; current approach uses rendered 3D capture, swappable later)
- Changes to Act 3 orbit/planet behavior
- Mobile touch event handling (current implementation is desktop-only)
- Changing the click fast-forward easing curve (stays `power2.inOut`)
