import { expect, it } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import Lighthouse, { _lighthouseGroupRef } from '../../actors/Lighthouse'
import { useScrollStore } from '../../stores/scrollStore'

it('Studio 灯塔独立于主页滚动和截图引用，支持手动隐藏', async () => {
  useScrollStore.setState({ scrollProgress: 0 })
  const main = await ReactThreeTestRenderer.create(<Lighthouse />)
  const mainGroup = _lighthouseGroupRef!
  const studio = await ReactThreeTestRenderer.create(<Lighthouse standalone />)
  try {
    const standaloneGroup = studio.scene.children[0].instance
    expect(_lighthouseGroupRef).toBe(mainGroup)
    useScrollStore.setState({ scrollProgress: 1 })
    await main.advanceFrames(1, 0.016)
    await studio.advanceFrames(1, 0.016)
    expect(mainGroup.visible).toBe(false)
    expect(standaloneGroup.visible).toBe(true)
    standaloneGroup.visible = false
    await studio.advanceFrames(1, 0.016)
    expect(standaloneGroup.visible).toBe(false)
    await studio.unmount()
    expect(_lighthouseGroupRef).toBe(mainGroup)
  } finally {
    await main.unmount()
    useScrollStore.setState({ scrollProgress: 0 })
  }
})
