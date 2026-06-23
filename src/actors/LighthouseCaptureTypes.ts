import { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, type Group } from 'three'

/**
 * LighthouseCaptureTypes — 离屏截图可调参数的类型定义 + 默认值 + 纯函数。
 *
 * 从 LighthouseCapture.tsx 提取。共 17 个可控参数。
 * 用于主应用（默认值行为不变）和 debug 预览面板（Leva 控件覆盖）。
 *
 * 援引：Three.js WebGLRenderer / PerspectiveCamera / Light 配置
 */

// ============================================================
// 类型
// ============================================================

export interface CaptureConfig {
  // ---- Renderer ----
  captureW: number
  captureH: number
  antialias: boolean

  // ---- Camera ----
  cameraFov: number
  cameraZ: number
  cameraY: number
  cameraNear: number
  cameraFar: number

  // ---- 复制位移 ----
  cloneY: number

  // ---- Ambient 光 ----
  ambientColor: string
  ambientIntensity: number

  // ---- Key 方向光 ----
  keyColor: string
  keyIntensity: number
  keyX: number
  keyY: number
  keyZ: number

  // ---- Fill 方向光 ----
  fillColor: string
  fillIntensity: number
  fillX: number
  fillY: number
  fillZ: number
}

// ============================================================
// 默认值（与当前 LighthouseCapture.tsx 硬编码值严格一致）
// ============================================================

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  captureW: 512,
  captureH: 1024,
  antialias: true,
  cameraFov: 25,
  cameraZ: 9,
  cameraY: 0,
  cameraNear: 0.1,
  cameraFar: 50,
  cloneY: -0.965,
  ambientColor: '#ffffff',
  ambientIntensity: 1.8,
  keyColor: '#ffffff',
  keyIntensity: 2.2,
  keyX: 4,
  keyY: 6,
  keyZ: 8,
  fillColor: '#c8d6ff',
  fillIntensity: 1.0,
  fillX: -4,
  fillY: 2,
  fillZ: 4,
}

// ============================================================
// 离屏截图纯函数
// ============================================================

/**
 * 根据 CaptureConfig 在离屏画布上执行一次渲染并返回 dataURL。
 *
 * 原 LighthouseCapture.tsx 中 useCallback 内联逻辑的参数化版本。
 * 调用者负责传入 lighthouseGroup 引用（主应用用 _lighthouseGroupRef，
 * 预览面板用独立 ref）。
 *
 * @returns PNG dataURL，失败时返回 null
 */
export function offscreenCapture(
  config: CaptureConfig,
  lighthouseGroup: Group | null,
): string | null {
  if (!lighthouseGroup) {
    console.warn('offscreenCapture: lighthouseGroup is null')
    return null
  }

  try {
    // ---- 独立渲染器 ----
    const offRenderer = new WebGLRenderer({
      alpha: true,
      antialias: config.antialias,
      preserveDrawingBuffer: true,
    })
    offRenderer.setSize(config.captureW, config.captureH)
    offRenderer.setPixelRatio(1)
    offRenderer.setClearColor(0x000000, 0)

    // ---- 克隆灯塔并居中 ----
    const clone = lighthouseGroup.clone(true)
    clone.position.set(0, config.cloneY, 0)
    clone.scale.copy(lighthouseGroup.scale)

    const tempScene = new Scene()
    tempScene.add(clone)

    // ---- 光照 ----
    tempScene.add(new AmbientLight(config.ambientColor, config.ambientIntensity))

    const key = new DirectionalLight(config.keyColor, config.keyIntensity)
    key.position.set(config.keyX, config.keyY, config.keyZ)
    tempScene.add(key)

    const fill = new DirectionalLight(config.fillColor, config.fillIntensity)
    fill.position.set(config.fillX, config.fillY, config.fillZ)
    tempScene.add(fill)

    // ---- 相机 ----
    const capCam = new PerspectiveCamera(
      config.cameraFov,
      config.captureW / config.captureH,
      config.cameraNear,
      config.cameraFar,
    )
    capCam.position.set(0, config.cameraY, config.cameraZ)
    capCam.lookAt(0, 0, 0)

    // ---- 渲染 & 捕获 ----
    offRenderer.render(tempScene, capCam)
    const dataUrl = offRenderer.domElement.toDataURL('image/png')

    // ---- 清理 ----
    offRenderer.dispose()
    clone.traverse((c) => {
      if ((c as any).geometry) (c as any).geometry.dispose()
      if ((c as any).material) {
        const mat = (c as any).material
        if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose())
        else mat.dispose()
      }
    })

    return dataUrl
  } catch (err) {
    console.error('offscreenCapture failed:', err)
    return null
  }
}
