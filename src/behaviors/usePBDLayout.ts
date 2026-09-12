/**
 * usePBDLayout — 屏幕空间动态标签布局，PBD 风格的混合求解器。
 *
 * ## 解决的问题
 *
 *   从上一帧的位置、速度和目标历史出发，跟随行星并处理避让偏好。
 *   本实现混用速度增量与位置投影，不保证所有几何约束同时满足。
 *
 * ## 架构
 *
 *   阶段 1 — 目标、速度前馈与位置反馈、阻尼限速、位置积分
 *     计算 label 在当前帧的目标位置（shadow 方向 + 相位偏移），通过
 *     target 速度前馈主动匹配行星运动，再叠加上位置修正弹簧力。
 *     直接更新 body 的速度与位置。
 *
 *   阶段 2 — 约束投影（迭代 SOLVER_ITERS 次）
 *     六类约束：A/A2/E 改速度，B/C/D 改位置；每轮使用完整 dt。
 *        A. 锚点向心   — anchors 超出 anchorRangeRadius 时施加向行星的拉力
 *        A2.近距离排斥 — label 中心侵入行星边缘外 10px 区域时排斥
 *        B. 行星遮挡   — label 中心不得进入任意行星视觉圆（位置投影）
 *        C. 恒星遮挡   — label 中心不得进入中央恒星光晕圆（位置投影）
 *        D. 视口约束   — 硬截断到视口内
 *        E. 标签互斥   — 加速度排斥（线性于穿透深度）+ 动量传递（弹性碰撞）
 *
 *   阶段 3 — 输出位置和锚点
 *     不再积分，也不依据位置投影重建速度。A/A2/E 的速度带入下一帧。
 *
 *   完整公式、执行细节与 SVG 实验：docs/actors/pbd-layout-formal.md。
 *
 * ## 外部依赖
 *
 *   消费方：useFloatingLabels（React hook，rAF 循环驱动）
 *   数据源：anchor.planet.*.screen, anchor.planet.*.screenRadius, anchor.centralStar.screen
 *
 * ## 参考
 *
 *   - Müller et al. (2007) "Position Based Dynamics"
 *   - Reynolds (1999) "Steering Behaviors for Autonomous Characters"
 *   - 控制理论中的 PD 控制（速度前馈 + 比例修正）
 */

// ============================================================
// 物理常量
//
// 所有可调参数集中在此。数值选择原则：
//   - 时间单位：秒（dt ≈ 0.016s @ 60fps）
//   - 长度单位：像素
//   - 加速度单位：px/s²
// ============================================================

/** 数值零阈值，防止除零错误 */
const EPSILON = 0.001

// -- 运动控制 -------------------------------------------------

/**
 * 位置修正刚度（比例增益）。
 *
 * 作用：缩小 label 当前位置与 shadow target 之间的静态偏差。
 * 原理：desiredVelocity = targetVelocity + K_CORRECT × (target − current)
 *       K_CORRECT 越大，标签贴 target 越紧，但过大可能引起过冲。
 *
 * 值 2.5 意味着距离 target 每 1px，产生 2.5 px/s 的修正速度。
 */
const K_CORRECT = 2.5

/**
 * 速度匹配强度。
 *
 * 作用：控制 label 速度多快收敛到 desiredVelocity。
 * 原理：v += (desiredV − v) × VEL_MATCH  （指数平滑）
 *       VEL_MATCH=1 立即跳变，=0 不响应。越接近 1 跟随越积极。
 *
 * 值 0.65 意味着每帧 (≈16ms) 缩小 65% 的速度差，
 * 约 2-3 帧 (30-50ms) 内匹配 target 速度。
 */
const VEL_MATCH = 0.65

/**
 * 速度阻尼（每帧保留的速度比例）。
 *
 * 作用：耗散动能，防止无界振荡。
 * 原理：v *= DAMPING
 *       此步骤每帧衰减 8%；系数不按 dt 换算，不保证跨帧率等价或无振荡。
 */
const DAMPING = 0.92

/**
 * 约束求解器迭代次数。
 *
 * 每次迭代顺序执行所有约束。增加次数也增加 A/A2/E 的速度累计量，
 * 因此不只是精度变化；五轮不是五个 dt/5 子步。
 */
const SOLVER_ITERS = 5

/** 阶段 1 的速度模长上限（px/s），不限制后续的位置投影 */
const MAX_SPEED = 800

/** E 中已乘 dt 的速度增量幅值上限（px/s）；沿用原变量名 */
const MAX_ACCEL = 200

