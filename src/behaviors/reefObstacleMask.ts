import { Mesh, Vector3, type Object3D } from 'three'

export interface OceanBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const OCEAN_BOUNDS: OceanBounds = {
  minX: -31.5,
  maxX: 31.5,
  minZ: -55.5,
  maxZ: 7.5,
}

interface ReefMaskOptions {
  resolution: number
  modelScale: number
  centerZ: number
  dilation?: number
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()

function worldToGrid(
  x: number,
  z: number,
  resolution: number,
  bounds: OceanBounds,
): [number, number] {
  const u = (x - bounds.minX) / (bounds.maxX - bounds.minX)
  // PlaneGeometry is rotated -90° around X, so its UV v axis runs from the
  // near edge toward negative Z.
  const v = (bounds.maxZ - z) / (bounds.maxZ - bounds.minZ)
  return [u * (resolution - 1), v * (resolution - 1)]
}

function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax)
}

function rasterizeTriangle(
  mask: Uint8Array,
  resolution: number,
  a: [number, number],
  b: [number, number],
  c: [number, number],
): void {
  const area = edge(a[0], a[1], b[0], b[1], c[0], c[1])
  if (Math.abs(area) < 1e-5) return

  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
  const maxX = Math.min(resolution - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
  const maxY = Math.min(resolution - 1, Math.ceil(Math.max(a[1], b[1], c[1])))
  const sign = area < 0 ? -1 : 1

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const e0 = edge(a[0], a[1], b[0], b[1], px, py) * sign
      const e1 = edge(b[0], b[1], c[0], c[1], px, py) * sign
      const e2 = edge(c[0], c[1], a[0], a[1], px, py) * sign
      if (e0 >= 0 && e1 >= 0 && e2 >= 0) mask[y * resolution + x] = 255
    }
  }
}

function dilateMask(source: Uint8Array, resolution: number, radius: number): Uint8Array {
  if (radius <= 0) return source
  const output = source.slice()
  const radiusSq = radius * radius

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      if (source[y * resolution + x] === 0) continue
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          if (ox * ox + oy * oy > radiusSq) continue
          const nx = x + ox
          const ny = y + oy
          if (nx < 0 || nx >= resolution || ny < 0 || ny >= resolution) continue
          output[ny * resolution + nx] = 255
        }
      }
    }
  }

  return output
}

/**
 * Rasterises the imported reef's actual top-down triangle footprint. The mask
 * lives in the same local XZ coordinates as the simulated ocean, so the
 * miniature parent's rotation and scale never desynchronise the collision.
 */
export function buildReefObstacleMask(
  source: Object3D,
  options: ReefMaskOptions,
  bounds: OceanBounds = OCEAN_BOUNDS,
): Uint8Array {
  const { resolution, modelScale, centerZ, dilation = 2 } = options
  const mask = new Uint8Array(resolution * resolution)
  source.updateWorldMatrix(true, true)

  source.traverse((child) => {
    if (!(child instanceof Mesh) || child.name !== 'Plane') return
    const position = child.geometry.getAttribute('position')
    const index = child.geometry.getIndex()
    const triangleCount = index ? index.count / 3 : position.count / 3

    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const ia = index ? index.getX(triangle * 3) : triangle * 3
      const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
      const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
      _a.fromBufferAttribute(position, ia).applyMatrix4(child.matrixWorld)
      _b.fromBufferAttribute(position, ib).applyMatrix4(child.matrixWorld)
      _c.fromBufferAttribute(position, ic).applyMatrix4(child.matrixWorld)

      const a = worldToGrid(_a.x * modelScale, centerZ + _a.z * modelScale, resolution, bounds)
      const b = worldToGrid(_b.x * modelScale, centerZ + _b.z * modelScale, resolution, bounds)
      const c = worldToGrid(_c.x * modelScale, centerZ + _c.z * modelScale, resolution, bounds)
      rasterizeTriangle(mask, resolution, a, b, c)
    }
  })

  return dilateMask(mask, resolution, dilation)
}

/**
 * Converts the binary reef footprint into a smooth, outward-facing proximity
 * field. Red stores the solid obstacle and green fades from one at the reef to
 * zero in open water. The ocean shader uses the gradient for contact foam and
 * a small reflected-wave band without running a full-domain fluid solver.
 */
export function buildReefProximityField(
  mask: Uint8Array,
  resolution: number,
  maxDistance = 48,
): Uint8Array {
  const distance = new Float32Array(resolution * resolution)
  const diagonal = Math.SQRT2

  for (let index = 0; index < distance.length; index++) {
    distance[index] = mask[index] > 0 ? 0 : maxDistance
  }

  const relax = (index: number, neighbour: number, cost: number) => {
    distance[index] = Math.min(distance[index], distance[neighbour] + cost)
  }

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const index = y * resolution + x
      if (x > 0) relax(index, index - 1, 1)
      if (y > 0) relax(index, index - resolution, 1)
      if (x > 0 && y > 0) relax(index, index - resolution - 1, diagonal)
      if (x + 1 < resolution && y > 0) relax(index, index - resolution + 1, diagonal)
    }
  }

  for (let y = resolution - 1; y >= 0; y--) {
    for (let x = resolution - 1; x >= 0; x--) {
      const index = y * resolution + x
      if (x + 1 < resolution) relax(index, index + 1, 1)
      if (y + 1 < resolution) relax(index, index + resolution, 1)
      if (x + 1 < resolution && y + 1 < resolution) {
        relax(index, index + resolution + 1, diagonal)
      }
      if (x > 0 && y + 1 < resolution) {
        relax(index, index + resolution - 1, diagonal)
      }
    }
  }

  const field = new Uint8Array(resolution * resolution * 4)
  for (let index = 0; index < distance.length; index++) {
    const proximity = 1 - Math.min(distance[index] / Math.max(1, maxDistance), 1)
    const offset = index * 4
    field[offset] = mask[index]
    field[offset + 1] = Math.round(proximity * 255)
    field[offset + 2] = 0
    field[offset + 3] = 255
  }
  return field
}
