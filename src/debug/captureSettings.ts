// 服务端与编辑器共用保存边界。渲染分辨率、抗锯齿仅为本次预览选项。
export const SAVABLE_KEYS = [
  'cameraFov',
  'cameraZ',
  'cameraY',
  'ambientColor',
  'ambientIntensity',
  'keyColor',
  'keyIntensity',
  'keyX',
  'keyY',
  'keyZ',
  'fillColor',
  'fillIntensity',
  'fillX',
  'fillY',
  'fillZ',
  'cloneY',
  'silhouetteFillColor',
  'silhouetteType',
  'outlineType',
  'edgeGlowIntensity',
  'edgeGlowColor',
  'edgeGlowThickness',
] as const
const limits: Record<string, [number, number]> = {
  cameraFov: [1, 120],
  cameraZ: [2, 30],
  cameraY: [-5, 5],
  ambientIntensity: [0, 5],
  keyIntensity: [0, 5],
  fillIntensity: [0, 5],
  keyX: [-20, 20],
  keyY: [-20, 20],
  keyZ: [-20, 20],
  fillX: [-20, 20],
  fillY: [-20, 20],
  fillZ: [-20, 20],
  cloneY: [-3, 1],
  edgeGlowIntensity: [0, 1],
  edgeGlowThickness: [1, 10],
}
export function pickSavable(raw: unknown): Record<string, string | number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('配置必须为对象')
  const result: Record<string, string | number> = {}
  for (const key of SAVABLE_KEYS) {
    const value = (raw as Record<string, unknown>)[key]
    if (value === undefined) continue
    const range = limits[key]
    if (range) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1])
        throw new Error(`${key} 超出允许范围`)
    } else if (key === 'silhouetteType') {
      if (value !== 'real' && value !== 'solid') throw new Error('无效的主渲染模式')
    } else if (key === 'outlineType') {
      if (value !== 'none' && value !== 'silhouette') throw new Error('无效的描边模式')
    } else if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
      throw new Error(`${key} 必须为六位十六进制颜色`)
    result[key] = value as string | number
  }
  return result
}
export function savedSignature(raw: unknown) {
  return JSON.stringify(pickSavable(raw))
}