// -- 锚点约束 -------------------------------------------------

/**
 * 锚点向心力刚度。
 *
 * 作用：label 的左右侧边中点离开 anchorRangeRadius 时，
 *       施加指向行星中心的加速度，线性于越出深度。
 * 计算：deltaVelocity = exceedance(px) × ANCHOR_STIFFNESS × dt
 *       exceedance = max(0, dist(anchor, planetCenter) − anchorRangeRadius)
 *
 * 值 20 意味着越出 10px、dt=0.016 时，本轮速度增量为 3.2 px/s。
 * 相对分离刚度的大小影响约束竞争，但单靠调参不保证有可行布局。
 */
const ANCHOR_STIFFNESS = 20

// -- 近距离排斥 -----------------------------------------------

/**
 * 近距离排斥区宽度（超出 planet 视觉边缘的额外 px）。
 *
 * 作用：label 中心距行星表面 ≤ CLOSE_REPEL_MARGIN 时触发排斥力。
 *       label 会被轻柔推出此区域，形成行星与标签之间的最小呼吸间距。
 *
 * 调试可见：灰白色虚线圆（半径 = planetScreenRadius + 10px）。
 */
const CLOSE_REPEL_MARGIN = 10

/**
 * 近距离排斥力刚度。
 *
 * 计算：deltaVelocity = penetration(px) × CLOSE_REPEL_STIFFNESS × dt
 *       penetration = (planetScreenRadius + CLOSE_REPEL_MARGIN) − dist(labelCenter, planetCenter)
 *
 * 值 400 高于 ANCHOR_STIFFNESS (20)，确保排斥力 > 向心力。
 * target 是否处于排斥区外取决于 gap；也可由碰撞挤压触发。
 */
const CLOSE_REPEL_STIFFNESS = 400

// -- 标签间分离 -----------------------------------------------

/**
 * 分离力刚度。
 *
 * 作用：两标签重叠时，沿最小渗透轴施加排斥加速度，线性于穿透深度。
 * 计算：deltaVelocity = penetration × SEPARATION_STIFFNESS × dt
 *
 * 值 180、重叠 10px、dt=0.016 时，本轮增量幅值为 28.8 px/s，两者各分一半。
 * 与 ANCHOR_STIFFNESS 的比值 (180:20 = 9:1) 决定了碰撞时
 * 推开力 vs 回正力的竞争关系。
 */
const SEPARATION_STIFFNESS = 180

/**
 * 分离弹性（动量传递比例）。
 *
 * 作用：两标签相互接近时（相对速度 < 0），沿碰撞法向交换速度。
 * 原理：impulse = relativeVelocity × SEPARATION_RESTITUTION × 0.5
 *       各承担一半冲量，模拟非完全弹性碰撞。
 *
 * 值 0.4 产生温和的"弹开"效果，标签碰撞后不会立即回弹而是减速分离。
 */
const SEPARATION_RESTITUTION = 0.4

/**
 * 分离最小重叠阈值（迟滞）。
 *
 * 作用：重叠 ≤ 此值不触发分离，防止接近边界时高频抖动。
 * 这是按轴判断的触发阈值，不保证最终穿透深度小于 2px。
 */
const SEPARATION_THRESHOLD = 2

// -- 其他约束 -------------------------------------------------

/** 视口边距（px），标签矩形必须完全在距视口边缘此值之内 */
const VP_MARGIN = 12

/** 约束 B 的中心距离近似中，额外加在行星半径上的边距（px） */
export const PLANET_AVOID_MARGIN = 4

/** 约束 C（恒星遮挡）的固定安全边距（px），不叠加 label 半宽 */
const STAR_AVOID_MARGIN = 8

/** 速度平分系数（两 label 同权） */
const HALF = 0.5

// ============================================================
// 类型
// ============================================================

/**
 * 单行星布局输入。
 * sx, sy: 行星屏幕投影中心
 * pr: 行星屏幕视觉半径
 * visible: 行星当前是否在视口内
 * lw, lh: 调用方传入的矩形宽高；当前求解器实际使用独立的宽高参数
 */
export interface PBDInput {
  sx: number; sy: number; pr: number
  visible: boolean
  lw: number; lh: number
}

/** 单标签布局输出，含定位和调试用的锚点坐标 */
export interface PBDResult {
  x: number; y: number
  anchorL: { x: number; y: number }
  anchorR: { x: number; y: number }
}

/**
 * PBD 可调参数（均通过 App.tsx 的 pbdParams prop 传入）。
 * 不传则使用默认值。
 */
