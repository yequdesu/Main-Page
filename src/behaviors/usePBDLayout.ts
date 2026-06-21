/**
 * usePBDLayout — Position-Based Dynamics 标签布局系统。
 *
 * 用物理模拟替代离散 CMLP 角度搜索。每帧从上一帧位置出发：
 *   1. 预测（惯性 + 向行星引力）
 *   2. 约束投影（迭代：锚点/遮挡/恒星/视口/互斥）
 *   3. 速度更新
 *
 * 状态（速度）跨帧保持 → 天然平滑连续。
 *
 * 援引：Müller et al. (2007) "Position Based Dynamics"
 */

import type { ScreenCoord } from '../stores/realtimeStore'

// ============================================================
// 参数
// ============================================================

/** 位置修正刚度 — 缩小与 target 的静态偏差，↑贴得更紧 */
const K_CORRECT = 3.0
/** 速度匹配强度 — 主动同步行星运动，↑更积极跟随 */
const VEL_MATCH = 0.65
/** 速度阻尼 */
const DAMPING = 0.92
/** 约束投影迭代次数 */
const SOLVER_ITERS = 5
/** 最大速度（px/s），防止飞远 */
const MAX_SPEED = 800
/** 分离力刚度（重叠时加速度），↑推开更果断 */
const SEPARATION_STIFFNESS = 120
/** 分离力阻尼（动量传递比例 0-1），↑碰撞更有弹性 */
const SEPARATION_RESTITUTION = 0.4
/** 分离力最小重叠阈值（px），低于此不触发 */
const SEPARATION_THRESHOLD = 2
/** 锚点向心力刚度 — 锚点越出 range 时的回正加速度。需 < 分离力，否则碰撞动量传递被淹没 */
const ANCHOR_STIFFNESS = 25
/** 近距离排斥区半径（超出 planet 视觉边缘的额外 px） */
const CLOSE_REPEL_MARGIN = 5
/** 近距离排斥力刚度 */
const CLOSE_REPEL_STIFFNESS = 150
/** 视口边距 */
const VP_MARGIN = 12

// ============================================================
// 类型
// ============================================================

export interface PBDInput {
  sx: number; sy: number; pr: number  // 行星屏幕坐标 + 视觉半径
  visible: boolean
  lw: number; lh: number              // 标签宽高
}

export interface PBDResult {
  x: number; y: number
  anchorL: { x: number; y: number }
  anchorR: { x: number; y: number }
}

export interface PBDParams {
  anchorRangeRadius?: number
  gap?: number
  /** 各 label 的 shadow 方向偏移角（°），[label0, label1, label2]，默认 8 */
  shadowAngleSpread?: number
}

// ============================================================
// 状态（模块级，跨帧保持）
// ============================================================

interface Body {
  x: number; y: number; vx: number; vy: number
  active: boolean
}

const _bodies: Body[] = [
  { x: 0, y: 0, vx: 0, vy: 0, active: false },
  { x: 0, y: 0, vx: 0, vy: 0, active: false },
  { x: 0, y: 0, vx: 0, vy: 0, active: false },
]

/** 上一帧各 label 的 target 位置（用于计算 target 速度） */
const _prevTarget: { x: number; y: number; valid: boolean }[] = [
  { x: 0, y: 0, valid: false },
  { x: 0, y: 0, valid: false },
  { x: 0, y: 0, valid: false },
]

// ============================================================
// 辅助
// ============================================================

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

function clampToViewport(x: number, y: number, w: number, h: number, vpW: number, vpH: number): { x: number; y: number } {
  return {
    x: Math.max(VP_MARGIN, Math.min(vpW - w - VP_MARGIN, x)),
    y: Math.max(VP_MARGIN, Math.min(vpH - h - VP_MARGIN, y)),
  }
}

/** 将点 p 推离圆心 c，使其不在半径 r 的圆内 */
function pushOutOfCircle(
  px: number, py: number, cx: number, cy: number, r: number,
): { x: number; y: number } {
  const d = dist(px, py, cx, cy)
  if (d >= r || d < 0.001) return { x: px, y: py }
  const nx = (px - cx) / d
  const ny = (py - cy) / d
  return { x: cx + nx * r, y: cy + ny * r }
}

/** 将点 p 拉入圆心 c 的半径 r 范围内 */
function pullIntoCircle(
  px: number, py: number, cx: number, cy: number, r: number,
): { x: number; y: number } {
  const d = dist(px, py, cx, cy)
  if (d <= r) return { x: px, y: py }
  const nx = (px - cx) / d
  const ny = (py - cy) / d
  return { x: cx + nx * r, y: cy + ny * r }
}

// ============================================================
// 主函数
// ============================================================

/**
 * PBD 步进：预测 → 约束投影 → 速度更新。
 *
 * @param inputs         — 3 个行星的屏幕坐标 + 半径
 * @param centralStar    — 中央恒星屏幕坐标 + 半径
 * @param p              — 可调参数
 * @param dt             — 时间步长（秒）
 * @param vpW, vpH       — 视口尺寸
 * @param collapsedW, expandedW — 标签宽度
 * @param collapsedH, expandedH — 标签高度
 * @param activeTrackIdx — 当前展开的标签索引（-1 = 全部紧凑）
 * @returns 3 个标签位置
 */
