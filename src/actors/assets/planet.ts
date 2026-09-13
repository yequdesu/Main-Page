import { Group, Mesh, SphereGeometry, MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial, BackSide, Sprite, SpriteMaterial, AdditiveBlending, Color, type Texture } from 'three'
import { atmosphereVertex, atmosphereFragment } from '../../shaders/AtmosphereShader'
import { makeHaloTexture } from './haloTexture'

// ============================================================
// Planet — 几何常量
// ============================================================

/** 行星基准半径  ↑=所有几何体等比放大  ↓=等比缩小 */
export const PLANET_BASE_RADIUS = 0.015
const GEO_SEGMENTS = 32

// ============================================================
// Planet Atmosphere — 可调参数
// ============================================================

/** Fresnel 壳半径倍率  ↑=边缘辉光离核心更远、光环更宽  ↓=辉光紧贴核心 */
const ATMOS_SHELL_SCALE = 1.03
/** Fresnel 壳不透明度系数  ↑=辉光更亮更明显  ↓=辉光更暗 */
const ATMOS_SHELL_OPACITY = 0.35
/** Sprite scale 系数  ↑=远场柔光扩散更远  ↓=收窄 */
export const ATMOS_HALO_SCALE = 1.0
/** Sprite 不透明度系数  ↑=柔光更亮  ↓=柔光更暗 */
const ATMOS_HALO_OPACITY = 0.32
/** 内层光晕半径倍率  ↑=近场散射更扩散  ↓=光晕紧贴核心 */
export const INNER_GLOW_SCALE = 1.1
/** 内层光晕不透明度系数  ↑=光晕更亮更明显  ↓=光晕更暗 */
const INNER_GLOW_OPACITY = 0.06

// -- 颜色 --
/** 行星核心色  改色相→行星基调变化 */
const PLANET_CORE_COLOR = '#f0f8ff'
/** 主页内容阶段与独立预览使用同一核心色。 */
export const PLANET_CONTENT_COLOR = '#64748b'
/** 内层光晕色  改色相→光晕冷暖偏移 */
const INNER_GLOW_COLOR = '#f6f7f9'
/** Fresnel 壳色  改色相→边缘辉光冷暖偏移 */
const FRESNEL_SHELL_COLOR = '#d0d5de'

// -- 内层光晕脉冲 --
/** 呼吸频率1  ↑=脉动更快  ↓=脉动更慢 */
const GLOW_PULSE_FREQ_1 = 1.1
/** 呼吸振幅1  ↑=亮度波动更大  ↓=更接近静态 */
const GLOW_PULSE_AMP_1 = 0.01
/** 呼吸频率2  ↑=高频微抖更快  ↓=更平滑 */
const GLOW_PULSE_FREQ_2 = 1.6
/** 呼吸振幅2  ↑=微抖更明显  ↓=更平滑 */
const GLOW_PULSE_AMP_2 = 0.01

// -- Sprite 脉冲 --
/** 呼吸频率1  ↑=脉动更快  ↓=脉动更慢 */
const SPRITE_PULSE_FREQ_1 = 1.1
/** 呼吸振幅1  ↑=亮度波动更大  ↓=更接近静态 */
const SPRITE_PULSE_AMP_1 = 0.02
/** 呼吸频率2  ↑=高频微抖更快  ↓=更平滑 */
const SPRITE_PULSE_FREQ_2 = 1.5
/** 呼吸振幅2  ↑=微抖更明显  ↓=更平滑 */
const SPRITE_PULSE_AMP_2 = 0.02

// -- halo 纹理 --
/** 径向渐变色阶  [位置, rgba]  位置: 0=中心 1=边缘  改色值→调色系  改位置→衰减节奏 */
const HALO_COLOR_STOPS: [number, string][] = [
  [0,    'rgba(220,225,235,0.35)'],
  [0.15, 'rgba(200,210,225,0.18)'],
  [0.4,  'rgba(180,195,215,0.04)'],
  [0.7,  'rgba(160,175,200,0.005)'],
  [1,    'rgba(0,0,0,0)'],
]

export function createPlanetHaloTexture() {
  return makeHaloTexture(HALO_COLOR_STOPS)
}

