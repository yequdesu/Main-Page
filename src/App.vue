<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import LighthouseScene from './components/LighthouseScene.vue'
import AppFooter from './components/AppFooter.vue'

gsap.registerPlugin(ScrollTrigger)

const SCROLL_VH = 15
const FRICTION = 0.955      // per-frame velocity decay (≈60fps)
const MAX_VELOCITY = 0.025  // cap per-frame progress delta

// ---- physics state ----
let _physTarget = 0    // current progress (driven by velocity or scrollbar)
let _physVelocity = 0
let _lastScrollbarTime = 0
let _physActive = true  // ticker is running

// ---- reactive state ----
const scrollProgress = ref(0)
const clickProgress = ref(0)
const isClickPlaying = ref(false)
const hintVisible = ref(true)
const lighthouseImage = ref(null)

const sceneRef = ref(null)
const brandTextVisible = computed(() => scrollProgress.value >= 0.70)
const effectiveProgress = computed(() =>
  isClickPlaying.value ? clickProgress.value : scrollProgress.value
)

// ---- helpers ----
function smoothstep(t) {
  return t * t * (3 - 2 * t)
}
function clamped(sp, s, e) {
  return Math.max(0, Math.min(1, (sp - s) / (e - s)))
}
function syncScrollbar() {
  const h = document.body.scrollHeight - window.innerHeight
  if (h > 0) window.scrollTo(0, _physTarget * h)
}

// ---- character visibility ----
const line1Opacity = computed(() => smoothstep(clamped(scrollProgress.value, 0.70, 0.82)))
const line2Opacity = computed(() => smoothstep(clamped(scrollProgress.value, 0.82, 0.92)))

// ---- click fast-forward ----
let _clickTween = null
function onClick() {
  if (isClickPlaying.value) return
  if (scrollProgress.value >= 0.995) return
  isClickPlaying.value = true
  _physVelocity = 0 // kill momentum

  const tweenObj = { val: _physTarget }
  _clickTween = gsap.to(tweenObj, {
    val: 1.0,
    duration: 2,
    ease: 'power2.inOut',
    onUpdate: () => {
      _physTarget = tweenObj.val
      scrollProgress.value = _physTarget
      clickProgress.value = _physTarget
      syncScrollbar()
    },
    onComplete: () => {
      isClickPlaying.value = false
      _clickTween = null
    }
  })
}

// ---- wheel handler (adds velocity for momentum) ----
function onWheel(e) {
  e.preventDefault()
  if (isClickPlaying.value && _clickTween) {
    _clickTween.kill()
    _clickTween = null
    isClickPlaying.value = false
  }
  const step = e.deltaY / (window.innerHeight * SCROLL_VH) * 0.65
  _physVelocity += step
  _physVelocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, _physVelocity))
}

// ---- lighthouse capture ----
let _lighthouseCaptured = false
function ensureCapture() {
  if (_lighthouseCaptured) return
  if (!sceneRef.value) return
  if (scrollProgress.value >= 0.54) {
    _lighthouseCaptured = true
    try {
      const url = sceneRef.value.captureLighthouse()
      if (url) lighthouseImage.value = url
    } catch (e) {
      console.warn('Lighthouse capture failed:', e)
    }
  }
}

// ---- ScrollTrigger (native scrollbar → direct position) ----
let st
function onScrollTrigger(self) {
  // Ignore scroll events triggered by our own syncScrollbar (position unchanged)
  if (Math.abs(self.progress - _physTarget) < 0.0005) return

  _lastScrollbarTime = performance.now()
  _physVelocity = 0 // kill wheel momentum when user grabs scrollbar
  _physTarget = self.progress
  scrollProgress.value = _physTarget

  if (_physTarget > 0.02 && hintVisible.value) {
    hintVisible.value = false
  }
}

// ---- watch scrollProgress to drive capture ----
watch(scrollProgress, () => {
  ensureCapture()
})