export function stepPBD(
  inputs: [PBDInput, PBDInput, PBDInput],
  centralStar: { x: number; y: number; r: number; visible: boolean },
  p: PBDParams,
  dt: number,
  vpW: number,
  vpH: number,
  collapsedW: number,
  expandedW: number,
  collapsedH: number,
  expandedH: number,
  activeTrackIdx: number,
): [PBDResult, PBDResult, PBDResult] {
  const R = p.anchorRangeRadius ?? 90
  const gap = p.gap ?? 6
  const dtClamped = Math.min(dt, 0.1)  // 防止大帧跳跃

  // ---- 阶段 1: 预测位置 ----
  for (let i = 0; i < 3; i++) {
    const b = _bodies[i]
    const inp = inputs[i]
    const w = activeTrackIdx === i ? expandedW : collapsedW
    const h = activeTrackIdx === i ? expandedH : collapsedH

    if (!inp.visible) {
      b.active = false; b.vx = 0; b.vy = 0
      continue
    }

    // 目标位置：行星背向恒星的 shadow 方向 + per-label 相位偏移
    const sdx = inp.sx - centralStar.x
    const sdy = inp.sy - centralStar.y
    const starDist = Math.hypot(sdx, sdy)
    const snx = starDist > 0.001 ? sdx / starDist : 0
    const sny = starDist > 0.001 ? sdy / starDist : -1
    const spread = (p.shadowAngleSpread ?? 8) * (Math.PI / 180)
    const phaseShift = (i - 1) * spread
    const cosP = Math.cos(phaseShift), sinP = Math.sin(phaseShift)
    const rnx = snx * cosP - sny * sinP
    const rny = snx * sinP + sny * cosP
    const offset = inp.pr + gap
    const tx = inp.sx + rnx * offset - w / 2
    const ty = inp.sy + rny * offset - h / 2

    // 初次激活：跳到 target 位置
    if (!b.active) {
      b.x = tx; b.y = ty; b.vx = 0; b.vy = 0
      b.active = true
      _prevTarget[i] = { x: tx, y: ty, valid: true }
      continue
    }

    // 速度前馈：主动匹配 target 的运动速度
    const pt = _prevTarget[i]
    let tvx = 0, tvy = 0
    if (pt.valid && dtClamped > 0.001) {
      tvx = (tx - pt.x) / dtClamped
      tvy = (ty - pt.y) / dtClamped
    }
    pt.x = tx; pt.y = ty; pt.valid = true

    // 合成速度：大部分跟随 target 运动 + 小部分修正位置差
    const dx = tx - b.x
    const dy = ty - b.y
    const desiredVx = tvx + K_CORRECT * dx
    const desiredVy = tvy + K_CORRECT * dy
    b.vx += (desiredVx - b.vx) * VEL_MATCH
    b.vy += (desiredVy - b.vy) * VEL_MATCH
    b.vx *= DAMPING
    b.vy *= DAMPING

    const speed = Math.hypot(b.vx, b.vy)
    if (speed > MAX_SPEED) {
      b.vx = (b.vx / speed) * MAX_SPEED
      b.vy = (b.vy / speed) * MAX_SPEED
    }

    b.x += b.vx * dtClamped
    b.y += b.vy * dtClamped
  }

  // ---- 阶段 2: 约束投影（迭代） ----
  for (let iter = 0; iter < SOLVER_ITERS; iter++) {
    for (let i = 0; i < 3; i++) {
      const b = _bodies[i]
      const inp = inputs[i]
      if (!b.active || !inp.visible) continue
      const w = activeTrackIdx === i ? expandedW : collapsedW
      const h = activeTrackIdx === i ? expandedH : collapsedH

      // 约束 A: 锚点越出 range → 向行星施加平滑向心加速度（替代硬拉回）
      const aLx = b.x
      const aLy = b.y + h / 2
      const aRx = b.x + w
      const aRy = b.y + h / 2
      const dL = dist(aLx, aLy, inp.sx, inp.sy)
      const dR = dist(aRx, aRy, inp.sx, inp.sy)
      // 每个锚点独立计算越出量（负值 = 在范围内，不触发）
      const overL = dL - R
      const overR = dR - R
      // 取最大越出量（更远的那个锚点决定拉力大小）
      const exceedMax = Math.max(overL, overR, 0)
      if (exceedMax > 0) {
        // 向行星方向施加加速度（线性于越出深度）
        const cx = b.x + w / 2
        const cy = b.y + h / 2
        const cd = dist(cx, cy, inp.sx, inp.sy)
        if (cd > 0.01) {
          const nx = (inp.sx - cx) / cd  // 指向行星中心
          const ny = (inp.sy - cy) / cd
          const accel = exceedMax * ANCHOR_STIFFNESS * dtClamped
          b.vx += nx * accel
          b.vy += ny * accel
        }
      }

      // 约束 A2: 标签中心不得侵入行星的近距离排斥区（5px 灰白圈）
      {
        const cx2 = b.x + w / 2
        const cy2 = b.y + h / 2
        const dToPlanet = dist(cx2, cy2, inp.sx, inp.sy)
        const repelDist = inp.pr + CLOSE_REPEL_MARGIN
        if (dToPlanet < repelDist && dToPlanet > 0.01) {
          const overlap = repelDist - dToPlanet
          const nx = (cx2 - inp.sx) / dToPlanet
          const ny = (cy2 - inp.sy) / dToPlanet
          const accel = overlap * CLOSE_REPEL_STIFFNESS * dtClamped
          b.vx += nx * accel
          b.vy += ny * accel
        }
      }

      // 约束 B: 标签不遮挡任意行星（包括非所属行星）
      const w2 = w / 2; const h2 = h / 2
      const cx = b.x + w2; const cy = b.y + h2
      for (let pj = 0; pj < 3; pj++) {
        const pjinp = inputs[pj]
        if (!pjinp.visible) continue
        const toPlanet = dist(cx, cy, pjinp.sx, pjinp.sy)
        const minDist = Math.max(w2, h2) + pjinp.pr + 2
        if (toPlanet < minDist && toPlanet > 0.01) {
          const nx = (cx - pjinp.sx) / toPlanet
          const ny = (cy - pjinp.sy) / toPlanet
          const push = minDist - toPlanet
          b.x += nx * push
          b.y += ny * push
        }
      }

      // 约束 C: 不遮挡中央恒星
      if (centralStar.visible) {
        const cs = centralStar
        const pushed = pushOutOfCircle(cx, cy, cs.x, cs.y, cs.r + Math.max(w2, h2) + 4)
        b.x += pushed.x - cx
        b.y += pushed.y - cy
      }

      // 约束 D: 视口约束
      const clamped = clampToViewport(b.x, b.y, w, h, vpW, vpH)
      b.x = clamped.x
      b.y = clamped.y
    }

    // 约束 E: 标签间加速度排斥 + 动量传递（替代硬位置修正）
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const bi = _bodies[i], bj = _bodies[j]
        if (!bi.active || !bj.active) continue
        const wi = activeTrackIdx === i ? expandedW : collapsedW
        const hi = activeTrackIdx === i ? expandedH : collapsedH
        const wj = activeTrackIdx === j ? expandedW : collapsedW
        const hj = activeTrackIdx === j ? expandedH : collapsedH

        // 计算重叠
        const aR = bi.x + wi, aB = bi.y + hi
        const bR = bj.x + wj, bB = bj.y + hj
        const ox = Math.min(aR, bR) - Math.max(bi.x, bj.x)
        const oy = Math.min(aB, bB) - Math.max(bi.y, bj.y)
        if (ox <= SEPARATION_THRESHOLD || oy <= SEPARATION_THRESHOLD) continue

        // 碰撞法向：沿最小渗透轴
        let nx = 0, ny = 0
        if (ox < oy) {
          nx = bi.x < bj.x ? -1 : 1
        } else {
          ny = bi.y < bj.y ? -1 : 1
        }
        const penetration = Math.min(ox, oy)

        // 沿法向的相对速度
        const relV = (bi.vx - bj.vx) * nx + (bi.vy - bj.vy) * ny

        // 排斥加速度（与穿透深度成正比）
        const accel = Math.min(penetration * SEPARATION_STIFFNESS * dtClamped, 200)
        bi.vx += nx * accel * 0.5
        bi.vy += ny * accel * 0.5
        bj.vx -= nx * accel * 0.5
        bj.vy -= ny * accel * 0.5

        // 动量传递：沿法向交换部分相对速度（碰撞弹性）
        if (relV < 0) {
          const impulse = relV * SEPARATION_RESTITUTION * 0.5
          bi.vx -= nx * impulse
          bi.vy -= ny * impulse
          bj.vx += nx * impulse
          bj.vy += ny * impulse
        }
      }
    }
  }

  // ---- 阶段 3: 构建结果 ----
  const results: PBDResult[] = []
  for (let i = 0; i < 3; i++) {
    const b = _bodies[i]
    const inp = inputs[i]
    const w = activeTrackIdx === i ? expandedW : collapsedW
    const h = activeTrackIdx === i ? expandedH : collapsedH
    if (!b.active || !inp.visible) {
      results.push({ x: 0, y: 0, anchorL: { x: 0, y: 0 }, anchorR: { x: 0, y: 0 } })
    } else {
      results.push({
        x: b.x, y: b.y,
        anchorL: { x: b.x, y: b.y + h / 2 },
        anchorR: { x: b.x + w, y: b.y + h / 2 },
      })
    }
  }
  return results as [PBDResult, PBDResult, PBDResult]
}

/** 重置 PBD 内部状态（供测试使用） */
export function resetPBD(): void {
  for (const b of _bodies) {
    b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.active = false
  }
  for (const pt of _prevTarget) {
    pt.x = 0; pt.y = 0; pt.valid = false
  }
}
