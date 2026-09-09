import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import { ACT1_LOCAL_BOUNDS, LEGACY_WORLD_OFFSET, useAct1WorldStore } from '../act1World'
import { MINIATURE_PIVOT } from '../../behaviors/miniatureUniverse'
import { useScrollStore } from '../../stores/scrollStore'
import { buildWheatSeeds, buildWheatBatch, buildWheatGeometry, buildWheatTiles, wheatBendWeight, wheatEdgeWeight, WHEAT_COLUMNS, WHEAT_ROWS, WHEAT_EXTENT, WHEAT_FLOOR } from '../wheatField'
import { worldClip, worldFragment, wheatVertex, worldVertex } from '../wheatShaders'

describe('bounded wheat field', () => {
  it('welds identical vertices without changing any triangle or material-part attribute', () => {
    for (const lod of [0, 1, 2]) {
      const original = buildWheatGeometry(lod, false)
      const indexed = buildWheatGeometry(lod)
      const expanded = indexed.toNonIndexed()
      for (const attribute of ['position', 'aPart']) {
        expect(expanded.getAttribute(attribute).array).toEqual(original.getAttribute(attribute).array)
      }
      expect(indexed.getAttribute('position').count).toBeLessThan(original.getAttribute('position').count)
      for (const geometry of [original, indexed, expanded]) geometry.dispose()
    }
  })
  it('tiles all original instances exactly once with conservative animated bounds', () => {
    const seeds = buildWheatSeeds()
    const tiles = buildWheatTiles(seeds)
    const expected = new Set(seeds.map(s => [s.x, s.z, s.height, s.angle, s.phase, s.tint].map(Math.fround).join(',')))
    let count = 0
    const point = new Vector3()
    for (const tile of tiles) {
      const roots = tile.getAttribute('aRoot'), variation = tile.getAttribute('aVariation')
      for (let i = 0; i < tile.instanceCount; i++) {
        const x = roots.getX(i), z = roots.getY(i), h = roots.getZ(i)
        expect(expected.delete([x,z,h,variation.getX(i),variation.getY(i),variation.getZ(i)].join(','))).toBe(true)
        // Max unscaled horizontal geometry radius < .184, height < 1.16.
        // Sum of all wind amplitudes <= .43; heading rotates only x/z.
        const maxSide = (.184 + .43 * 1.16 ** 2) * h
        for (const sign of [-1, 1]) {
          point.set(x + sign * maxSide, WHEAT_FLOOR + (sign > 0 ? h * 1.16 : 0), z + sign * maxSide)
          expect(tile.boundingBox!.containsPoint(point)).toBe(true)
          expect(tile.boundingSphere!.containsPoint(point)).toBe(true)
        }
        count++
      }
      tile.dispose()
    }
    expect(count).toBe(48000)
    expect(expected.size).toBe(0)
    expect(worldFragment).not.toContain('uDetail')
    expect(worldFragment).not.toContain('gl_FragCoord')
  })
  it('covers every cell to the front, sides and rear deterministically', () => {
    const seeds = buildWheatSeeds()
    expect(seeds).toHaveLength(48000)
    expect(buildWheatSeeds()).toEqual(seeds)
    const cells = new Set(seeds.map(s => {
      expect(Math.abs(s.x)).toBeLessThan(32)
      expect(Math.abs(s.z)).toBeLessThan(32)
      return `${Math.floor((s.x / WHEAT_EXTENT + 1) * .5 * WHEAT_COLUMNS)},${Math.floor((s.z / WHEAT_EXTENT + 1) * .5 * WHEAT_ROWS)}`
    }))
    expect(cells.size).toBe(48000)
    expect(cells.has('0,0')).toBe(true)
    expect(cells.has('239,199')).toBe(true)
  })
  it('uses three shared instance buffers, with fewer vertices in the distance', () => {
    const seeds = buildWheatSeeds()
    const batches = [0, 1, 2].map(lod => buildWheatBatch(seeds, lod))
    expect(batches.reduce((n, b) => n + b.instanceCount, 0)).toBe(48000)
    expect(batches[0].getAttribute('position').count).toBeGreaterThan(batches[1].getAttribute('position').count)
    expect(batches[1].getAttribute('position').count).toBeGreaterThan(batches[2].getAttribute('position').count)
    for (const b of batches) {
      expect(b.getAttribute('aRoot').count).toBe(b.instanceCount)
      b.dispose()
    }
  })
  it('pins roots, damps boundary wind and clips the post-deformation position for every material', () => {
    expect(wheatBendWeight(0)).toBe(0)
    expect(wheatBendWeight(1)).toBe(1)
    expect(wheatEdgeWeight(32, 0)).toBe(0)
    expect(wheatEdgeWeight(0, -32)).toBe(0)
    expect(wheatEdgeWeight(0, 0)).toBe(1)
    expect(wheatVertex.indexOf('vLocal = p')).toBeGreaterThan(wheatVertex.indexOf('p = bendWheat'))
    expect(worldVertex).toContain('vLocal = position')
    expect(worldFragment).toContain(worldClip)
    expect(worldFragment.indexOf('discard')).toBeLessThan(worldFragment.indexOf('if (uKind'))
    expect(worldFragment).not.toContain('fog_fragment')
  })
  it('adapts the lighthouse without moving it and switches independently of scroll', () => {
    const p = new Vector3(1, 2, 3)
    const adapted = p.clone().add(new Vector3(...LEGACY_WORLD_OFFSET)).add(new Vector3(...MINIATURE_PIVOT))
    expect(adapted.distanceTo(p)).toBeLessThan(1e-12)
    expect(ACT1_LOCAL_BOUNDS.halfSize).toBe(32)
    const before = useScrollStore.getState().scrollProgress
    useAct1WorldStore.getState().selectScene('sunset-wheat')
    expect(useScrollStore.getState().scrollProgress).toBe(before)
    useAct1WorldStore.getState().selectScene('lighthouse')
  })
})
