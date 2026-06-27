import {
  WebGLRenderer, Scene, PerspectiveCamera,
  AmbientLight, DirectionalLight,
  Mesh, Color,
  MeshBasicMaterial,
  type Group,
} from 'three'

/**
 * LighthouseCaptureTypes �?离屏截图可调参数的类型定�?+ 默认�?+ 纯函数�?
 *
 * �?LighthouseCapture.tsx 提取。共 17 个可控参数�?
 * 用于主应用（默认值行为不变）�?debug 预览面板（Leva 控件覆盖）�?
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

  // ---- Ambient �?----
  ambientColor: string
  ambientIntensity: number

  // ---- Key 方向�?----
  keyColor: string
  keyIntensity: number
  keyX: number
  keyY: number
  keyZ: number

  // ---- Fill 方向�?----
  fillColor: string
  fillIntensity: number
  fillX: number
  fillY: number
  fillZ: number

  // ---- 剪影 / 轮廓 ----
  /** 主灯塔渲染：real=真实3D（原始材�?光照）| solid=纯色剪影（无细节�?*/
  silhouetteType: 'real' | 'solid'
  /** 轮廓描边：none=不渲�?| silhouette=合并几何体外轮廓 */
  outlineType: 'none' | 'silhouette'
  /** 剪影填充色（hex）。night 默认 #0b101d，day 由调用方覆盖 */
  silhouetteFillColor: string
  /** 描边不透明度，0�? */
  edgeGlowIntensity: number
  /** 描边颜色（hex），默认白色 */
  edgeGlowColor: string
  /** 描边粗细�?�?0，对应外扩百分比。默�?4 */
  edgeGlowThickness: number
}

// ============================================================
// 默认值（与当�?LighthouseCapture.tsx 硬编码值严格一致）
// ============================================================

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  captureW: 2048,
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

  silhouetteFillColor: '#0b101d',
  silhouetteType: 'real' as const,
  outlineType: 'none' as const,
  edgeGlowIntensity: 0.8,
  edgeGlowColor: '#ffffff',
  edgeGlowThickness: 4,
}

// ============================================================
// 2D 边缘描边（纯 Canvas 后处理，不依�?3D 光照�?
// ============================================================

/**
 * 对透明背景 PNG �?alpha 通道做边缘检测，在最外层轮廓上绘制描边�?
 *
 * 算法�?
 *   1. 找到 alpha>0 且邻�?alpha=0 的像�?�?外轮廓边�?
 *   2. �?thickness 做形态学膨胀
 *   3. �?edgeGlowColor + edgeGlowIntensity 绘制描边像素
 *
 * @returns 描边后的 dataURL
 */