export interface PBDParams {
  /** 锚点范围半径（px），默认 90 */
  anchorRangeRadius?: number
  /** 目标中心相对行星视觉半径的额外偏移（px），默认 6；不保证矩形边缘间隙 */
  gap?: number
  /** 各 label 的 shadow 方向偏移角（°），[label0, label1, label2]，默认 8 */
  shadowAngleSpread?: number
}

// ============================================================
// 状态（模块级，跨帧保持）
// ============================================================

interface Body {
  x: number; y: number
  vx: number; vy: number
  active: boolean
}

const _bodies: Body[] = [
  { x: 0, y: 0, vx: 0, vy: 0, active: false },
  { x: 0, y: 0, vx: 0, vy: 0, active: false },
  { x: 0, y: 0, vx: 0, vy: 0, active: false },
]

/** 上一帧各 label 的 shadow target 位置，用于计算 target 运动速度 */
const _prevTarget: { x: number; y: number; valid: boolean }[] = [
  { x: 0, y: 0, valid: false },
  { x: 0, y: 0, valid: false },
  { x: 0, y: 0, valid: false },
]

// ============================================================
// 辅助函数
// ============================================================

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

function clampToViewport(
  x: number, y: number, w: number, h: number, vpW: number, vpH: number,
): { x: number; y: number } {
  return {
    x: Math.max(VP_MARGIN, Math.min(vpW - w - VP_MARGIN, x)),
    y: Math.max(VP_MARGIN, Math.min(vpH - h - VP_MARGIN, y)),
  }
}

/** 将点 pushOut 推离圆心（用于恒星遮挡约束） */
function pushOutOfCircle(
  px: number, py: number, cx: number, cy: number, r: number,
): { x: number; y: number } {
  const d = dist(px, py, cx, cy)
  if (d >= r || d < EPSILON) return { x: px, y: py }
  const nx = (px - cx) / d
  const ny = (py - cy) / d
  return { x: cx + nx * r, y: cy + ny * r }
}

// ============================================================
// 主函数
// ============================================================

/**
 * PBD 物理步进（每帧由 rAF 循环调用）。
 *
 * ## 计算流程
 *
 *   Stage 1 — 预测
 *     对每个可见 label：
 *       1. 计算 shadow target = 行星位置 + 背向恒星的方向 × (pr + gap)
 *          + per-label 相位偏移 ([-spread°, 0°, +spread°])
 *       2. 计算 target 速度 = (target_now − target_prev) / dt（前馈）
 *       3. 合成 desiredVelocity = targetVelocity + K_CORRECT × (target − current)
 *       4. 指数平滑 v → desiredVelocity，施加阻尼，积分位置
 *
 *   Stage 2 — 约束（迭代 SOLVER_ITERS 次）
 *     顺序执行 A → A2 → B → C → D → E（后执行的约束可部分修正前约束）
 *
 *   Stage 3 — 输出
 *     从 body 状态生成 PBDResult[]
 *
 * @returns 3 个 label 的屏幕坐标和锚点
 */
