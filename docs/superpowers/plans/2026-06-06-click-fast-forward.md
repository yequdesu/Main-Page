# Click Fast-Forward Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to click anywhere to fast-forward the scroll animation to completion in 1.4s, with scroll-wheel interrupt support.

**Architecture:** Single-file change to `src/App.vue`. Add `clickProgress` and `isClickPlaying` refs, a `effectiveProgress` computed that picks between click-driven and scroll-driven progress, a GSAP tween on click, a wheel listener that kills the tween on interruption, and a click-hint text next to the existing scroll hint.

**Tech Stack:** Vue 3 (composition API), GSAP

---

### Task 1: Add state variables and computed

**Files:**
- Modify: `src/App.vue:8-13`

- [ ] **Step 1: Add `clickProgress`, `isClickPlaying`, and `effectiveProgress` computed**

Replace lines 8-13:

```js
const SCROLL_VH = 15
const scrollProgress = ref(0)
const hintVisible = ref(true)
const brandTextVisible = computed(() => scrollProgress.value >= 0.70)
```

With:

```js
const SCROLL_VH = 15
const scrollProgress = ref(0)
const clickProgress = ref(0)
const isClickPlaying = ref(false)
const hintVisible = ref(true)
const brandTextVisible = computed(() => scrollProgress.value >= 0.70)
const effectiveProgress = computed(() =>
  isClickPlaying.value ? clickProgress.value : scrollProgress.value
)
```

- [ ] **Step 2: Commit**

```bash
git add src/App.vue
git commit -m "feat: add clickProgress/isClickPlaying state and effectiveProgress computed"
```

---

### Task 2: Add click and wheel handlers

**Files:**
- Modify: `src/App.vue:13` (after `let st`), `src/App.vue:24-34` (onMounted), `src/App.vue:36-40` (onUnmounted)

- [ ] **Step 1: Add tween reference and handler functions**

Add after `let st` (line 13):

```js
let st
let _clickTween = null
let _maxScroll = 0

function onClick() {
  if (isClickPlaying.value) return
  if (scrollProgress.value >= 0.995) return

  isClickPlaying.value = true
  _maxScroll = document.body.scrollHeight - window.innerHeight

  const tweenObj = { val: scrollProgress.value }
  _clickTween = gsap.to(tweenObj, {
    val: 1.0,
    duration: 1.4,
    ease: 'power2.inOut',
    onUpdate: () => {
      clickProgress.value = tweenObj.val
      window.scrollTo(0, tweenObj.val * _maxScroll)
    },
    onComplete: () => {
      isClickPlaying.value = false
      _clickTween = null
    }
  })
}

function onWheel() {
  if (!isClickPlaying.value || !_clickTween) return
  _clickTween.kill()
  _clickTween = null
  isClickPlaying.value = false
}
```

- [ ] **Step 2: Register event listeners in onMounted**

Add to `onMounted` block after the ScrollTrigger creation (after line 33):

```js
  window.addEventListener('click', onClick)
  window.addEventListener('wheel', onWheel, { passive: true })
```

- [ ] **Step 3: Remove event listeners in onUnmounted**

Add to `onUnmounted` block (after line 37):

```js
  window.removeEventListener('click', onClick)
  window.removeEventListener('wheel', onWheel)
```

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat: add click fast-forward handler with wheel interrupt"
```

---

### Task 3: Wire effectiveProgress and add click hint UI

**Files:**
- Modify: `src/App.vue:43-44` (template), `src/App.vue:47-51` (scroll-hint), `src/App.vue:64-78` (CSS)

- [ ] **Step 1: Pass `effectiveProgress` to LighthouseScene**

Change line 44 from:

```html
  <LighthouseScene :scrollProgress="scrollProgress" />
```

To:

```html
  <LighthouseScene :scrollProgress="effectiveProgress" />
```

- [ ] **Step 2: Add click-hint text inside scroll-hint**

Change lines 47-50 from:

```html
    <div v-if="hintVisible" class="scroll-hint" aria-hidden="true">
      <span>Scroll</span>
      <div class="scroll-arrow" />
    </div>
```

To:

```html
    <div v-if="hintVisible" class="scroll-hint" aria-hidden="true">
      <span>Scroll</span>
      <span class="click-hint">or click to skip</span>
      <div class="scroll-arrow" />
    </div>
```

- [ ] **Step 3: Add click-hint CSS**

Add after `.scroll-arrow` style block (after line 79):

```css
.click-hint {
  font-size: 0.58rem;
  color: #778;
  opacity: 0.7;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat: wire effectiveProgress to scene and add click-hint UI"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify scroll behavior unchanged**

Open `http://localhost:5173` in a browser. Scroll with mouse wheel — animation should behave exactly as before.

- [ ] **Step 3: Verify click fast-forward**

Refresh the page. Click anywhere on the page. Animation should fast-forward to the end in ~1.4s. Brand text and Act 3 orbits should appear.

- [ ] **Step 4: Verify wheel interrupt during fast-forward**

Refresh the page. Click to start fast-forward, then immediately scroll with mouse wheel. Fast-forward should stop and normal scroll-driven animation should resume from the interrupted position.

- [ ] **Step 5: Verify click at end is ignored**

Scroll to the end (or click to skip to end). Click again — nothing should happen (no errors in console, no animation restart).

- [ ] **Step 6: Verify click-hint visibility**

Refresh the page. The hint should show "Scroll" with an arrow and "or click to skip" text. Start scrolling — the entire hint should fade out (the click-hint shares the same `v-if="hintVisible"` transition).

- [ ] **Step 7: Stop dev server and commit if all checks pass**

```bash
# If all checks pass, no code changes needed
echo "Verification passed"
```
