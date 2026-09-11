/** Act 4 与 DOM 标注共享的布局比例；行星顺序与 Act 3 的三条内轨一致。 */
export const STRUCTURE_LAYOUT = {
  layer: 1,
  centerY: -24,
  planeZ: -16,
  cameraZ: 8,
  fov: 40,
  planetFractions: [0.40, 0.58, 0.76],
  radiusFractions: [0.027, 0.025, 0.027],
} as const

export function getStructureLayout(aspect: number) {
  const height = 2 * Math.tan(STRUCTURE_LAYOUT.fov * Math.PI / 360) * (STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ)
  const width = height * aspect
  const sunRadius = height * 0.9
  const distance = STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ
  const edgeSlope = -0.395 * width / distance
  const sunX = edgeSlope * distance - sunRadius * Math.sqrt(1 + edgeSlope * edgeSlope)
  const glowSlope = -0.22 * width / distance // 内层光晕最远到视口 28%，避开第一颗行星。
  return {
    width, height, sunRadius,
    sunX,
    sunGlowRadius: Math.abs(sunX - glowSlope * distance) / Math.sqrt(1 + glowSlope * glowSlope),
    planets: STRUCTURE_LAYOUT.planetFractions.map((fraction, i) => ({
      x: (fraction - 0.5) * width,
      radius: Math.min(width * STRUCTURE_LAYOUT.radiusFractions[i], height * 0.066) * 0.5,
    })),
  }
}