export function stepPBD(
  inputs: [PBDInput, PBDInput, PBDInput],
  centralStar: { x: number; y: number; r: number; visible: boolean },
  p: PBDParams,
  dt: number,
  vpW: number, vpH: number,
  collapsedW: number, expandedW: number,
  collapsedH: number, expandedH: number,
  activeTrackIdx: number,
  /** per-label 折叠态实际宽度（px），未提供则统一使用 collapsedW */
  collapsedWidths?: [number, number, number],
): [PBDResult, PBDResult, PBDResult] {
  const R = p.anchorRangeRadius ?? 90
  const gap = p.gap ?? 6
  const spreadRad = (p.shadowAngleSpread ?? 8) * (Math.PI / 180)
  const dtClamped = Math.min(dt, 0.1)
  // 每个 label 的有效折叠宽度（优先使用传入的 per-label 值）
  const _cw = collapsedWidths ?? [collapsedW, collapsedW, collapsedW]

  // ==========================================================
  // Stage 1: 预测 — 速度前馈 + 位置修正
  // ==========================================================

  for (let i = 0; i < 3; i++) {
    const b = _bodies[i]
    const inp = inputs[i]
    const w = activeTrackIdx === i ? expandedW : _cw[i]
    const h = activeTrackIdx === i ? expandedH : collapsedH

    // 不可见 → 失活
    if (!inp.visible) {
      b.active = false; b.vx = 0; b.vy = 0
      continue
    }

    // ---- 计算 shadow 方向 target 位置 ----

    const sdx = inp.sx - centralStar.x
    const sdy = inp.sy - centralStar.y
    const starDist = Math.hypot(sdx, sdy)
    // 恒星与行星重合时 fallback 向上（sny = -1 指向屏幕上方）
    const snx = starDist > EPSILON ? sdx / starDist : 0
    const sny = starDist > EPSILON ? sdy / starDist : -1

    // 相位偏移：label 0=−spread, label 1=0, label 2=+spread（天然分散）
    const phaseShift = (i - 1) * spreadRad
    const cosP = Math.cos(phaseShift), sinP = Math.sin(phaseShift)
    const rnx = snx * cosP - sny * sinP   // 2D 旋转
    const rny = snx * sinP + sny * cosP

    const offset = inp.pr + gap
    const tx = inp.sx + rnx * offset - w * HALF
    const ty = inp.sy + rny * offset - h * HALF

    // 首次激活 → 直接跳到 target，避免从 (0,0) 过渡
    if (!b.active) {
      b.x = tx; b.y = ty; b.vx = 0; b.vy = 0
      b.active = true
      _prevTarget[i] = { x: tx, y: ty, valid: true }
      continue
    }

    // ---- 速度前馈：跟踪 target 运动 ----

    const pt = _prevTarget[i]
    let tvx = 0, tvy = 0
    if (pt.valid && dtClamped > EPSILON) {
      tvx = (tx - pt.x) / dtClamped
      tvy = (ty - pt.y) / dtClamped
    }
    pt.x = tx; pt.y = ty; pt.valid = true

    // 合成期望速度：前馈（匹配 target 运动）+ 反馈（修正位置偏差）
    const desiredVx = tvx + K_CORRECT * (tx - b.x)
    const desiredVy = tvy + K_CORRECT * (ty - b.y)
    // 指数平滑收敛到期望速度
    b.vx += (desiredVx - b.vx) * VEL_MATCH
    b.vy += (desiredVy - b.vy) * VEL_MATCH
    b.vx *= DAMPING
    b.vy *= DAMPING

    // 速度上限
    const speed = Math.hypot(b.vx, b.vy)
    if (speed > MAX_SPEED) {
      b.vx = (b.vx / speed) * MAX_SPEED
      b.vy = (b.vy / speed) * MAX_SPEED
    }

    b.x += b.vx * dtClamped
    b.y += b.vy * dtClamped
  }

  // ==========================================================
  // Stage 2: 约束投影（迭代）
  // ==========================================================

  for (let iter = 0; iter < SOLVER_ITERS; iter++) {
    // ---- 单标签约束（A, A2, B, C, D） ----
    for (let i = 0; i < 3; i++) {
      const b = _bodies[i]
      const inp = inputs[i]
      if (!b.active || !inp.visible) continue
      const w = activeTrackIdx === i ? expandedW : _cw[i]
      const h = activeTrackIdx === i ? expandedH : collapsedH
      const w2 = w * HALF, h2 = h * HALF
      const cx = b.x + w2, cy = b.y + h2

      // ---- A: 锚点向心加速度 ----
      // 左右侧边中点分别计算越出量，取最大者驱动
      const aLx = b.x, aLy = cy
      const aRx = b.x + w, aRy = cy
      const overL = dist(aLx, aLy, inp.sx, inp.sy) - R
      const overR = dist(aRx, aRy, inp.sx, inp.sy) - R
      const exceedMax = Math.max(overL, overR, 0)

      if (exceedMax > 0) {
        const cd = dist(cx, cy, inp.sx, inp.sy)
        if (cd > EPSILON) {
          const nx = (inp.sx - cx) / cd  // 指向行星中心
          const ny = (inp.sy - cy) / cd
          // 速度增量 = 越出深度 × 刚度 × 时间步长
          const accel = exceedMax * ANCHOR_STIFFNESS * dtClamped
          b.vx += nx * accel
          b.vy += ny * accel
        }
      }

      // ---- A2: 近距离排斥 ----
      // 对侵入行星边缘外 10px 区域的 label 中心施加排斥速度增量
      {
        const dToPlanet = dist(cx, cy, inp.sx, inp.sy)
        const repelDist = inp.pr + CLOSE_REPEL_MARGIN
        if (dToPlanet < repelDist && dToPlanet > EPSILON) {
          const overlap = repelDist - dToPlanet
          const nx = (cx - inp.sx) / dToPlanet  // 背离行星
          const ny = (cy - inp.sy) / dToPlanet
          const accel = overlap * CLOSE_REPEL_STIFFNESS * dtClamped
          b.vx += nx * accel
          b.vy += ny * accel
        }
      }

      // ---- B: 标签不遮挡任意行星 ----
      for (let pj = 0; pj < 3; pj++) {
        const pjinp = inputs[pj]
        if (!pjinp.visible) continue
        const toPlanet = dist(cx, cy, pjinp.sx, pjinp.sy)
        const minDist = Math.max(w2, h2) + pjinp.pr + PLANET_AVOID_MARGIN
        if (toPlanet < minDist && toPlanet > EPSILON) {
          const nx = (cx - pjinp.sx) / toPlanet  // 背离行星
          const ny = (cy - pjinp.sy) / toPlanet
          const push = minDist - toPlanet
          b.x += nx * push
          b.y += ny * push
        }
      }

      // ---- C: 标签不遮挡中央恒星（固定安全边距，不依赖 label 尺寸） ----
      if (centralStar.visible) {
        const safeR = centralStar.r + STAR_AVOID_MARGIN
        const pushed = pushOutOfCircle(cx, cy, centralStar.x, centralStar.y, safeR)
        b.x += pushed.x - cx
        b.y += pushed.y - cy
      }

      // ---- D: 视口约束（硬截断） ----
      const clamped = clampToViewport(b.x, b.y, w, h, vpW, vpH)
      b.x = clamped.x; b.y = clamped.y
    }

    // ---- E: 标签间力驱动分离（加速度 + 动量传递） ----
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const bi = _bodies[i], bj = _bodies[j]
        if (!bi.active || !bj.active) continue
        const wi = activeTrackIdx === i ? expandedW : _cw[i]
        const hi = activeTrackIdx === i ? expandedH : collapsedH
        const wj = activeTrackIdx === j ? expandedW : _cw[j]
        const hj = activeTrackIdx === j ? expandedH : collapsedH

        // 计算重叠量
        const ox = Math.min(bi.x + wi, bj.x + wj) - Math.max(bi.x, bj.x)
        const oy = Math.min(bi.y + hi, bj.y + hj) - Math.max(bi.y, bj.y)
        if (ox <= SEPARATION_THRESHOLD || oy <= SEPARATION_THRESHOLD) continue

        // 沿最小渗透轴的碰撞法向
        let nx = 0, ny = 0
        if (ox < oy) { nx = bi.x < bj.x ? -1 : 1 }
        else         { ny = bi.y < bj.y ? -1 : 1 }

        const penetration = Math.min(ox, oy)
        const relV = (bi.vx - bj.vx) * nx + (bi.vy - bj.vy) * ny

        // 步骤 1: 排斥加速度（线性于穿透深度，有上限）
        const accel = Math.min(penetration * SEPARATION_STIFFNESS * dtClamped, MAX_ACCEL)
        bi.vx += nx * accel * HALF
        bi.vy += ny * accel * HALF
        bj.vx -= nx * accel * HALF
        bj.vy -= ny * accel * HALF

        // 步骤 2: 动量传递（仅当两标签相互接近时）
        //        交换部分相对速度，产生弹性"弹开"效果
        if (relV < 0) {
          const impulse = relV * SEPARATION_RESTITUTION * HALF
          bi.vx -= nx * impulse
          bi.vy -= ny * impulse
          bj.vx += nx * impulse
          bj.vy += ny * impulse
        }
      }
    }
  }

  // ==========================================================
  // Stage 3: 构建输出
  // ==========================================================

  const results: PBDResult[] = []
  for (let i = 0; i < 3; i++) {
    const b = _bodies[i]
    const inp = inputs[i]
    const w = activeTrackIdx === i ? expandedW : _cw[i]
    const h = activeTrackIdx === i ? expandedH : collapsedH
    if (!b.active || !inp.visible) {
      results.push({ x: 0, y: 0, anchorL: { x: 0, y: 0 }, anchorR: { x: 0, y: 0 } })
    } else {
      results.push({
        x: b.x, y: b.y,
        anchorL: { x: b.x, y: b.y + h * HALF },
        anchorR: { x: b.x + w, y: b.y + h * HALF },
      })
    }
  }
  return results as [PBDResult, PBDResult, PBDResult]
}

/** 重置 PBD 内部状态（供测试及行星失活时使用） */
export function resetPBD(): void {
  for (const b of _bodies) {
    b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.active = false
  }
  for (const pt of _prevTarget) {
    pt.x = 0; pt.y = 0; pt.valid = false
  }
}
