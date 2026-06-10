import { Vector3, type PerspectiveCamera } from 'three'

// Pre-allocated
const _ndcPos = new Vector3()

/**
 * 屏幕空间悬停检测 — 将世界坐标投影到 NDC，检测是否接近鼠标位置。
 *
 * 原 animateDust() 中 hover 检测逻辑。
 * 手动 NDC 投影（非 Raycaster），迟滞阈值 0.16 进 / 0.22 出。
 *
 * 援引：NDC 投影模式（CUSTOMER-1 规范），迟滞阈值（编辑器偏好）
 */

const HOVER_ENTER = 0.16
const HOVER_EXIT = 0.22

interface HoverState {
  currentIdx: number
  hovering: boolean
}

/**
 * 纯函数：计算屏幕空间悬停索引。
 *
 * @param camera         透视相机
 * @param positions      行星世界坐标数组
 * @param mouseNDC       鼠标 NDC 坐标 {x, y}
 * @param currentState   当前悬停状态（用于迟滞）
 * @param act3Progress   Act 3 进度 [0,1]，< 0.95 时悬停不生效
 * @returns 更新后的悬停状态
 */
export function calcScreenSpaceHover(
  camera: PerspectiveCamera,
  positions: (Vector3 | null)[],
  mouseNDC: { x: number; y: number },
  currentState: HoverState,
  act3Progress: number,
): HoverState {
  if (act3Progress < 0.95) {
    return { currentIdx: -1, hovering: false }
  }

  let bestIdx = -1
  let bestDist = Infinity

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    if (!pos) continue

    _ndcPos.copy(pos).project(camera)
    const dx = _ndcPos.x - mouseNDC.x
    const dy = _ndcPos.y - mouseNDC.y
    const dist = Math.hypot(dx, dy)

    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  // Hysteresis
  const wasHovering = currentState.hovering
  const threshold = wasHovering ? HOVER_EXIT : HOVER_ENTER

  if (bestDist < threshold) {
    return { currentIdx: bestIdx, hovering: true }
  }

  if (wasHovering && bestDist < HOVER_EXIT) {
    return { currentIdx: currentState.currentIdx, hovering: true }
  }

  return { currentIdx: -1, hovering: false }
}
