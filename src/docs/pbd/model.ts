import { resetPBD, stepPBD, type PBDInput, type PBDResult } from '../../behaviors/usePBDLayout'

export const NAMES = ['FS', 'Code', 'GitHub'] as const
// 固定实验坐标系。SVG 可以缩放显示，但物理单位始终是模拟视口中的 px。
export const WORLD = { width: 1280, height: 720 }
export const SCENARIOS = {
  orbit: { name: '轨道跟随', note: '观察虚线目标与实线标签之间的距离。轨道是屏幕空间示意，不复刻主页的三维运动。' },
  crowded: { name: '标签拥挤', note: '三个静止行星间隔 15px。标签间排斥只改变速度，重叠可能持续；试着比较不同求解帧率。' },
  star: { name: '恒星遮挡', note: '行星靠近恒星中心。C 只保护标签中心；检查矩形到恒星圆的净距是否为负。' },
  expanded: { name: '展开约束', note: 'FS 宽度为 200px，左右锚点相距 200px；R=70px 时，两点无法同时进入直径 140px 的圆。' },
  edge: { name: '视口边缘', note: '行星位于右边缘。视口截断与背向恒星的跟随目标会竞争，R 是软拉回范围。' },
} as const
export type Scenario = keyof typeof SCENARIOS
export interface Settings {
  scenario: Scenario
  fps: number
  gap: number
  range: number
  spread: number
  fitted: boolean
  expanded: number
}
export const DEFAULTS: Settings = {
  scenario: 'orbit', fps: 60, gap: 16, range: 70, spread: 8, fitted: true, expanded: -1,
}
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface Snapshot {
  time: number
  frame: number
  planets: [PBDInput, PBDInput, PBDInput]
  star: Point & { r: number; visible: boolean }
  labels: [PBDResult, PBDResult, PBDResult]
  targets: Point[]
  sizes: { width: number; height: number }[]
  metrics: { overlap: number; starGap: number; anchorExcess: number }
}

export function sizesFor(s: Settings) {
  return NAMES.map((_, i) => ({
    width: s.expanded === i ? 200 : s.fitted ? [30, 41, 53][i] : 60,
    height: s.expanded === i ? 44 : 36,
  }))
}

export function sceneAt(s: Settings, time: number) {
  const star = { x: 640, y: 385, r: 28, visible: true }
  const sizes = sizesFor(s)
  const planets = sizes.map((size, i) => {
    let x = star.x, y = star.y, visible = true
    if (s.scenario === 'orbit') {
      const angle = time * [0.25, -0.19, 0.14][i] + [0.8, 2.9, 4.9][i]
      x += Math.cos(angle) * [140, 235, 345][i]
      y += Math.sin(angle) * [90, 135, 175][i]
    } else if (s.scenario === 'crowded') {
      x = 730 + i * 15
    } else if (s.scenario === 'star') {
      x = 632; y = 377; visible = i === 0
    } else if (s.scenario === 'expanded') {
      x = 730; visible = i === 0
    } else {
      x = 1245; y = 270 + i * 70
    }
    return { sx: x, sy: y, pr: 8, visible, lw: size.width, lh: size.height }
  }) as Snapshot['planets']
  return { planets, star, sizes }
}

// 只计算展示用目标和诊断值，不另写求解器。
export function targetFor(p: PBDInput, star: Point, s: Settings, index: number): Point {
  const dx = p.sx - star.x, dy = p.sy - star.y
  const d = Math.hypot(dx, dy)
  const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1
  const a = (index - 1) * s.spread * Math.PI / 180
  return {
    x: p.sx + (nx * Math.cos(a) - ny * Math.sin(a)) * (p.pr + s.gap) - p.lw / 2,
    y: p.sy + (nx * Math.sin(a) + ny * Math.cos(a)) * (p.pr + s.gap) - p.lh / 2,
  }
}

export function overlapArea(a: Rect, b: Rect) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
}
export function rectCircleGap(rect: Rect, circle: Point & { r: number }) {
  return Math.hypot(
    Math.max(rect.x - circle.x, 0, circle.x - rect.x - rect.width),
    Math.max(rect.y - circle.y, 0, circle.y - rect.y - rect.height),
  ) - circle.r
}

function solve(s: Settings, frame: number): Snapshot {
  const time = frame / s.fps
  const { planets, star, sizes } = sceneAt(s, time)
  const labels = stepPBD(planets, star, {
    gap: s.gap, anchorRangeRadius: s.range, shadowAngleSpread: s.spread,
  }, 1 / s.fps, WORLD.width, WORLD.height, 60, 200, 36, 44, s.expanded,
  s.fitted ? [30, 41, 53] : undefined)
  const visible = labels.map((label, i) => ({ ...label, ...sizes[i], i }))
    .filter(label => planets[label.i].visible)
  let overlap = 0, anchorExcess = 0
  for (let i = 0; i < visible.length; i++) {
    const label = visible[i], p = planets[label.i]
    anchorExcess = Math.max(anchorExcess,
      Math.hypot(label.anchorL.x - p.sx, label.anchorL.y - p.sy) - s.range,
      Math.hypot(label.anchorR.x - p.sx, label.anchorR.y - p.sy) - s.range)
    for (let j = i + 1; j < visible.length; j++) overlap = Math.max(overlap, overlapArea(label, visible[j]))
  }
  return {
    time, frame, planets, star, labels, sizes,
    targets: planets.map((p, i) => targetFor(p, star, s, i)),
    metrics: { overlap, starGap: Math.min(...visible.map(rect => rectCircleGap(rect, star))), anchorExcess },
  }
}

/** 页面的唯一求解会话；模块级原引擎在 reset 时清空。不可与主页共用同一会话。 */
export class Experiment {
  private frame = 0
  settings: Settings
  constructor(settings: Settings) { this.settings = settings }
  reset(settings: Settings = this.settings) {
    this.settings = { ...settings }
    this.frame = 0
    resetPBD()
    // 与原引擎一致：激活时初始化到 target，再执行约束；不计作一个运动时间步。
    return solve(this.settings, 0)
  }
  step() { return solve(this.settings, ++this.frame) }
}

/** 顺序使用同一个原引擎，所有组均从 t=0 初始化；调用方随后重置交互会话。 */
export function compareRates(settings: Settings) {
  return [30, 60, 120].map(fps => {
    const experiment = new Experiment({ ...settings, fps })
    let result = experiment.reset()
    for (let i = 0; i < fps * 10; i++) result = experiment.step()
    return { fps, ...result.metrics }
  })
}
