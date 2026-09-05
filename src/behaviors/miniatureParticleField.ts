import { bellDistanceProgress, smootherstep } from './motionTrail'

export interface FieldParticle {
  id: number
  offset: [number, number, number]
  radius: number
  distance: number
  start: number
  end: number
}
export const FIELD_COUNT = 240
export const FIELD_END = 0.648
export const CUBE_BOUND_RADIUS = 32 * Math.sqrt(3)

export function buildParticleField(seed: number): FieldParticle[] {
  let state = seed || 1
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const particles = Array.from({ length: FIELD_COUNT }, (_, id): FieldParticle => {
    // Uniform volume density yields more objects in the outer radial shells.
    const distance = CUBE_BOUND_RADIUS * Math.cbrt(1.3 ** 3 + random() * (8 ** 3 - 1.3 ** 3))
    const y = random() * 2 - 1, angle = random() * Math.PI * 2
    const horizontal = Math.sqrt(1 - y * y)
    return { id, distance,
      offset: [Math.cos(angle) * horizontal * distance, y * distance,
        Math.sin(angle) * horizontal * distance],
      radius: (0.7 + distance / CUBE_BOUND_RADIUS * 0.5) * (0.65 + random() * 0.7),
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
    particle.end = i === FIELD_COUNT - 1 ? FIELD_END : 0.53 + (FIELD_END - 0.53) * (lo + hi) / 2
    particle.start = particle.end - 0.03
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
  return Array.from({ length: 16 }, (_, id) => ({
    id, start: 0.4 + id * 0.0053,
    end: 0.4 + id * 0.0053 + 0.014 + ((seed ^ (id * 7919)) >>> 0) % 600 / 100000,
    selection: ((seed ^ (id * 104729)) >>> 0),
  }))
}

export function selectScanMembers(circles: ProjectedFieldCircle[], selection: number): number[] {
  if (circles.length < 3) return []
  const center = circles[selection % circles.length]
  const limit = 3 + selection % 4
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
