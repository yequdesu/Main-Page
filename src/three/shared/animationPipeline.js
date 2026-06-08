import { ctx } from './stateContext.js'
import { clamp, smoothstep } from '../constants.js'
import { GRID_START, VERTICAL_START, GRID_SHIFT_START, WHITE_OUT_END } from '../constants.js'
import { sceneApplyWhiteOut } from '../layers/whiteOutManager.js'
import { animateWavesAndLighting } from '../layers/oceanWaves.js'
import { animateVerticalGrid } from '../layers/gridLines.js'
import { animateDust } from '../layers/dustSystem.js'
import { animateBeam } from '../layers/lightBeam.js'
import { updateOverlayCanvas } from '../layers/overlayCanvas.js'

const builtActs = new Set()

export function resolveActiveActs(sp, acts, ctx) {
  const active = []
  for (const act of acts) {
    const inRange = sp >= act.start - 0.01 && sp <= act.end + 0.01
    if (inRange) {
      if (!builtActs.has(act.name)) {
        if (act.build) act.build(ctx)
        builtActs.add(act.name)
      }
      active.push(act)
    }
  }
  return active
}

export function createAnimationLoop(getScrollProgress, acts) {
  let animationId = null

  function animate(time) {
    animationId = requestAnimationFrame(animate)
    const t = time * 0.001
    const sp = getScrollProgress()

    updateTextOffsetCSS(sp)

    // 1. White-out (fog / background)
    sceneApplyWhiteOut(sp, ctx)

    // 2. Lighthouse visibility
    if (ctx.lighthouseGroup) {
      ctx.lighthouseGroup.visible = sp < WHITE_OUT_END
    }

    // 3. Shared layer animations (explicit order preserved from original)
    const gridFactor = clamp((sp - GRID_START) / (VERTICAL_START - GRID_START), 0, 1)
    const smoothProgress3 = smoothstep(clamp((sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START), 0, 1))

    animateWavesAndLighting(t, sp, gridFactor, smoothProgress3, ctx)
    animateVerticalGrid(sp, smoothProgress3, ctx)
    animateDust(t, sp, ctx)
    animateBeam(t, sp, ctx)

    // 4. Act-specific animations
    const activeActs = resolveActiveActs(sp, acts, ctx)
    for (const act of activeActs) {
      const tSp = clamp((sp - act.start) / (act.end - act.start), 0, 1)
      if (act.animate) act.animate(t, tSp, sp, ctx)
    }

    // 5. Overlay canvas (camera focus + HUD)
    updateOverlayCanvas(sp, t, ctx)

    // 6. Render
    ctx.renderer.render(ctx.scene, ctx.camera)
  }

  return {
    start() {
      animationId = requestAnimationFrame(animate)
    },
    stop() {
      if (animationId) cancelAnimationFrame(animationId)
    }
  }
}

let _lastCssSpKey = -1
function updateTextOffsetCSS(sp) {
  const key = Math.round(sp * 1000)
  if (key === _lastCssSpKey) return
  _lastCssSpKey = key
  const progress = clamp((sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START), 0, 1)
  const smoothP = progress * progress * (3 - 2 * progress)
  document.documentElement.style.setProperty('--text-offset-y', `${-90 * smoothP}px`)
}
