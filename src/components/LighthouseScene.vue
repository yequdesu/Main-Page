<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { ctx } from '../three/shared/stateContext.js'
import { createAnimationLoop } from '../three/shared/animationPipeline.js'
import { buildOcean, disposeOcean } from '../three/layers/oceanWaves.js'
import { buildLightBeam, disposeLightBeam } from '../three/layers/lightBeam.js'
import { buildDust, disposeDust } from '../three/layers/dustSystem.js'
import { buildGridLines, disposeGridLines } from '../three/layers/gridLines.js'
import { dispose as disposeOverlay } from '../three/layers/overlayCanvas.js'
import { act1 } from '../three/acts/act1OceanVoyage.js'
import { act2 } from '../three/acts/act2GridTransition.js'
import { act3 } from '../three/acts/act3ContentPhase.js'
import { GRID_SHIFT_START } from '../three/constants.js'
import { _dustProjectScratch } from '../three/shared/reusableObjects.js'

const props = defineProps({
  scrollProgress: { type: Number, default: 0 }
})

const emit = defineEmits(['focusChange', 'overlayData'])

const canvasRef = ref(null)
const overlayRef = ref(null)
const invertCanvasRef = ref(null)

const acts = [act1, act2, act3]

let animationLoop = null

// ============================================================
//  CAPTURE LIGHTHOUSE (for App.vue brand text)
// ============================================================
function captureLighthouse() {
  if (!ctx.lighthouseGroup || !ctx.renderer) return null

  const captureW = 512, captureH = 1024
  const offRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  offRenderer.setSize(captureW, captureH)
  offRenderer.setPixelRatio(1)
  offRenderer.setClearColor(0x000000, 0)

  const clone = ctx.lighthouseGroup.clone(true)
  const tempScene = new THREE.Scene()

  clone.position.set(0, -0.965, 0)
  clone.scale.copy(ctx.lighthouseGroup.scale)
  tempScene.add(clone)

  tempScene.add(new THREE.AmbientLight('#ffffff', 1.8))
  const key = new THREE.DirectionalLight('#ffffff', 2.2)
  key.position.set(4, 6, 8)
  tempScene.add(key)
  const fill = new THREE.DirectionalLight('#c8d6ff', 1.0)
  fill.position.set(-4, 2, 4)
  tempScene.add(fill)

  const capCam = new THREE.PerspectiveCamera(25, captureW / captureH, 0.1, 50)
  capCam.position.set(0, 0, 9)
  capCam.lookAt(0, 0, 0)

  offRenderer.render(tempScene, capCam)
  const dataUrl = offRenderer.domElement.toDataURL('image/png')

  offRenderer.dispose()
  clone.traverse(c => {
    if (c.geometry) c.geometry.dispose()
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose())
      else c.material.dispose()
    }
  })

  return dataUrl
}

defineExpose({ captureLighthouse })

// ============================================================
//  LIFECYCLE
// ============================================================
onMounted(() => {
  const w = window.innerWidth, h = window.innerHeight

  // Create Three.js infrastructure
  ctx.scene = new THREE.Scene()
  ctx.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 150)
  ctx.camera.position.set(0, 0.25, 8)
  ctx.camera.lookAt(0, -0.65, -24)

  ctx.renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: false, antialias: true })
  ctx.renderer.setSize(w, h)
  ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // Inject Vue refs into ctx
  ctx.canvasRef = canvasRef.value
  ctx.invertCanvasRef = invertCanvasRef
  ctx.overlayRef = overlayRef
  ctx.emit = emit

  // Initialize state on ctx
  ctx._mouseNDC = { x: 999, y: 999 }
  ctx._focusedPlanetIdx = -1
  ctx._focusStartTime = 0
  ctx._focusOrbitAngle = 0
  ctx._focusUIProgress = 0

  // Build all shared layers (order matters: lighthouse before dust)
  buildOcean(ctx)
  buildLightBeam(ctx)
  buildDust(ctx)
  buildGridLines(ctx)

  // Start animation pipeline
  animationLoop = createAnimationLoop(() => props.scrollProgress, acts)
  animationLoop.start()

  // Event listeners
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
  canvasRef.value.addEventListener('click', onClickCanvas)
})

onUnmounted(() => {
  animationLoop?.stop()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
  canvasRef.value?.removeEventListener('click', onClickCanvas)

  // Dispose in reverse build order
  disposeOverlay(ctx)
  disposeGridLines(ctx)
  disposeDust(ctx)
  disposeLightBeam(ctx)
  disposeOcean(ctx)

  ctx.renderer?.dispose()
})

// ============================================================
//  EVENT HANDLERS
// ============================================================
function onResize() {
  const w = window.innerWidth, h = window.innerHeight
  ctx.renderer.setSize(w, h)
  ctx.camera.aspect = w / h
  ctx.camera.updateProjectionMatrix()
}

function onMouseMove(e) {
  ctx._mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1
  ctx._mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1
}

function onClickCanvas(e) {
  const sp = props.scrollProgress
  if (sp < GRID_SHIFT_START) return

  if (ctx._focusedPlanetIdx >= 0) {
    ctx._focusStartTime = performance.now() * 0.001
  }

  const rect = canvasRef.value.getBoundingClientRect()
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

  const dustParticles = ctx.dustParticles || []
  const _mainPlanetIndices = ctx._mainPlanetIndices || []
  const _planetLinks = ctx._planetLinks || []

  let bestDist = 1e9, bestIdx = -1
  for (let i = 0; i < dustParticles.length; i++) {
    const p = dustParticles[i]
    if (!p.userData.isMainPlanet) continue
    _dustProjectScratch.copy(p.position).project(ctx.camera)
    const dx = (_dustProjectScratch.x - ndcX) * (ctx.camera.aspect || 1)
    const dy = _dustProjectScratch.y - ndcY
    const dist = Math.hypot(dx, dy)
    if (dist < bestDist) { bestDist = dist; bestIdx = i }
  }

  if (bestDist < 0.16 && bestIdx >= 0) {
    const trackIdx = _mainPlanetIndices.indexOf(bestIdx)
    if (trackIdx >= 0 && trackIdx < _planetLinks.length) {
      if (ctx._focusedPlanetIdx === bestIdx) {
        const linkUrl = _planetLinks[trackIdx].url
        if (linkUrl) window.open(linkUrl, '_blank', 'noopener')
      } else {
        ctx._focusedPlanetIdx = bestIdx
        ctx._focusStartTime = performance.now() * 0.001
        ctx._focusOrbitAngle = 0
        emit('focusChange', true)
      }
    }
  } else {
    ctx._focusedPlanetIdx = -1
    emit('focusChange', false)
  }
}
</script>

<template>
  <div style="position:fixed;inset:0;z-index:0">
    <canvas ref="canvasRef" style="position:absolute;inset:0" />
    <canvas ref="invertCanvasRef" style="position:absolute;inset:0;pointer-events:none;mix-blend-mode:difference;" />
    <canvas ref="overlayRef" style="position:absolute;inset:0;pointer-events:none" />
  </div>
</template>
