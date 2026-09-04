import type { OrbitalRingConfig } from '../types'

export const GYRO_RINGS: readonly OrbitalRingConfig[] = [
  { radius: 7.8, inclination: 0.12, eccentricity: 0.15, speed: 0.02, phase: 0 },
  { radius: 9.4, inclination: 0.22, eccentricity: 0.30, speed: 0.04, phase: Math.PI / 3 },
  { radius: 11.0, inclination: 0.38, eccentricity: 0.50, speed: 0.06, phase: 2 * Math.PI / 3 },
]

export interface OrbitWorldPoint {
  x: number
  y: number
  z: number
}

export function getGyroOrbitWorldPoint(
  config: OrbitalRingConfig,
  angle: number,
  center: OrbitWorldPoint,
): OrbitWorldPoint {
  const innerRadius = config.innerRadius ?? config.radius - 0.04
  const lineRadius = (innerRadius + config.radius) * 0.5
  const stretchX = 1 / Math.sqrt(1 - config.eccentricity * config.eccentricity)
  const localX = Math.cos(angle) * lineRadius * stretchX
  const localY = Math.sin(angle) * lineRadius
  const tilt = Math.PI / 2 - config.inclination
  const tiltedY = localY * Math.cos(tilt)
  const tiltedZ = localY * Math.sin(tilt)
  const cosPhase = Math.cos(config.phase)
  const sinPhase = Math.sin(config.phase)

  return {
    x: center.x + localX * cosPhase + tiltedZ * sinPhase,
    y: center.y + tiltedY,
    z: center.z - localX * sinPhase + tiltedZ * cosPhase,
  }
}
