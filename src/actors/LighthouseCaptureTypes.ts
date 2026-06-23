import {
  WebGLRenderer, Scene, PerspectiveCamera,
  AmbientLight, DirectionalLight,
  Mesh, Color, AdditiveBlending, BackSide,
  MeshBasicMaterial, BufferGeometry,
  type Group,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { edgeGlowVertex, edgeGlowFragment } from '../shaders/EdgeGlowShader'

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

  // ---- 轮廓辉光 ----
  /** 辉光强度，0=关闭。动画时序中 GSAP tween 此值 */
  edgeGlowIntensity: number
  /** 描边颜色（hex），默认 Slate-400 */
  edgeGlowColor: string
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

  edgeGlowIntensity: 0.0,
  edgeGlowColor: '#94a3b8',
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

    // ---- 轮廓描边层（合并几何体 → 单一外轮廓 Inverted Hull） ----
    if (config.edgeGlowIntensity > 0) {
      const geometries: BufferGeometry[] = []

      lighthouseGroup.traverse((child) => {
        if (!(child instanceof Mesh)) return
        // 排除遮罩（最底边，与场景背景同色 #050811）
        if (child.position.y < -0.85) return

        const geo = child.geometry.clone()
        child.updateMatrix()
        geo.applyMatrix4(child.matrix)
        geometries.push(geo)
      })

      if (geometries.length > 0) {
        const mergedGeo = mergeGeometries(geometries, false)

        const outline = new Mesh(mergedGeo, new MeshBasicMaterial({
          color: new Color(config.edgeGlowColor),
          opacity: config.edgeGlowIntensity,
          side: BackSide,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        }))
        outline.position.set(0, config.cloneY, 0)
        outline.scale.copy(lighthouseGroup.scale).multiplyScalar(1.04)

        tempScene.add(outline)
      }
    }

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
