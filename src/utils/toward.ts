/**
 * target-lerp 统一工具
 * current += (target - current) * rate
 * 援引：Three.js 社区 Target-Lerp 模式（帧率无关平滑过渡）
 */
export function toward(current: number, target: number, rate: number): number {
  return current + (target - current) * rate
}
