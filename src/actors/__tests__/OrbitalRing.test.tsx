import { afterEach, describe, expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Color, LineLoop, type LineBasicMaterial } from 'three'
import OrbitalRing from '../OrbitalRing'
import { useScrollStore } from '../../stores/scrollStore'
import type { OrbitalRingConfig } from '../../types'

const config: OrbitalRingConfig = {
  radius: 7.8,
  inclination: 0.12,
  eccentricity: 0.15,
  speed: 0.02,
  phase: Math.PI / 3,
}
const initialProgress = useScrollStore.getState().scrollProgress

afterEach(() => {
  useScrollStore.setState({ scrollProgress: initialProgress })
})

function expectOrderedCircle(line: LineLoop, radius: number) {
  // 回归：圆环面的三角索引会让 LineLoop 在内外圈间折返。
  expect(line.isLineLoop).toBe(true)
  expect(line.geometry.index).toBeNull()
  const positions = line.geometry.getAttribute('position')
  const chordLength = 2 * radius * Math.sin(Math.PI / positions.count)
  for (let i = 0; i < positions.count; i++) {
    const next = (i + 1) % positions.count
    const x = positions.getX(i)
    const y = positions.getY(i)
    const nx = positions.getX(next)
    const ny = positions.getY(next)
    expect(Math.hypot(x, y)).toBeCloseTo(radius, 5)
    expect(positions.getZ(i)).toBe(0)
    // 每段（包括首尾闭合）只前进到相邻圆周点，无重复、径向边或倒退。
    expect(x * ny - y * nx).toBeGreaterThan(0)
    expect(Math.hypot(nx - x, ny - y)).toBeCloseTo(chordLength, 5)
  }
}

describe('OrbitalRing', () => {
  it.each([7.8, 9.4, 11])('半径 %s 的轨道沿单一圆周连续闭合', async radius => {
    const renderer = await ReactThreeTestRenderer.create(
      <OrbitalRing config={{ ...config, radius }} />,
    )
    try {
      const line = renderer.scene.children[0].instance.children[0].children[0] as LineLoop
      expectOrderedCircle(line, radius)
    } finally {
      await renderer.unmount()
    }
  })

  it('调整半径和分段时更新轨道与包围体', async () => {
    const renderer = await ReactThreeTestRenderer.create(<OrbitalRing config={config} />)
    try {
      const root = renderer.scene.children[0].instance
      const line = root.children[0].children[0] as LineLoop
      line.geometry.computeBoundingSphere()
      await renderer.update(<OrbitalRing config={{ ...config, radius: 11, segments: 128 }} />)
      expectOrderedCircle(line, 11)
      expect(line.geometry.getAttribute('position').count).toBe(128)
      expect(line.geometry.boundingSphere).toBeNull()
      line.geometry.computeBoundingSphere()
      expect(line.geometry.boundingSphere!.radius).toBeCloseTo(11, 5)
    } finally {
      await renderer.unmount()
    }
  })

  it('保留倾角、拉伸、进动、冻结、滚动显隐和主题颜色覆盖', async () => {
    useScrollStore.setState({ scrollProgress: 0.85 })
    const renderer = await ReactThreeTestRenderer.create(<OrbitalRing config={config} />)
    try {
      const root = renderer.scene.children[0].instance
      const plane = root.children[0]
      const line = plane.children[0] as LineLoop
      const material = line.material as LineBasicMaterial
      await renderer.advanceFrames(1, 0.5)
      expect(root.rotation.y).toBeCloseTo(config.phase + config.speed * 0.5)
      expect(plane.rotation.x).toBeCloseTo(Math.PI / 2 - config.inclination)
      expect(plane.scale.x).toBeCloseTo(1 / Math.sqrt(1 - config.eccentricity ** 2))
      expect(material.opacity).toBe(0)

      useScrollStore.setState({ scrollProgress: 0.925 })
      await renderer.advanceFrames(1, 0.5)
      expect(material.opacity).toBeCloseTo(0.14)

      const frozenPhase = root.rotation.y
      const geometry = line.geometry
      await renderer.update(<OrbitalRing config={config} speedScale={0} color="#123456" />)
      useScrollStore.setState({ scrollProgress: 1 })
      await renderer.advanceFrames(1, 0.5)
      expect(root.rotation.y).toBeCloseTo(frozenPhase)
      expect(material.opacity).toBeCloseTo(0.28)
      expect(material.color.equals(new Color('#123456'))).toBe(true)
      expect(line.geometry).toBe(geometry)
      expect(line.renderOrder).toBe(2)
      expect(material.transparent).toBe(true)
      expect(material.depthTest).toBe(true)
      expect(material.depthWrite).toBe(false)
    } finally {
      await renderer.unmount()
    }
  })
})
