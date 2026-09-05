import { bellDistanceProgress, smootherstep } from './motionTrail'

export interface FieldParticle {
  id: number
  offset: [number, number, number]
  radius: number
  distance: number
  start: number
  end: number
}
export const FIELD_COUNT = 420
export const FIELD_END = 0.698
export const FIELD_SCAN_END = FIELD_END - 0.04
export const FIELD_CLEAR_RADIUS = 2.4
export const CUBE_BOUND_RADIUS = 32 * Math.sqrt(3)

export function buildParticleField(seed: number): FieldParticle[] {
  let state = seed || 1
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const clusters = Array.from({ length: 7 }, () => ({
    y: random() * 1.8 - 0.9, angle: random() * Math.PI * 2,
    radius: 4 + random() * 3.5, spread: 0.05 + random() * 0.22,
  }))
  const particles = Array.from({ length: FIELD_COUNT }, (_, id): FieldParticle => {
    const cluster = clusters[Math.floor(random() * clusters.length)]
    const clustered = random() < 0.78
    const originalRadial = clustered ? Math.max(FIELD_CLEAR_RADIUS, Math.min(8,
      cluster.radius + (random() + random() - 1) * 1.4))
      : Math.cbrt(FIELD_CLEAR_RADIUS ** 3 + random() * (8 ** 3 - FIELD_CLEAR_RADIUS ** 3))
    // Preserve the original 240 positions/sizes for a given seed. Only added
    // particles extend the same angular clusters into the outer 8–12 shell.
    const radial = id < 240 ? originalRadial
      : 8 + (originalRadial - FIELD_CLEAR_RADIUS) / (8 - FIELD_CLEAR_RADIUS) * 4
    const distance = CUBE_BOUND_RADIUS * radial
    const y = clustered ? Math.max(-0.99, Math.min(0.99,
      cluster.y + (random() + random() - 1) * cluster.spread)) : random() * 2 - 1
    const angle = clustered ? cluster.angle + (random() + random() - 1) * cluster.spread * 2 : random() * Math.PI * 2
    const horizontal = Math.sqrt(1 - y * y)
    return { id, distance,
      offset: [Math.cos(angle) * horizontal * distance, y * distance,
        Math.sin(angle) * horizontal * distance],
      radius: (0.7 + radial * 0.5) * (0.16 + Math.pow(random(), 2.5) * 3.5),
      start: 0, end: 0 }
  }).sort((a, b) => a.distance - b.distance)
  // Invert the integrated bell curve: arrivals are sparse/dense/sparse.
  particles.forEach((particle, i) => {
    const rank = i / (FIELD_COUNT - 1)
    let lo = 0, hi = 1
    for (let j = 0; j < 32; j++) {
      const mid = (lo + hi) / 2
      if (bellDistanceProgress(mid) < rank) lo = mid
      else hi = mid
    }
    particle.end = i === FIELD_COUNT - 1 ? FIELD_END : 0.54 + (FIELD_END - 0.54) * (lo + hi) / 2
    particle.start = particle.end - 0.04
  })
  return particles
}

export function getFieldParticleState(particle: FieldParticle, sp: number) {
  const phase = Math.max(0, Math.min(1, (sp - particle.start) / (particle.end - particle.start)))
  return {
    travel: bellDistanceProgress(phase),
    radius: particle.radius * (1 - smootherstep(Math.max(0, (phase - 0.76) / 0.24))),
    phase,
  }
}

export interface ProjectedFieldCircle { id: number; x: number; y: number; radius: number }
export interface ScanEvent { id: number; start: number; end: number; selection: number }
export function buildFieldScans(seed: number): ScanEvent[] {
  return Array.from({ length: 100 }, (_, id) => ({
    id, start: 0.4 + id * (FIELD_SCAN_END - 0.4) / 100,
    end: Math.min(FIELD_SCAN_END, 0.4 + id * (FIELD_SCAN_END - 0.4) / 100 +
      0.012 + ((seed ^ (id * 7919)) >>> 0) % 600 / 100000),
    selection: ((seed ^ (id * 104729)) >>> 0),
  }))
}

export function selectScanMembers(circles: ProjectedFieldCircle[], selection: number): number[] {
  if (!circles.length) return []
  const center = circles[selection % circles.length]
  // Small local groups alternate with broad neighborhoods.
  const limit = 1 + Math.floor(Math.pow((selection % 997) / 996, 2) * 23)
  const nearest: { id: number; distance: number }[] = []
  for (const circle of circles) {
    const distance = (circle.x - center.x) ** 2 + (circle.y - center.y) ** 2
    let index = 0
    while (index < nearest.length && nearest[index].distance <= distance) index++
    if (index >= limit) continue
    nearest.splice(index, 0, { id: circle.id, distance })
    if (nearest.length > limit) nearest.pop()
  }
  return nearest.map(circle => circle.id)
}
