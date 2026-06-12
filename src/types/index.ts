import type { Mesh, InstancedMesh, Sprite, Group, Line } from 'three'

// ============================================================
// Scroll 阈值（从 LighthouseScene.vue 逐字保留）
// 援引：R3F Rig 模式 — Builder.io, Codrops 2025
// ============================================================
export const SCROLL_RIG = {
  SCENE_CENTER_Z: -16.0,
  WHITE_OUT_THRESHOLD: 0.40,
  WHITE_OUT_END: 0.55,
  GRID_START: 0.45,
  VERTICAL_START: 0.58,
  TEXT_START: 0.70,
  GRID_SHIFT_START: 0.85,
  ORBIT_RADII: [3.6, 5.0, 6.4] as const,
  ORBIT_COUNT: 3,
  FOCUS_TIMEOUT: 30,
  IDLE_RESET_DELAY: 1.5,
} as const

// ============================================================
// 轨道环配置（可扩展）
// 援引：Murray & Dermott, Solar System Dynamics, §2.8
// ============================================================
export interface OrbitalRingConfig {
  /** 轨道外半径 */
  radius: number
  /** 轨道内半径，默认 radius - 0.04 */
  innerRadius?: number
  /** 黄道面倾角 (rad) */
  inclination: number
  /** 偏心率 0–1（0=正圆） */
  eccentricity: number
  /** 进动角速度 (rad/s)，speedScale=1 时的值 */
  speed: number
  /** 初始升交点经度 (rad) */
  phase: number
  /** 环颜色，默认 '#cbd5e1' */
  color?: string
  /** 最大透明度 0–1，默认 0.28 */
  maxOpacity?: number
  /** 环分段数，默认 96 */
  segments?: number
}

// ============================================================
// 粒子数据
// ============================================================
export interface ParticleData {
  wx: number; wy: number; wz: number
  dx: number; dy: number; dz: number
  ph: number
  scale: number; sizeBoost: number
  grayHex: string
  orbitAngle: number
  orbitR: number
  orbitSpeed: number
  _baseSpeed: number
  scaleMult: number
  wobbleAmp?: number
  wobbleFreq?: number
  isMainPlanet: boolean
  hoverFactor: number
  orbitTilt: number
  flattenY: number
}

// ============================================================
// 行星链接
// ============================================================
export interface PlanetLink {
  label: string
  accent: string
  url: string
}

export const PLANET_LINKS: PlanetLink[] = [
  { label: 'FS',     accent: '#94a3b8', url: 'https://fs.yequdesu.top' },
  { label: 'Code',   accent: '#0ea5e9', url: 'https://code.yequdesu.top' },
  { label: 'GitHub', accent: '#818cf8', url: 'https://github.com/yequdesu' },
]

// ============================================================
// 波浪数据
// ============================================================
export interface WaveLineData {
  baseY: number; z: number
  amplitude: number; frequency: number; speed: number
  phase: number; span: number; segCount: number
  opacity: number
}

export interface WaveBaseColor { r: number; g: number; b: number }

// ============================================================
// 网格线数据
// ============================================================
export interface GridLineData {
  line: Line
  x: number; baseY: number
  zStart: number; zEnd: number
  staggerOffset: number
}

// ============================================================
// 屏幕覆盖数据
// ============================================================
export interface ScreenCircle { x: number; y: number; r: number }
export interface TangentLine { x1: number; y1: number; x2: number; y2: number }

export interface OverlayData {
  focused: boolean
  star?: ScreenCircle
  planet?: ScreenCircle
  tangents?: TangentLine[]
}

// ============================================================
// Act 引用（从 act.exit 保存到 ctx 的数据）
// ============================================================
export interface Act1State {
  oceanLines: Line[]
  waveData: WaveLineData[]
  waveBaseColors: WaveBaseColor[]
  beamFinalAngleY: number
  beamFinalAngleX: number
}

export interface Act2State {
  gridVerticalLines: GridLineData[]
}
