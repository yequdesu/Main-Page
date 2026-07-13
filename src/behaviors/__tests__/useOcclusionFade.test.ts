import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { calcOcclusionFactor } from '../useOcclusionFade'

function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  return camera
}

describe('calcOcclusionFactor', () => {
  it('fully hides a planet that overlaps the focused planet in screen space', () => {
    const camera = makeCamera()
    const factor = calcOcclusionFactor(
      new Vector3(0, 0, 4),
      camera,
      new Vector3(0, 0, 0),
      1,
      1,
    )

    expect(factor).toBe(0)
  })

  it('keeps a separated planet visible', () => {
    const camera = makeCamera()
    const factor = calcOcclusionFactor(
      new Vector3(3, 0, 4),
      camera,
      new Vector3(0, 0, 0),
      1,
      1,
    )

    expect(factor).toBeGreaterThan(0.9)
  })

  it('fades a nearby planet before it reaches exact disc overlap', () => {
    const camera = makeCamera()
    const factor = calcOcclusionFactor(
      new Vector3(0.2, 0, 4),
      camera,
      new Vector3(0, 0, 0),
      1,
      1,
    )

    expect(factor).toBeLessThan(0.5)
  })

  it('fades a planet inside the star-to-focus spatial corridor', () => {
    const camera = makeCamera()
    const factor = calcOcclusionFactor(
      new Vector3(0.2, 0.12, 4),
      camera,
      new Vector3(0, 0, 0),
      1,
      1,
      new Vector3(0, 0, 6),
    )

    expect(factor).toBeLessThan(0.2)
  })

  it('fades a planet inside the finite camera-front clear field', () => {
    const camera = makeCamera()
    const factor = calcOcclusionFactor(
      new Vector3(0.3, 0, 8.7),
      camera,
      new Vector3(0, 0, 0),
      1,
      1,
    )

    expect(factor).toBeLessThan(0.2)
  })

  it('fades a planet on the camera-to-star ray even when it misses the focus ray', () => {
    const camera = makeCamera()
    const factor = calcOcclusionFactor(
      new Vector3(0, 0, 7.2),
      camera,
      new Vector3(2, 0, 0),
      1,
      1,
      new Vector3(0, 0, 6),
    )

    expect(factor).toBeLessThan(0.2)
  })
})
