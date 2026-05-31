<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import LighthouseScene from './components/LighthouseScene.vue'
import AppFooter from './components/AppFooter.vue'

const SCROLL_VH = 3
const scrollProgress = ref(0)
const hintVisible = ref(true)

let st

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
})

onUnmounted(() => {
  st?.kill()
  ScrollTrigger.getAll().forEach((t) => t.kill())
  document.body.style.height = ''
})
</script>

<template>
  <LighthouseScene :scrollProgress="scrollProgress" />

  <Transition name="hint-fade">
    <div v-if="hintVisible" class="scroll-hint" aria-hidden="true">
      <span>Scroll</span>
      <div class="scroll-arrow" />
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
@keyframes sc-bounce {
  0%, 100% { transform: rotate(45deg) translateY(0); }
  50% { transform: rotate(45deg) translateY(6px); }
}
.hint-fade-enter-active { transition: opacity 0.8s; }
.hint-fade-leave-active { transition: opacity 0.4s; }
.hint-fade-enter-from,
.hint-fade-leave-to { opacity: 0; }
</style>
