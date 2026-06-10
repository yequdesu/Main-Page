import { Vector3 } from 'three'
import type { ParticleData } from '../types'

// Pre-allocated
const _orbitOut = new Vector3()

/**
 * 计算单个粒子在当前帧的轨道位置。
 *
 * 原 animateDust():633-771 中 per-particle 位置计算逻辑，逐字保留。
 * 纯函数 — 无 Three.js 场景依赖，可直接单测。
 *
 * @param d        粒子数据
 * @param time     当前时钟时间
 * @param delta    帧间隔
 * @param cx,cy,cz 轨道中心（中央恒星位置）
 * @param smooth3  Act 3 过渡进度 [0,1]
 * @returns 世界坐标位置
 */
export function calcOrbitPosition(
  d: ParticleData,
  time: number,
  delta: number,
  cx: number, cy: number, cz: number,
  smooth3: number,
): { x: number; y: number; z: number } {
  // Act 1 float position
  const bx = d.wx + Math.sin(time * 0.4 + d.ph) * 0.25
  const by = d.wy + Math.sin(time * 0.3 + d.ph + 1) * 0.18
  const bz = d.wz + Math.sin(time * 0.25 + d.ph + 2) * 0.15

  // Act 3 orbit
  const effectiveSpeed = d._baseSpeed * (1.0 - d.hoverFactor * 0.80)
  d.orbitAngle += delta * effectiveSpeed
  const wobbleR = d.isMainPlanet
    ? d.orbitR
    : d.orbitR + Math.sin(time * (d.wobbleFreq ?? 0.3) + d.ph) * (d.wobbleAmp ?? 1)
  const ox = cx + Math.cos(d.orbitAngle) * wobbleR
  const oz = cz + Math.sin(d.orbitAngle) * wobbleR

  // Blend
  return {
    x: bx + (ox - bx) * smooth3,
    y: by + (cy - by) * smooth3,
    z: bz + (oz - bz) * smooth3,
  }
}