/** 单颗行星的共用视觉构造；贴图由系统实例共享并释放，其余资源由此资产拥有。 */
export function createPlanetAsset(trackIdx: number, haloTexture: Texture) {
  // Planet core
  const geo = new SphereGeometry(PLANET_BASE_RADIUS, GEO_SEGMENTS, GEO_SEGMENTS)
  const mat = new MeshStandardMaterial({
    color: PLANET_CORE_COLOR, roughness: 0.95, metalness: 0,
    // 少量同色自发光托住暗面，避免导航行星出现过黑的半球。
    emissive: PLANET_CORE_COLOR, emissiveIntensity: 0.35,
    transparent: true, opacity: 0, depthWrite: true, depthTest: true,
  })
  const mesh = new Mesh(geo, mat)
  mesh.renderOrder = 1
  mesh.name = `planet_${trackIdx}`

  // Inner glow sphere (pulsing, depthWrite=false)
  const glowGeo = new SphereGeometry(PLANET_BASE_RADIUS * INNER_GLOW_SCALE, GEO_SEGMENTS, GEO_SEGMENTS)
  const glowMat = new MeshBasicMaterial({ color: INNER_GLOW_COLOR, transparent: true, opacity: 0, depthWrite: false, depthTest: true })
  const glow = new Mesh(glowGeo, glowMat)
  glow.renderOrder = 1
  glow.name = `glow_${trackIdx}`

  // Fresnel atmosphere shell (BackSide)
  const shellGeo = new SphereGeometry(PLANET_BASE_RADIUS * ATMOS_SHELL_SCALE, GEO_SEGMENTS, GEO_SEGMENTS)
  const shellMat = new ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new Color(FRESNEL_SHELL_COLOR) } },
    transparent: true, depthWrite: false, side: BackSide,
  })
  const shell = new Mesh(shellGeo, shellMat)
  shell.renderOrder = 1
  shell.name = `atmos_${trackIdx}`

  // Sprite halo (shared texture, AdditiveBlending)
  const sMat = new SpriteMaterial({
    map: haloTexture, blending: AdditiveBlending,
    transparent: true, opacity: 0, depthWrite: false, depthTest: true,
  })
  const sprite = new Sprite(sMat)
  sprite.renderOrder = 9999
  sprite.name = `halo_${trackIdx}`
  const root = new Group()
  root.name = `行星 ${trackIdx + 1}`
  root.add(mesh, glow, shell, sprite)
  return {
    root, core: mesh, glow, atmosphere: shell, halo: sprite,
    /** 相对核心半径的实体视觉包络，用于主页标签避让（不包含远场柔光）。 */
    visualRadiusScale: INNER_GLOW_SCALE,
    updateAppearance(time: number, phase: number, scale: number, opacity: number, glowFactor: number, haloScale: number) {
      mat.emissive.copy(mat.color) // 跟随主页的跨幕颜色插值，也适用于独立预览。
      const gPulse = 1 + Math.sin(time * GLOW_PULSE_FREQ_1 + phase * 2.1) * GLOW_PULSE_AMP_1 + Math.sin(time * GLOW_PULSE_FREQ_2 + phase) * GLOW_PULSE_AMP_2
      glow.position.copy(mesh.position)
      glow.scale.setScalar(scale * gPulse)
      glow.material.opacity = opacity * INNER_GLOW_OPACITY * gPulse * glowFactor
      shell.position.copy(mesh.position)
      shell.scale.setScalar(scale)
      shell.material.uniforms.uOpacity.value = opacity * ATMOS_SHELL_OPACITY * glowFactor
      const pulse = 1 + Math.sin(time * SPRITE_PULSE_FREQ_1 + phase * 2.1) * SPRITE_PULSE_AMP_1 + Math.sin(time * SPRITE_PULSE_FREQ_2 + phase) * SPRITE_PULSE_AMP_2
      sprite.position.copy(mesh.position)
      sprite.scale.set(haloScale * pulse, haloScale * pulse, 1)
      sprite.material.opacity = opacity * ATMOS_HALO_OPACITY * pulse * glowFactor
    },
    dispose() {
      for (const object of [mesh, glow, shell]) object.geometry.dispose()
      for (const object of [mesh, glow, shell, sprite]) object.material.dispose()
    },
  }
}
