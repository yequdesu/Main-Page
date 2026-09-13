import { Vector3 } from 'three'
import type { OrbitalRingConfig } from '../types'

export const VOYAGER_ORBIT = { period: 90, phase: Math.PI / 2, size: 0.4125 } as const

/** 外层进动组的局部坐标：直接烘入椭圆拉伸与倾角，模型本身保持等比缩放。 */
export function sampleVoyagerOrbit(config: OrbitalRingConfig, angle: number, position: Vector3, tangent: Vector3) {
  const a = config.radius / Math.sqrt(1 - config.eccentricity ** 2)
  const b = config.radius
  const sinI = Math.sin(config.inclination), cosI = Math.cos(config.inclination)
  const cos = Math.cos(angle), sin = Math.sin(angle)
  position.set(a * cos, b * sin * sinI, b * sin * cosI)
  // 参数角递减，与内层行星的公转方向相同；切线用作姿态滚转参考。
  tangent.set(a * sin, -b * cos * sinI, -b * cos * cosI).normalize()
}
