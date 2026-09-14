import { Vector3 } from 'three'
import { stellarRandom } from './stellarRandom'
import { sampleCmePosition } from './stellarCmeDistribution'
import { STRUCTURE_LAYOUT, type getStructureLayout } from './structureLayout'

/** 只在轮廓环带放置活动区；大小随恒星共同缩放，不受当前相机距离补偿。 */
export const STELLAR_LIMB = {
  scaleRatios: [0.066, 0.066 * 0.58, 0.046],
  detailPixels: [12, 80],
} as const

/** CME 全环取样并偏好最终可见弧段；日珥保留原有全环/优选弧段分配。 */
export function stellarLimbPhase(seed: number, position: number, slot: number, referenceLimit: number) {
  if (slot === 2) return Math.PI * sampleCmePosition((position + 1) / 2, referenceLimit)
  const wholeRing = slot === 1 || (slot === 0 && stellarRandom(seed, 1101) < 0.25)
  return Math.max(-1, Math.min(1, position)) * (wholeRing ? Math.PI : referenceLimit)
}

export function stellarDetailVisibility(radiusPixels: number) {
  const [low, high] = STELLAR_LIMB.detailPixels
  const t = Math.max(0, Math.min(1, (radiusPixels - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

/** 实际相机的球体切圆。保存环周相位，而非日面经纬度；镜头变化只连续更新环带参考系。 */
export function createStellarLimbFrame() {
  const center = new Vector3(), right = new Vector3(), up = new Vector3(), facing = new Vector3()
  const point = new Vector3(), sun = new Vector3(), referenceCamera = new Vector3(0, 0, STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ)
  const referenceUp = new Vector3(0, 1, 0)
  let starRadius = 1, ringRadius = 1, limit = 1
  function view(camera: Vector3, cameraUp: Vector3) {
    facing.copy(camera).sub(sun)
    const distance = Math.max(starRadius + 1e-6, facing.length())
    facing.normalize()
    right.crossVectors(cameraUp, facing).normalize()
    up.crossVectors(facing, right).normalize()
    center.copy(sun).addScaledVector(facing, starRadius * starRadius / distance)
    ringRadius = starRadius * Math.sqrt(1 - (starRadius / distance) ** 2)
  }
  function positionAt(angle: number, target: Vector3) {
    return target.copy(center).addScaledVector(right, ringRadius * Math.cos(angle)).addScaledVector(up, ringRadius * Math.sin(angle))
  }
  function sampleAngle(angle: number, anchor: Vector3, tangent: Vector3, normal: Vector3) {
    positionAt(angle, anchor)
    tangent.copy(right).multiplyScalar(-Math.sin(angle)).addScaledVector(up, Math.cos(angle))
    normal.copy(anchor).sub(sun).normalize()
  }
  return {
    get referenceLimit() { return limit },
    layout(layout: ReturnType<typeof getStructureLayout>) {
      sun.set(layout.sunX, 0, 0); starRadius = layout.sunRadius
      view(referenceCamera, referenceUp)
      let low = 0, high = Math.PI / 2
      for (let i = 0; i < 40; i++) {
        const angle = (low + high) / 2
        positionAt(angle, point)
        const scale = referenceCamera.z / (referenceCamera.z - point.z)
        if (point.y * scale > layout.height * 0.43 || point.x * scale < -layout.width * 0.485) high = angle
        else low = angle
      }
      limit = low
    },
    view,
    sampleAngle,
    sample(x: number, anchor: Vector3, tangent: Vector3, normal: Vector3) {
      sampleAngle(Math.max(-1, Math.min(1, x)) * limit, anchor, tangent, normal)
    },
  }
}