function applyEdgeStroke(
  sourceCanvas: HTMLCanvasElement,
  color: string,
  opacity: number,
  thickness: number,
): string {
  const w = sourceCanvas.width
  const h = sourceCanvas.height

  const ctx2d = document.createElement('canvas')
  ctx2d.width = w; ctx2d.height = h
  const ctx = ctx2d.getContext('2d')!

  ctx.drawImage(sourceCanvas, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // ---- 边缘检测：alpha>0 且任意邻�?alpha=0 ----
  const edge = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3] === 0) continue
      // 检�?4-邻域
      if (
        data[((y - 1) * w + x) * 4 + 3] === 0 ||
        data[((y + 1) * w + x) * 4 + 3] === 0 ||
        data[(y * w + (x - 1)) * 4 + 3] === 0 ||
        data[(y * w + (x + 1)) * 4 + 3] === 0
      ) {
        edge[y * w + x] = 1
      }
    }
  }

  // ---- 形态学膨胀（thickness 次迭代，每次外扩 1px�?----
  const dilated = new Uint8Array(w * h)
  dilated.set(edge)
  for (let t = 1; t < Math.round(thickness); t++) {
    const prev = new Uint8Array(dilated)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (prev[y * w + x]) continue
        if (
          prev[(y - 1) * w + x] || prev[(y + 1) * w + x] ||
          prev[y * w + (x - 1)] || prev[y * w + (x + 1)]
        ) {
          dilated[y * w + x] = 1
        }
      }
    }
  }

  // ---- 绘制描边像素 ----
  const rgba = new Color(color)
  const a = Math.round(opacity * 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (dilated[y * w + x]) {
        const i = (y * w + x) * 4
        data[i] = Math.round(rgba.r * 255)
        data[i + 1] = Math.round(rgba.g * 255)
        data[i + 2] = Math.round(rgba.b * 255)
        data[i + 3] = a
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return ctx2d.toDataURL('image/png')
}

// ============================================================
// 离屏截图纯函�?
// ============================================================

/**
 * 根据 CaptureConfig 在离屏画布上执行一次渲染并返回 dataURL�?
 *
 * �?LighthouseCapture.tsx �?useCallback 内联逻辑的参数化版本�?
 * 调用者负责传�?lighthouseGroup 引用（主应用�?_lighthouseGroupRef�?
 * 预览面板用独�?ref）�?
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
    // ---- 独立渲染�?----
    const offRenderer = new WebGLRenderer({
      alpha: true,
      antialias: config.antialias,
      preserveDrawingBuffer: true,
    })
    offRenderer.setSize(config.captureW, config.captureH)
    offRenderer.setPixelRatio(1)
    offRenderer.setClearColor(0x000000, 0)

    // ---- 克隆灯塔并居中（无畸变渲染） ----
    const clone = lighthouseGroup.clone(true)
    clone.position.set(0, config.cloneY, 0)
    clone.scale.copy(lighthouseGroup.scale)
    // 强制可见（源 group 可能�?useFrame 设为 visible=false�?
    clone.traverse((c) => { c.visible = true })

    // solid 剪影：主灯塔替换为纯色，保留窗户黄色发光
    if (config.silhouetteType === 'solid') {
      const windowGlow = new Color('#ffdf6d')
      const silhouetteMat = new MeshBasicMaterial({
        color: new Color(config.silhouetteFillColor),
        transparent: true,
        depthWrite: true,
      })
      clone.traverse((child) => {
        if (!(child instanceof Mesh)) return
        // 保留窗户发光（BoxGeometry + MeshBasicMaterial #ffdf6d + 非透明�?
        const mat = child.material
        if (
          mat instanceof MeshBasicMaterial &&
          !mat.transparent &&
          mat.color.getHex() === windowGlow.getHex()
        ) {
          return
        }
        child.material = silhouetteMat
      })
    }

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

    // ---- 合成：灯塔（居中渲染）贴�?+ base-line + 统一描边 ----
    // mask 屏幕宽度（世�?2×0.91 / halfW × captureW�?
    const _aspect = config.captureW / config.captureH
    const _halfH = config.cameraZ * Math.tan((config.cameraFov * Math.PI) / 180 / 2)
    const _halfW = _halfH * _aspect
    const _maskScreenW = Math.round((2 * 1.3 * 0.7) / (2 * _halfW) * config.captureW) // mask 全宽(px)

    const BASE_LINE_EXTEND = 400  // base-line 右侧延伸(px)
    const composite = document.createElement('canvas')
    composite.width = config.captureW + BASE_LINE_EXTEND
    composite.height = config.captureH
    const ctx = composite.getContext('2d')!

    // �?canvas �?lighthouse 居中区域 �?贴到合成 canvas 左侧 x=0
    const srcCenterX = Math.round(config.captureW / 2)
    const srcX = srcCenterX - Math.round(_maskScreenW / 2)
    ctx.drawImage(offRenderer.domElement, srcX, 0, _maskScreenW, config.captureH, 0, 0, _maskScreenW, config.captureH)

    // base-line �?mask 右边�?�?0px 起，至合�?canvas 右边�?
    const strokePad = Math.max(Math.round(config.edgeGlowThickness * 2), 8)
    const slope = (1.3 - 0.75) / 1.6  // 遮罩侧边斜率
    const lineHeight = 75
    const lineBottomY = config.captureH
    const lineTopY = lineBottomY - lineHeight
    const lineLeft = _maskScreenW - 50
    const lineRight = composite.width - strokePad
    const inset = lineHeight * slope

    ctx.fillStyle = config.silhouetteFillColor
    ctx.beginPath()
    ctx.moveTo(lineLeft, lineBottomY)
    ctx.lineTo(lineRight, lineBottomY)
    ctx.lineTo(lineRight - inset, lineTopY)
    ctx.lineTo(lineLeft, lineTopY)  // 左侧直角，贴�?mask 剪影
    ctx.closePath()
    ctx.fill()

    // 2D 后处理：边缘描边
    let dataUrl: string
    if (config.outlineType === 'silhouette') {
      dataUrl = applyEdgeStroke(
        composite,
        config.edgeGlowColor,
        config.edgeGlowIntensity,
        config.edgeGlowThickness,
      )
    } else {
      dataUrl = composite.toDataURL('image/png')
    }

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
