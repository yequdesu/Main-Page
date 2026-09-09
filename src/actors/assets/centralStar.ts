import { STAR_FAR_LIGHT_RGB } from './celestialLighting'
import { Group, Mesh, SphereGeometry, MeshBasicMaterial, Sprite, SpriteMaterial, AdditiveBlending } from 'three'
import { makeHaloTexture } from './haloTexture'

// -- 几何 --
/** 核心半径  ↑=恒星更大更亮  ↓=恒星更小更收敛 */
const CORE_RADIUS = 0.42
const CORE_SEGMENTS = 32
/** 内层光晕半径  ↑=近场散射更扩散  ↓=光晕紧贴核心 */
const INNER_GLOW_RADIUS = 0.70
const INNER_GLOW_SEGMENTS = 32

// -- 颜色 --
/** 核心色（暖白）  改色相→恒星色调变化 */
const CORE_COLOR = '#fff8e7'
/** 内层光晕色（暖金）  改色相→光晕冷暖偏移 */
const INNER_GLOW_COLOR = '#ffe8c0'

// -- 内层光晕动画 --
/** 光晕不透明度系数  ↑=光晕更亮更明显  ↓=光晕更暗更收敛 */
const GLOW_OPACITY_COEFF = 0.30       // × smooth3 × pulse
/** 呼吸频率1  ↑=脉动更快  ↓=脉动更慢 */
const PULSE_FREQ_1 = 1.8
/** 呼吸振幅1  ↑=亮度波动更大  ↓=更接近静态 */
const PULSE_AMP_1 = 0.06
/** 呼吸频率2  ↑=高频微抖更快  ↓=更平滑 */
const PULSE_FREQ_2 = 3.3
/** 呼吸振幅2  ↑=微抖更明显  ↓=更平滑 */
const PULSE_AMP_2 = 0.04

// -- 外层 Sprite（金色近场） --
/** Sprite 缩放  ↑=近场柔光扩散更远  ↓=收窄 */
const SPRITE_SCALE = 5.5
/** Sprite 不透明度系数  ↑=近场柔光更亮  ↓=更暗 */
const SPRITE_OPACITY_COEFF = 0.55      // × smooth3 × pulse

// -- 远场 Sprite（灰白，大扩散） --
/** 远场缩放  ↑=扩散范围更大  ↓=收窄 */
const FAR_SPRITE_SCALE = 20.0
/** 远场不透明度系数  ↑=远场更亮  ↓=更暗 */
const FAR_SPRITE_OPACITY_COEFF = 0.32   // × smooth3 × pulse

// -- halo 纹理 --
/** 金色近场径向渐变  [位置, rgba] */
const HALO_COLOR_STOPS: [number, string][] = [
  [0,    'rgba(255,240,210,0.6)'],
  [0.15, 'rgba(255,220,170,0.35)'],
  [0.4,  'rgba(255,180,100,0.08)'],
  [0.7,  'rgba(255,140,60,0.01)'],
  [1,    'rgba(0,0,0,0)'],
]
/** 灰白远场径向渐变  [位置, rgba] */
const FAR_HALO_COLOR_STOPS: [number, string][] = [
  [0,    `rgba(${STAR_FAR_LIGHT_RGB.join(',')},0.18)`],
  [0.1,  'rgba(160,170,195,0.10)'],
  [0.3,  'rgba(140,150,180,0.03)'],
  [0.6,  'rgba(120,130,160,0.005)'],
  [1,    'rgba(0,0,0,0)'],
]

/** 主页与 Studio 共用的恒星视觉资产；实例独占节点、几何体、材质和贴图。 */
export function createCentralStarAsset() {
  const root = new Group()
  root.name = '中央恒星'
  root.renderOrder = 1
  const core = new Mesh(new SphereGeometry(CORE_RADIUS, CORE_SEGMENTS, CORE_SEGMENTS), new MeshBasicMaterial({ color: CORE_COLOR }))
  core.name = '恒星核心'
  const glow = new Mesh(new SphereGeometry(INNER_GLOW_RADIUS, INNER_GLOW_SEGMENTS, INNER_GLOW_SEGMENTS), new MeshBasicMaterial({ color: INNER_GLOW_COLOR, transparent: true, opacity: GLOW_OPACITY_COEFF, depthWrite: false }))
  glow.name = '内层光晕'
  const haloTex = makeHaloTexture(HALO_COLOR_STOPS)
  const farHaloTex = makeHaloTexture(FAR_HALO_COLOR_STOPS)
  const nearHalo = new Sprite(new SpriteMaterial({ map: haloTex, blending: AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, depthTest: true }))
  nearHalo.name = '近场柔光'
  nearHalo.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1)
  const farHalo = new Sprite(new SpriteMaterial({ map: farHaloTex, blending: AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, depthTest: true }))
  farHalo.name = '远场柔光'
  farHalo.scale.set(FAR_SPRITE_SCALE, FAR_SPRITE_SCALE, 1)
  for (const object of [core, glow, nearHalo, farHalo]) {
    object.renderOrder = 1
    root.add(object)
  }
  return {
    root, core, glow, nearHalo, farHalo,
    updateGlow(time: number, intensity: number) {
      const pulse = 1 + Math.sin(time * PULSE_FREQ_1) * PULSE_AMP_1 + Math.sin(time * PULSE_FREQ_2) * PULSE_AMP_2
      glow.material.opacity = intensity * GLOW_OPACITY_COEFF * pulse
      glow.scale.setScalar(pulse)
      nearHalo.material.opacity = intensity * SPRITE_OPACITY_COEFF * pulse
      farHalo.material.opacity = intensity * FAR_SPRITE_OPACITY_COEFF * pulse
    },
    dispose() {
      core.geometry.dispose()
      glow.geometry.dispose()
      for (const object of [core, glow, nearHalo, farHalo]) object.material.dispose()
      haloTex.dispose()
      farHaloTex.dispose()
      // Sprite 的默认 geometry 属于 Three.js 共享资源，不能在此释放。
    },
  }
}