onMounted(() => {
  document.body.style.height = window.innerHeight * SCROLL_VH + 'px'

  // ScrollTrigger: fires when native scroll changes (scrollbar drag etc)
  st = ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0,
    onUpdate: onScrollTrigger
  })

  // Physics ticker: applies velocity with friction
  gsap.ticker.add(() => {
    if (!_physActive) return
    const now = performance.now()

    // Skip if scrollbar was recently used (user is dragging it)
    if (now - _lastScrollbarTime < 80) return
    // Skip during click fast-forward (gsap tween controls position)
    if (isClickPlaying.value) return

    // Apply velocity
    _physTarget += _physVelocity

    // Clamp & stop at bounds
    if (_physTarget <= 0) { _physTarget = 0; _physVelocity = 0 }
    if (_physTarget >= 1) { _physTarget = 1; _physVelocity = 0 }

    // Friction decay
    _physVelocity *= FRICTION
    if (Math.abs(_physVelocity) < 0.00001) _physVelocity = 0

    scrollProgress.value = _physTarget
    syncScrollbar()
  })

  window.addEventListener('click', onClick)
  window.addEventListener('wheel', onWheel, { passive: false })
})

onUnmounted(() => {
  _physActive = false
  st?.kill()
  ScrollTrigger.getAll().forEach((t) => t.kill())
  document.body.style.height = ''
  window.removeEventListener('click', onClick)
  window.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <LighthouseScene ref="sceneRef" :scrollProgress="effectiveProgress" />

  <Transition name="hint-fade">
    <div v-if="hintVisible" class="scroll-hint" aria-hidden="true">
      <span>Scroll</span>
      <span class="click-hint">or click to skip</span>
      <div class="scroll-arrow" />
    </div>
  </Transition>

  <div
    v-if="brandTextVisible"
    class="brand-text"
    :class="{ 'no-transition': isClickPlaying }"
    aria-hidden="true"
  >
    <div class="brand-text-inner">
      <p class="brand-line-1" :style="{ opacity: line1Opacity }">
        <img
          v-if="lighthouseImage"
          :src="lighthouseImage"
          class="lighthouse-icon"
          alt=""
        />
        Personal Site
      </p>
      <p class="brand-line-2" :style="{ opacity: line2Opacity }">By YeQuDesu</p>
    </div>
  </div>

  <AppFooter />
</template>

<style>
/* ---- scroll hint ---- */
.scroll-hint {
  position: fixed;
  bottom: 2.8rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: #aab;
  font-size: 0.68rem;
  letter-spacing: 0.15em;
  pointer-events: none;
}
.scroll-arrow {
  width: 20px;
  height: 20px;
  border-right: 1.5px solid #889;
  border-bottom: 1.5px solid #889;
  transform: rotate(45deg);
  opacity: 0.5;
  animation: sc-bounce 2s ease-in-out infinite;
}
.click-hint {
  font-size: 0.58rem;
  color: #778;
  opacity: 0.7;
  letter-spacing: 0.08em;
}
@keyframes sc-bounce {
  0%, 100% { transform: rotate(45deg) translateY(0); }
  50% { transform: rotate(45deg) translateY(6px); }
}
.hint-fade-enter-active { transition: opacity 0.8s; }
.hint-fade-leave-active { transition: opacity 0.4s; }
.hint-fade-enter-from,
.hint-fade-leave-to { opacity: 0; }

/* ---- brand text ---- */
.brand-text {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transform: translateY(var(--text-offset-y, 0px));
}
.brand-text.no-transition,
.brand-text.no-transition * {
  transition: none !important;
}
.brand-text-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}
.brand-line-1 {
  margin: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(1.8rem, 4.5vw, 3.5rem);
  font-weight: 400;
  color: #222;
  letter-spacing: 0.05em;
  white-space: nowrap;
  text-align: left;
}
.brand-line-2 {
  margin: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(0.55rem, 1.0vw, 0.75rem);
  font-weight: 400;
  color: #888;
  letter-spacing: 0.04em;
  font-style: italic;
  text-align: left;
}
.lighthouse-icon {
  display: inline;
  height: 0.95em;
  width: auto;
  vertical-align: baseline;
  margin-right: 0.15em;
  object-fit: contain;
}
</style>
