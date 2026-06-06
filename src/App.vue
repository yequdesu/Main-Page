<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import LighthouseScene from './components/LighthouseScene.vue'
import AppFooter from './components/AppFooter.vue'

const SCROLL_VH = 15
const scrollProgress = ref(0)
const clickProgress = ref(0)
const isClickPlaying = ref(false)
const hintVisible = ref(true)
const brandTextVisible = computed(() => scrollProgress.value >= 0.70)
const effectiveProgress = computed(() =>
  isClickPlaying.value ? clickProgress.value : scrollProgress.value
)

let st
let _clickTween = null
let _maxScroll = 0

function onClick() {
  if (isClickPlaying.value) return
  if (scrollProgress.value >= 0.995) return

  clickProgress.value = scrollProgress.value
  isClickPlaying.value = true
  _maxScroll = document.body.scrollHeight - window.innerHeight

  const tweenObj = { val: scrollProgress.value }
  _clickTween = gsap.to(tweenObj, {
    val: 1.0,
    duration: 2.5,
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

function updateScroll(self) {
  const p = self.progress
  scrollProgress.value = p

  if (p > 0.02 && hintVisible.value) {
    hintVisible.value = false
  }
}

onMounted(() => {
  document.body.style.height = window.innerHeight * SCROLL_VH + 'px'

  st = ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.4,
    onUpdate: updateScroll
  })

  window.addEventListener('click', onClick)
  window.addEventListener('wheel', onWheel, { passive: true })
})

onUnmounted(() => {
  st?.kill()
  ScrollTrigger.getAll().forEach((t) => t.kill())
  document.body.style.height = ''
  window.removeEventListener('click', onClick)
  window.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <LighthouseScene :scrollProgress="effectiveProgress" />

  <Transition name="hint-fade">
    <div v-if="hintVisible" class="scroll-hint" aria-hidden="true">
      <span>Scroll</span>
      <span class="click-hint">or click to skip</span>
      <div class="scroll-arrow" />
    </div>
  </Transition>

  <Transition name="brand-fade">
    <div v-if="brandTextVisible" class="brand-text" aria-hidden="true">
      <span class="brand-text-main">Personal Site</span>
      <span class="brand-text-sub">by YeQuDesu</span>
    </div>
  </Transition>

  <AppFooter />
</template>

<style>
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

.brand-text {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  pointer-events: none;
  transform: translateY(var(--text-offset-y, 0px));
}
.brand-text-main {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(1.8rem, 4.5vw, 3.5rem);
  font-weight: 400;
  color: #222;
  letter-spacing: 0.05em;
}
.brand-text-sub {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(0.8rem, 1.6vw, 1.1rem);
  font-weight: 400;
  color: #888;
  letter-spacing: 0.04em;
  font-style: italic;
}
.brand-fade-enter-active {
  transition: opacity 1.4s ease-out, transform 1.2s ease-out;
}
.brand-fade-leave-active {
  transition: opacity 0.5s ease-in;
}
.brand-fade-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(0.6rem);
}
.brand-fade-leave-to {
  opacity: 0;
}
</style>
