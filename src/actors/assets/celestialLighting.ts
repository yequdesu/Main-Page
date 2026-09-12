/** 恒星远场渐变中心的 sRGB 色；柔光贴图与表面照明共用色源。 */
export const STAR_FAR_LIGHT_RGB = [180, 190, 210] as const
export const STAR_FAR_LIGHT_COLOR = `#${STAR_FAR_LIGHT_RGB.map(value => value.toString(16).padStart(2, '0')).join('')}`

/** 行星预览的柔和主光与补光；环境预设仍可调节环境光强度。 */
export const PLANET_PREVIEW_LIGHTING = {
  ambientColor: STAR_FAR_LIGHT_COLOR,
  ambientIntensity: 0.8,
  keyColor: STAR_FAR_LIGHT_COLOR,
  keyIntensity: 1.8,
  keyX: -6,
  keyY: 5,
  keyZ: 5,
  fillColor: STAR_FAR_LIGHT_COLOR,
  fillIntensity: 0.5,
  fillX: 6,
  fillY: 2,
  fillZ: 3,
}
