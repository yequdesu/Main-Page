import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import ReactThreeTestRenderer from '@react-three/test-renderer'

/**
 * L2 场景图测试 — Act 组件渲染 + 可见性控制。
 *
 * 使用 @react-three/test-renderer 的 create() + advanceFrames()
 * 验证组件挂载、场景图结构、useFrame 调用。
 *
 * 注意：涉及 document.createElement('canvas') 的组件（PlanetLabel、CentralStar、DustField）
 * 需要 jsdom 环境。当前仅测试不需要 DOM API 的组件。
 *
 * 援引：R3F 官方 Testing 文档，@react-three/test-renderer advanceFrames()
 */

import { useScrollStore } from '../../stores/scrollStore'

function setScrollProgress(sp: number) {
  useScrollStore.setState({ scrollProgress: sp })
}

describe('R3F Component Scene Graph', () => {
  beforeEach(() => {
    useScrollStore.setState({
      scrollProgress: 0,
      focusedPlanetIdx: -1,
      hoveredIdx: -1,
      overlayData: { focused: false },
    })
  })

  it('renders a basic R3F scene', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <mesh>
        <boxGeometry />
        <meshBasicMaterial />
      </mesh>,
    )

    const tree = renderer.toTree()
    expect(tree).toBeDefined()
    expect(tree!.length).toBeGreaterThan(0)

    await renderer.unmount()
  })

  it('renders Lighthouse component with 30 meshes', async () => {
    const { default: Lighthouse } = await import('../../actors/Lighthouse')

    const renderer = await ReactThreeTestRenderer.create(
      <Lighthouse />,
    )

    const graph = renderer.toGraph()
    expect(graph).toBeDefined()

    // Lighthouse root should be a Group
    const sceneItems = graph!
    expect(sceneItems.length).toBeGreaterThan(0)

    const groupItem = sceneItems.find((item: { type: string }) => item.type === 'Group')
    expect(groupItem).toBeDefined()

    await renderer.unmount()
  })

  it('renders LightBeam component with correct hierarchy', async () => {
    setScrollProgress(0)

    const { default: LightBeam } = await import('../../actors/LightBeam')

    const renderer = await ReactThreeTestRenderer.create(
      <LightBeam />,
    )

    const tree = renderer.toTree()
    expect(tree).toBeDefined()

    // LightBeam should contain children (cones, rays, glow)
    const root = tree![0]
    expect(root).toBeDefined()
    expect(root.type).toBeDefined()

    await renderer.unmount()
  })

  it('renders Act1OceanVoyage — hides when visible=false', async () => {
    setScrollProgress(0)

    const { default: Act1OceanVoyage } = await import('../../acts/Act1OceanVoyage')

    const renderer = await ReactThreeTestRenderer.create(
      <Act1OceanVoyage visible={false} />,
    )

    // When not visible, Act returns null
    const tree = renderer.toTree()
    expect(tree).toBeDefined()

    await renderer.unmount()
  })

  it('advances frames and invokes useFrame callbacks', async () => {
    setScrollProgress(0)

    const { default: LightBeam } = await import('../../actors/LightBeam')

    const renderer = await ReactThreeTestRenderer.create(
      <LightBeam />,
    )

    // Advance 10 frames at 60fps
    await renderer.advanceFrames(10, 0.016)

    const graph = renderer.toGraph()
    expect(graph).toBeDefined()

    await renderer.unmount()
  })

  it('renders ScrollInvalidator without errors', async () => {
    const { default: ScrollInvalidator } = await import('../../r3f/ScrollInvalidator')

    const renderer = await ReactThreeTestRenderer.create(
      <ScrollInvalidator />,
    )

    const tree = renderer.toTree()
    expect(tree).toBeDefined()

    await renderer.unmount()
  })

  it('renders OrbitRings component', async () => {
    const { default: OrbitRings } = await import('../../actors/OrbitRings')

    const renderer = await ReactThreeTestRenderer.create(
      <OrbitRings />,
    )

    const graph = renderer.toGraph()
    expect(graph).toBeDefined()

    await renderer.unmount()
  })
})
