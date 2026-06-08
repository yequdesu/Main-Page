import * as THREE from 'three'
import { WHITE_OUT_THRESHOLD, WHITE_OUT_END, GRID_SHIFT_START } from '../constants.js'
import { _bgBaseColor, _bgTargetColor, _bgLerpColor } from '../shared/reusableObjects.js'

export function sceneApplyWhiteOut(sp, ctx) {
  const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
  _bgLerpColor.copy(_bgBaseColor).lerp(_bgTargetColor, wof)
  ctx.scene.background = _bgLerpColor

  let fogDensity = 0.02
  if (sp >= WHITE_OUT_THRESHOLD && sp < WHITE_OUT_END) {
    fogDensity = 0.02 + wof * 0.08
  } else if (sp >= WHITE_OUT_END) {
    const fadeProgress = Math.max(0, Math.min(1, (sp - WHITE_OUT_END) / (GRID_SHIFT_START - WHITE_OUT_END)))
    fogDensity = 0.10 * (1.0 - fadeProgress)
  }

  if (fogDensity > 0.001) {
    if (!ctx.scene.fog) {
      ctx.scene.fog = new THREE.FogExp2(_bgLerpColor, fogDensity)
    }
    ctx.scene.fog.color.copy(_bgLerpColor)
    ctx.scene.fog.density = fogDensity
  } else {
    if (ctx.scene.fog) ctx.scene.fog = null
  }

  if (ctx._ambientLightRef) ctx._ambientLightRef.intensity = 1.4 + wof * 3.5

  if (ctx.beamPivot) {
    ctx.beamPivot.visible = wof < 1.0
  }
}

export function build(ctx) {
  // 无独立 Three.js 对象创建——build 是空操作
}

export function dispose(ctx) {
  // 无独立资源需要释放
}
