# Click Fast-Forward Animation

**Date:** 2026-06-06
**Status:** approved

## Goal

Allow users to skip the scroll-driven animation by left-clicking anywhere on the page. Clicking fast-forwards the scene to completion (scrollProgress 0→1) in 1.4s with smooth easing. Scroll wheel input during fast-forward interrupts the tween and resumes normal scroll-driven control.

## Design

### Core approach

Use GSAP to tween a synthetic `clickProgress` value from current scroll position to 1.0 over 1.4s. While tweening, synchronize the page's real `scrollTop` to match, so ScrollTrigger stays in a consistent state. When the tween ends or is interrupted, the system seamlessly switches between scroll-driven and click-driven progress.

### Data flow

```
User scroll → scrollTop → ScrollTrigger → scrollProgress ─┐
                                                           ├→ effectiveProgress → LighthouseScene
User click → GSAP tween → clickProgress ───────────────────┘
                              │
                              └→ window.scrollTo() keeps scrollTop in sync
```

### State

| Variable | Type | Purpose |
|----------|------|---------|
| `clickProgress` | `ref(0)` | Current progress of the click-driven tween |
| `isClickPlaying` | `ref(false)` | Whether a click fast-forward is in progress |
| `effectiveProgress` | `computed` | `isClickPlaying ? clickProgress : scrollProgress` |

### Click handler

```
onClick:
  if isClickPlaying → ignore (prevent double-trigger)
  if scrollProgress ≈ 1.0 → ignore (already at end)
  isClickPlaying = true
  tweenObj = { val: current scrollProgress }
  tween = gsap.to(tweenObj, {
    val: 1.0,
    duration: 0.7,
    ease: 'power2.inOut',
    onUpdate: () => {
      clickProgress.value = tweenObj.val
      window.scrollTo(0, tweenObj.val * maxScrollDistance)
    },
    onComplete: () => { isClickPlaying = false }
  })
```

### Wheel interrupt

Listen for `wheel` event on `window`. During `isClickPlaying`, any wheel event:
1. Kills the GSAP tween
2. Sets `isClickPlaying = false`
3. `effectiveProgress` switches back to `scrollProgress` (already synced via `scrollTo`)

### Click hint UI

Add `or click to skip` text next to the existing "Scroll" hint. Shares the same `v-if="hintVisible"` transition — disappears together when user starts scrolling (progress > 0.02).

### Key design decisions

- **Sync scrollTop, don't pause ScrollTrigger.** Keeping scroll position in sync with tween progress means ScrollTrigger never enters an inconsistent state. If the tween is killed, the user's next scroll action picks up from exactly where the tween left off.
- **LighthouseScene receives effectiveProgress, not scrollProgress.** This is the only prop change — the scene component has zero internal changes.
- **`power2.inOut` easing** for the tween: gentle start, fast middle, gentle end, matching the smooth visual feel of the scene.

### Files changed

| File | Change |
|------|--------|
| `src/App.vue` | Add `clickProgress`, `isClickPlaying`, `effectiveProgress`; click handler on `#app`; wheel listener; tween management; click hint text; pass `effectiveProgress` to LighthouseScene |

### Edge cases

- **Click at end (progress ≈ 1.0):** Ignored — tween would be a no-op anyway
- **Rapid click-then-scroll-then-click:** Each click sets `isClickPlaying`, each scroll kills tween and clears it — no stale state
- **Mobile (touch):** `wheel` event won't fire on touch scroll, so fast-forward plays uninterrupted. Acceptable — mobile users can still scroll normally. Future: could add `touchstart` interrupt if needed.

### Non-goals

- Mobile-specific interrupt behavior (out of scope for this change)
- Keyboard accessibility for skip (out of scope)
- Configurable tween duration/easing (hardcoded for simplicity)
