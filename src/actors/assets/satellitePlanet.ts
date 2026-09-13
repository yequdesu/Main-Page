import { Mesh, MeshStandardMaterial, SphereGeometry, type Texture } from 'three'
import { createPlanetAsset, PLANET_BASE_RADIUS } from './planet'

/** 尺寸相对于行星核心半径，周期按调用方动画时钟的秒数计。 */
export const SATELLITE = {
  radius: 0.28,
  orbitRadius: 2.5,
  period: 12,
  inclinationDegrees: 0,
  initialPhase: Math.PI / 6,
  color: '#8e9fbd',
} as const

/** 一颗行星与一颗天然卫星；仅包含视觉与圆轨道运动，不读取主页状态。 */
export function createSatellitePlanetAsset(trackIdx: number, haloTexture: Texture) {
  const planet = createPlanetAsset(trackIdx, haloTexture)
  const geometry = new SphereGeometry(PLANET_BASE_RADIUS * SATELLITE.radius, 32, 24)
  const material = new MeshStandardMaterial({
    color: SATELLITE.color, roughness: 0.95, metalness: 0,
    transparent: true, opacity: 0, depthWrite: false, depthTest: true,
  })
  const moon = new Mesh(geometry, material)
  moon.name = `卫星_${trackIdx}`
  moon.renderOrder = 1
  planet.root.add(moon)
  planet.root.name = `带卫星行星 ${trackIdx + 1}`
  const inclination = SATELLITE.inclinationDegrees * Math.PI / 180
  const cosTilt = Math.cos(inclination), sinTilt = Math.sin(inclination)

  return {
    ...planet, moon,
    visualRadiusScale: Math.max(planet.visualRadiusScale, SATELLITE.orbitRadius + SATELLITE.radius),
    updateAppearance(time: number, phase: number, scale: number, opacity: number, glowFactor: number, haloScale: number) {
      planet.updateAppearance(time, phase, scale, opacity, glowFactor, haloScale)
      // 绝对时间求位置：暂停、变速、停止归零及多视口不会累计出不同相位。
      const angle = (time % SATELLITE.period) / SATELLITE.period * Math.PI * 2 + SATELLITE.initialPhase
      const radius = PLANET_BASE_RADIUS * scale * SATELLITE.orbitRadius
      const x = radius * Math.cos(angle)
      moon.position.set(x * cosTilt, -x * sinTilt, radius * Math.sin(angle)).add(planet.core.position)
      moon.scale.setScalar(scale)
      material.opacity = opacity
      material.depthWrite = opacity > 0
    },
    dispose() {
      planet.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
