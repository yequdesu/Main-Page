import { Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAnchorStore } from '../anchorStore'
import {
  planetParticleIndexAnchorId,
  planetWorldAnchorId,
  pointFromVector3,
  readPlanetWorldByParticleIndex,
  setCoreAnchor,
  vector3FromPoint,
} from '../coreAnchors'

describe('core anchors', () => {
  beforeEach(() => {
    useAnchorStore.setState({ anchors: {}, frameId: 7 })
  })

  it('converts vectors into serializable world points', () => {
    const point = pointFromVector3(new Vector3(1, 2, 3))

    expect(point).toEqual({ x: 1, y: 2, z: 3 })
    expect(vector3FromPoint(point).toArray()).toEqual([1, 2, 3])
  })

  it('finds a planet world anchor by particle index', () => {
    setCoreAnchor(planetParticleIndexAnchorId(1), 25, 'world', 'planets')
    setCoreAnchor(planetWorldAnchorId(1), { x: 4, y: 5, z: 6 }, 'world', 'planets')

    expect(readPlanetWorldByParticleIndex(25)).toEqual({ x: 4, y: 5, z: 6 })
  })
})
