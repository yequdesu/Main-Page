/**
 * useAnchorAvoidance — 行星标签锚点避让算法。
 *
 * 输入 3 个行星的屏幕投影坐标，输出 3 个 Pill 的无碰撞屏幕位置。
 * 自内向外（trackIdx: 0→1→2）解析碰撞，外圈 pill 沿候选方向滑动。
 *
 * 援引：碰撞检测 — AABB 矩形重叠检测（游戏开发标准方法）
 */

export interface AnchorInput {
  /** 行星屏幕中心 X */
  screenX: number
  /** 行星屏幕中心 Y */
  screenY: number
  visible: boolean
  trackIdx: number
  /** 此标签是否处于展开模式（宽度更大） */
  expanded?: boolean
}

export interface AnchorResult {
  x: number
  y: number
  /** 标签是否处于展开模式 */
  expanded: boolean
}

interface Viewport {
  width: number
  height: number
}

/** Pill 估算高度（2 行 × 1.6em × fontSize 0.62rem + padding） */
const PILL_HEIGHT = 60
/** 默认锚点偏移（行星中心上方距离） */
const DEFAULT_OFFSET_Y = -35
/** 视口 margin */
const VP_MARGIN = 12
/** 碰撞容差 */
const COLLISION_TOLERANCE = 10
/** 候选滑动方向优先级 */
const CANDIDATE_DIRECTIONS: [number, number][] = [
  [0, -1],  // 上
  [0, 1],   // 下
  [1, 0],   // 右
  [-1, 0],  // 左
]
/** 每次滑动步长（px） */
const SLIDE_STEP = 68
/** 最大滑动步数 */
const MAX_SLIDES = 3

function pillRect(x: number, y: number, width: number): { left: number; right: number; top: number; bottom: number } {
  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + PILL_HEIGHT,
  }
}

export function overlaps(a: ReturnType<typeof pillRect>, b: ReturnType<typeof pillRect>): boolean {
  return (
    a.left < b.right + COLLISION_TOLERANCE &&
    a.right > b.left - COLLISION_TOLERANCE &&
    a.top < b.bottom + COLLISION_TOLERANCE &&
    a.bottom > b.top - COLLISION_TOLERANCE
  )
}

export function pillRectsOverlap(
  ax: number, ay: number, aw: number,
  bx: number, by: number, bw: number,
): boolean {
  return overlaps(pillRect(ax, ay, aw), pillRect(bx, by, bw))
}

function clampToViewport(x: number, y: number, width: number, vp: Viewport): { x: number; y: number } {
  return {
    x: Math.max(VP_MARGIN, Math.min(vp.width - width - VP_MARGIN, x)),
    y: Math.max(VP_MARGIN, Math.min(vp.height - PILL_HEIGHT - VP_MARGIN, y)),
  }
}

/**
 * 计算 3 个 Pill 的无碰撞屏幕位置。
 *
 * @param inputs       — 3 个行星的投影坐标
 * @param viewport     — 当前视口尺寸
 * @param collapsedW   — 紧凑模式 Pill 宽度
 * @param expandedW    — 展开模式 Pill 宽度
 * @returns 3 个 AnchorResult（按 trackIdx 索引）
 */
export function calcAnchorPositions(
  inputs: [AnchorInput, AnchorInput, AnchorInput],
  viewport: Viewport,
  collapsedW: number,
  expandedW: number,
): [AnchorResult, AnchorResult, AnchorResult] {
  // 初始位置：行星中心 + 正上方偏移
  const results: (AnchorResult & { _width: number })[] = inputs.map((inp, i) => {
    const w = inp.expanded ? expandedW : collapsedW
    return {
      x: inp.screenX - w / 2,
      y: inp.screenY + DEFAULT_OFFSET_Y - PILL_HEIGHT / 2,
      expanded: inp.expanded ?? false,
      _width: w,
    }
  })

  // 不可见的标签不参与避让
  const active = inputs.map((inp) => inp.visible)

  // 自内向外解析碰撞（trackIdx 0 优先级最高）
  const resolveOrder = [0, 1, 2]

  for (let tries = 0; tries < MAX_SLIDES; tries++) {
    let hasCollision = false

    for (const i of resolveOrder) {
      if (!active[i]) continue
      for (const j of resolveOrder) {
        if (i >= j || !active[j]) continue
        const ri = results[i], rj = results[j]
        if (overlaps(pillRect(ri.x, ri.y, ri._width), pillRect(rj.x, rj.y, rj._width))) {
          hasCollision = true
          // 将外圈（trackIdx 更大）的 pill 沿候选方向滑动
          const outer = i > j ? i : j
          const dirIdx = tries % CANDIDATE_DIRECTIONS.length
          const [dx, dy] = CANDIDATE_DIRECTIONS[dirIdx]
          results[outer].x += dx * SLIDE_STEP
          results[outer].y += dy * SLIDE_STEP
        }
      }
    }

    if (!hasCollision) break
  }

  // 最终检查：若外圈 pill 仍有碰撞，推到视口角落
  for (const i of resolveOrder) {
    if (!active[i]) continue
    for (const j of resolveOrder) {
      if (i >= j || !active[j]) continue
      if (overlaps(pillRect(results[i].x, results[i].y, results[i]._width), pillRect(results[j].x, results[j].y, results[j]._width))) {
        // fallback：外圈 pill 推到视口底部排列
        const outer = i > j ? i : j
        results[outer].x = VP_MARGIN + outer * (collapsedW + 8)
        results[outer].y = viewport.height - PILL_HEIGHT - VP_MARGIN
      }
    }
  }

  // 视口约束 + 不可见归零
  for (let i = 0; i < 3; i++) {
    if (!active[i]) {
      results[i].x = 0
      results[i].y = 0
      continue
    }
    const clamped = clampToViewport(results[i].x, results[i].y, results[i]._width, viewport)
    results[i].x = clamped.x
    results[i].y = clamped.y
  }

  return results.map(r => ({ x: r.x, y: r.y, expanded: r.expanded })) as [AnchorResult, AnchorResult, AnchorResult]
}
