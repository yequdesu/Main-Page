<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import LighthouseScene from './components/LighthouseScene.vue'
import AppFooter from './components/AppFooter.vue'

gsap.registerPlugin(InertiaPlugin, ScrollTrigger)

const SCROLL_VH = 15

// ---- state ----
const scrollProgress = ref(0)
const clickProgress = ref(0)
const isClickPlaying = ref(false)
const hintVisible = ref(true)
const lighthouseImage = ref(null)
const lighthouseCharStyle = ref({})

const sceneRef = ref(null)
const brandTextVisible = computed(() => scrollProgress.value >= 0.70)
const effectiveProgress = computed(() =>
  isClickPlaying.value ? clickProgress.value : scrollProgress.value
)

// ---- Inertia tracker ----
const tracker = { progress: 0 }
let _lastInertiaScrollTime = 0

InertiaPlugin.track(tracker, 'progress', {
  resistance: 400,
  bounds: { min: 0, max: 1 },
  onUpdate: () => {
    scrollProgress.value = tracker.progress
    _lastInertiaScrollTime = performance.now()
    const h = document.body.scrollHeight - window.innerHeight
    window.scrollTo(0, tracker.progress * h)
  }
})

// ---- helpers ----
function smoothstep(t) {
  return t * t * (3 - 2 * t)
}
function clamped(sp, s, e) {
  return Math.max(0, Math.min(1, (sp - s) / (e - s)))
}

// ---- character visibility ----
const line1Opacity = computed(() => smoothstep(clamped(scrollProgress.value, 0.70, 0.82)))
const lighthouseDescentT = computed(() => smoothstep(clamped(scrollProgress.value, 0.78, 0.88)))
const line2Opacity = computed(() => smoothstep(clamped(scrollProgress.value, 0.82, 0.92)))

// ---- click fast-forward ----
let _clickTween = null
function onClick() {
  if (isClickPlaying.value) return
  if (scrollProgress.value >= 0.995) return
  isClickPlaying.value = true

  const tweenObj = { val: tracker.progress }
  _clickTween = gsap.to(tweenObj, {
    val: 1.0,
    duration: 2,
    ease: 'power2.inOut',
    onUpdate: () => {
      tracker.progress = tweenObj.val
      clickProgress.value = tweenObj.val
    },
    onComplete: () => {
      isClickPlaying.value = false
      _clickTween = null
    }
  })
}

// ---- wheel handler ----
function onWheel(e) {
  e.preventDefault()
  if (isClickPlaying.value && _clickTween) {
    _clickTween.kill()
    _clickTween = null
    isClickPlaying.value = false
  }
  const step = e.deltaY / (window.innerHeight * SCROLL_VH)
  const next = Math.min(1, Math.max(0, tracker.progress + step * 0.8))
  tracker.progress = next
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

// ---- lighthouse char position ----
function updateLighthousePos() {
  const slot = document.querySelector('.char-i-slot')
  if (!slot) {
    lighthouseCharStyle.value = { opacity: 0 }
    return
  }
  const sr = slot.getBoundingClientRect()
  const t = lighthouseDescentT.value
  const descentPx = -40 * (1 - t)
  lighthouseCharStyle.value = {
    position: 'fixed',
    left: sr.left + 'px',
    top: (sr.top + descentPx) + 'px',
    width: (sr.width * 1.05) + 'px',
    height: 'auto',
    opacity: t,
    zIndex: 11,
    pointerEvents: 'none'
  }
}

// ---- ScrollTrigger (native scroll → tracker) ----
let st
function onScrollTrigger(self) {
  // Ignore scroll events triggered by InertiaPlugin's own window.scrollTo
  if (performance.now() - _lastInertiaScrollTime < 50) return
  const p = self.progress
  tracker.progress = p

  if (p > 0.02 && hintVisible.value) {
    hintVisible.value = false
  }
}

// ---- watch scrollProgress to drive capture & lighthouse position ----
watch(scrollProgress, () => {
  ensureCapture()
  updateLighthousePos()
})

onMounted(() => {
  document.body.style.height = window.innerHeight * SCROLL_VH + 'px'

  st = ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0,
    onUpdate: onScrollTrigger
  })

  window.addEventListener('click', onClick)
  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('resize', updateLighthousePos)
})

onUnmounted(() => {
  st?.kill()
  ScrollTrigger.getAll().forEach((t) => t.kill())
  document.body.style.height = ''
  window.removeEventListener('click', onClick)
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('resize', updateLighthousePos)
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
        <span class="char char-i-slot"></span>
        <span class="char">t</span>
        <span class="char">e</span>
      </p>
      <p class="brand-line-2" :style="{ opacity: line2Opacity }">By YeQuDesu</p>
    </div>
  </div>

  <img
    v-if="lighthouseImage && brandTextVisible"
    :src="lighthouseImage"
    class="lighthouse-char-img"
    :style="lighthouseCharStyle"
    alt=""
  />

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
}
.brand-text.no-transition,
.brand-text.no-transition * {
  transition: none !important;
}
.brand-text-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
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
  font-size: clamp(0.8rem, 1.6vw, 1.1rem);
  font-weight: 400;
  color: #888;
  letter-spacing: 0.04em;
  font-style: italic;
  text-align: left;
}
.char {
  display: inline;
}
.char-space {
  /* space between "Personal" and "Site" */
}
.char-i-slot {
  display: inline-block;
  width: 0.45em;
  vertical-align: baseline;
}
.lighthouse-char-img {
  transition: none;
  will-change: left, top, opacity;
}
</style>
