import { Box3, BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedBufferGeometry, Sphere, Vector3 } from 'three'

export const WHEAT_COLUMNS = 240
export const WHEAT_ROWS = 200
export const WHEAT_FLOOR = -2.5
export const WHEAT_EXTENT = 31.96
export interface WheatSeed { x: number; z: number; height: number; angle: number; phase: number; tint: number; lod: number }
export function wheatRandom(i: number): number {
  let n = Math.imul(i ^ 0x53a19f2, 0x45d9f3b)
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
export function buildWheatSeeds(): WheatSeed[] {
  return Array.from({ length: WHEAT_COLUMNS * WHEAT_ROWS }, (_, i) => {
    const x = ((i % WHEAT_COLUMNS + .15 + .7 * wheatRandom(i * 6)) / WHEAT_COLUMNS * 2 - 1) * WHEAT_EXTENT
    const z = ((Math.floor(i / WHEAT_COLUMNS) + .15 + .7 * wheatRandom(i * 6 + 1)) / WHEAT_ROWS * 2 - 1) * WHEAT_EXTENT
    return { x, z, height: 1.65 + .5 * wheatRandom(i * 6 + 2), angle: wheatRandom(i * 6 + 3) * Math.PI * 2,
      phase: wheatRandom(i * 6 + 4) * Math.PI * 2, tint: wheatRandom(i * 6 + 5),
      lod: z > 16 && Math.abs(x) < 17 ? 0 : z > -5 ? 1 : 2 }
  })
}

// Same bend envelope used by the shader; a root at y=0 always stays fixed.
export function wheatBendWeight(y: number) { return Math.max(0, y) ** 2 }
export function wheatEdgeWeight(x: number, z: number, half = 32) {
  const t = Math.max(0, Math.min(1, (half - Math.max(Math.abs(x), Math.abs(z))) / .8))
  return t * t * (3 - 2 * t)
}

type P = [number, number, number]
export function buildWheatGeometry(lod: number, indexed = true): BufferGeometry {
  const positions: number[] = [], parts: number[] = []
  const tri = (a: P, b: P, c: P, part: number) => { positions.push(...a, ...b, ...c); parts.push(part, part, part) }
  const ribbon = (a: P, b: P, width: number, part: number) => {
    tri([a[0] - width, a[1], a[2]], [a[0] + width, a[1], a[2]], b, part)
  }
  // Segmented, crossed stem ribbons: thin from every view, with real bend joints.
  const segments = lod === 0 ? 6 : 3
  for (let j = 0; j < segments; j++) {
    const a = j / segments * .82, b = (j + 1) / segments * .82
    for (let axis = 0; axis < 2; axis++) {
      const p = (side: number, y: number): P => axis ? [0, y, side * .006] : [side * .006, y, 0]
      tri(p(-1, a), p(1, a), p(1, b), 0); tri(p(-1, a), p(1, b), p(-1, b), 0)
    }
  }
  const rows = lod === 0 ? 9 : lod === 1 ? 7 : 5
  for (let j = 0; j < rows; j++) {
    const y = .74 + j / rows * .27
    const width = .021 * (1 - .52 * j / rows)
    for (const side of [-1, 1]) {
      const base: P = [side * .007, y, 0]
      const tip: P = [side * (.04 - .014 * j / rows), y + .047, 0]
      const mid: P = [side * .027, y + .021, width]
      const lower: P = [side * .027, y + .011, -width]
      tri(base, mid, tip, 1); tri(base, tip, lower, 1)
      if (lod < 2) { tri(mid, lower, tip, 1); tri(base, lower, mid, 1) }
      // Awns extend upwards, rather than sideways like leaves on a branch.
      if (lod < 2 || j % 2 === 0) ribbon(tip, [tip[0] + side * .028, tip[1] + .12, .004], .0015, 2)
    }
  }
  if (lod < 2) {
    tri([0, .28, 0], [.027, .44, .03], [.18, .55, .035], 0)
    tri([0, .52, 0], [-.025, .64, -.03], [-.14, .7, -.04], 0)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(parts), 1))
  if (indexed) {
    // Exact float32 welding, not a tolerance-based simplification. The fragment
    // shader derives face normals, so sharing positions preserves the faceting.
    const p = geometry.getAttribute('position'), part = geometry.getAttribute('aPart')
    const unique = new Map<string, number>(), xyz: number[] = [], kinds: number[] = [], indices: number[] = []
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i)},${p.getY(i)},${p.getZ(i)},${part.getX(i)}`
      let index = unique.get(key)
      if (index === undefined) {
        index = unique.size; unique.set(key, index)
        xyz.push(p.getX(i), p.getY(i), p.getZ(i)); kinds.push(part.getX(i))
      }
      indices.push(index)
    }
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(xyz), 3))
    geometry.setAttribute('aPart', new BufferAttribute(new Float32Array(kinds), 1))
    geometry.setIndex(indices)
  }
  return geometry
}

function instanceWheat(source: BufferGeometry, selected: WheatSeed[]): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', source.getAttribute('position'))
  geometry.setAttribute('aPart', source.getAttribute('aPart'))
  geometry.setIndex(source.index)
  geometry.instanceCount = selected.length
  geometry.setAttribute('aRoot', new InstancedBufferAttribute(new Float32Array(selected.flatMap(s => [s.x, s.z, s.height])), 3))
  geometry.setAttribute('aVariation', new InstancedBufferAttribute(new Float32Array(selected.flatMap(s => [s.angle, s.phase, s.tint])), 3))
  const box = new Box3()
  for (const seed of selected) {
    // Includes the full grain/awn geometry plus the maximum analytical wind
    // displacement at any time. Roots are in shader coordinates, not position.
    box.expandByPoint(new Vector3(seed.x - 1.7, WHEAT_FLOOR, seed.z - 1.7))
    box.expandByPoint(new Vector3(seed.x + 1.7, WHEAT_FLOOR + seed.height * 1.2, seed.z + 1.7))
  }
  geometry.boundingBox = box
  geometry.boundingSphere = box.getBoundingSphere(new Sphere())
  return geometry
}

export function buildWheatBatch(seeds: WheatSeed[], lod: number): InstancedBufferGeometry {
  const source = buildWheatGeometry(lod)
  const result = instanceWheat(source, seeds.filter(seed => seed.lod === lod))
  source.dispose()
  return result
}

export function buildWheatTiles(seeds: WheatSeed[]): InstancedBufferGeometry[] {
  const templates = [0, 1, 2].map(lod => buildWheatGeometry(lod))
  const cells = new Map<number, WheatSeed[]>()
  for (const seed of seeds) {
    const x = Math.max(0, Math.min(3, Math.floor((seed.x + 32) / 16)))
    const z = Math.max(0, Math.min(3, Math.floor((seed.z + 32) / 16)))
    const id = seed.lod * 16 + z * 4 + x
    if (!cells.has(id)) cells.set(id, [])
    cells.get(id)!.push(seed)
  }
  const tiles = [...cells.entries()].map(([id, roots]) => {
    const geometry = instanceWheat(templates[Math.floor(id / 16)], roots)
    geometry.userData.lod = Math.floor(id / 16)
    return geometry
  })
  templates.forEach(g => g.dispose())
  return tiles
}
