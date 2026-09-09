import { Mesh, MeshStandardMaterial, TorusGeometry, type Texture } from 'three'
import { createPlanetAsset, PLANET_BASE_RADIUS } from './planet'

// 比例均相对于行星核心半径；先压扁 Torus 的局部 Z 轴，再放到倾斜的赤道面。
export const PLANET_RING = {
  // 原环带的外缘仍为 1.98r，内侧让出细环与窄间隙。
  radius: 1.81,
  tube: 0.17,
  thicknessScale: 0.06,
  color: '#d6b987',
  opacity: 0.5,
  tiltDegrees: 26.7,
  radialSegments: 24,
  tubularSegments: 256,
} as const

export const PLANET_INNER_RING = {
  gap: 0.06,
  tube: 0.08,
  color: '#d6b987',
  opacity: 0.5,
} as const

export const PLANET_OUTER_RING = {
  gap: 0.2,
  tube: 0.18,
  color: '#f4ead7',
  opacity: 0.25,
} as const

export const PLANET_OUTERMOST_RING = {
  gap: 0.16,
  tube: 0.12,
  color: '#fff9ed',
  opacity: 0.12,
} as const

function createRingMesh(radius: number, tube: number, color: string, name: string) {
  const geometry = new TorusGeometry(
    PLANET_BASE_RADIUS * radius,
    PLANET_BASE_RADIUS * tube,
    PLANET_RING.radialSegments,
    PLANET_RING.tubularSegments,
  )
  geometry.scale(1, 1, PLANET_RING.thicknessScale)
  geometry.rotateX(-Math.PI / 2)
  geometry.rotateZ(-PLANET_RING.tiltDegrees * Math.PI / 180)
  const material = new MeshStandardMaterial({
    color, roughness: 0.72, metalness: 0,
    transparent: true, opacity: 0, depthWrite: false, depthTest: true,
  })
  const ring = new Mesh(geometry, material)
  ring.name = name
  // 核心先写入深度；环面随后混合，前半环透出球体、后半环由球体遮挡。
  ring.renderOrder = 2
  return ring
}

/** 带环行星视觉样本。沿用行星资源所有权，额外拥有四层带间隙的圆环面 Mesh。 */
export function createRingedPlanetAsset(trackIdx: number, haloTexture: Texture) {
  const planet = createPlanetAsset(trackIdx, haloTexture)
  const ring = createRingMesh(PLANET_RING.radius, PLANET_RING.tube, PLANET_RING.color, `行星环_${trackIdx}`)
  // 从原环带内侧切分细环：细环内缘仍为 1.42r，与主环相隔 0.06r。
  const innerRadius = PLANET_RING.radius - PLANET_RING.tube - PLANET_INNER_RING.gap - PLANET_INNER_RING.tube
  const innerRing = createRingMesh(innerRadius, PLANET_INNER_RING.tube, PLANET_INNER_RING.color, `内侧细环_${trackIdx}`)
  // 由相邻环外缘加间隙推导主半径，调整环宽时仍保持各层分离。
  const outerRadius = PLANET_RING.radius + PLANET_RING.tube + PLANET_OUTER_RING.gap + PLANET_OUTER_RING.tube
  const outerRing = createRingMesh(outerRadius, PLANET_OUTER_RING.tube, PLANET_OUTER_RING.color, `外层行星环_${trackIdx}`)
  const outermostRadius = outerRadius + PLANET_OUTER_RING.tube + PLANET_OUTERMOST_RING.gap + PLANET_OUTERMOST_RING.tube
  const outermostRing = createRingMesh(outermostRadius, PLANET_OUTERMOST_RING.tube, PLANET_OUTERMOST_RING.color, `最外层淡环_${trackIdx}`)
  const layers = [
    { mesh: innerRing, opacity: PLANET_INNER_RING.opacity },
    { mesh: ring, opacity: PLANET_RING.opacity },
    { mesh: outerRing, opacity: PLANET_OUTER_RING.opacity },
    { mesh: outermostRing, opacity: PLANET_OUTERMOST_RING.opacity },
  ]
  // 保持已有两层的节点路径，新增细节追加到对象树。
  planet.root.add(ring, outerRing, innerRing, outermostRing)
  planet.root.name = `带环行星 ${trackIdx + 1}`

  return {
    ...planet, ring, outerRing, innerRing, outermostRing,
    updateAppearance(time: number, phase: number, scale: number, opacity: number, glowFactor: number, haloScale: number) {
      planet.updateAppearance(time, phase, scale, opacity, glowFactor, haloScale)
      for (const layer of layers) {
        layer.mesh.position.copy(planet.core.position)
        layer.mesh.scale.setScalar(scale)
        // 保留每层的基础不透明度，整体淡入淡出与光晕播放不会将它恢复为实色。
        layer.mesh.material.opacity = opacity * layer.opacity
      }
    },
    dispose() {
      planet.dispose()
      for (const layer of layers) {
        layer.mesh.geometry.dispose()
        layer.mesh.material.dispose()
      }
    },
  }
}
