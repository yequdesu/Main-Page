import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createCameraMotionCoordinator } from '../cameraMotionCoordinator'
import { createStellarTransitionState } from '../stellarTransition'
import { createFocusChannels } from '../useFocusTimeline'
import { createCameraFocusController } from '../useCameraFocus'
import { getPageFlow } from '../usePageFlow'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))
function setup() {
  const focus = createFocusChannels(), stellar = createStellarTransitionState()
  const motion = createCameraMotionCoordinator(focus, stellar)
  const actions = { focus: vi.fn(), exit: vi.fn(() => [0, 0, 0]), timeout: vi.fn() }, onReturn = vi.fn()
  cleanups.push(motion.attachFocus(actions, onReturn), motion.attachStellar())
  const camera = new PerspectiveCamera(40, 16 / 9)
  camera.position.set(0, 0.25, 8); camera.lookAt(0, -0.65, -24)
  const update = createCameraFocusController(), voyager = new Vector3(-11, 2, -20)
  const frame = (page: number, delta = 1 / 60) => {
    motion.seekStellar(getPageFlow(page).structureProgress)
    motion.advanceFocus(delta, page)
    update(camera, focus, voyager, 1, 0.32, stellar)
  }
  return { focus, stellar, motion, actions, onReturn, camera, frame }
}

describe('统一运镜协调器', () => {
  it('Voyager 交接恒星取消旧超时，重复请求不重采起点，转场全程只有一个镜头归属', () => {
    const { motion, focus, actions, camera, frame } = setup()
    motion.dispatch({ type: 'voyager' })
    for (let i = 0; i < 150; i++) frame(1)
    expect(motion.owner).toBe('focus')
    expect(focus.planetScale).toBe(0.6)
    const start = camera.position.clone(), direction = camera.getWorldDirection(new Vector3())
    motion.dispatch({ type: 'exit', reason: 'menu' }); frame(1, 0)
    expect(focus.planetScale).toBe(0.6)
    const revision = focus.revision
    expect(motion.owner).toBe('stellar')
    expect(camera.position.distanceTo(start)).toBeLessThan(1e-9)
    expect(camera.getWorldDirection(new Vector3()).distanceTo(direction)).toBeLessThan(1e-9)
    expect(motion.dispatch({ type: 'exit', reason: 'timeout' })).toBe(false)
    expect(motion.dispatch({ type: 'exit', reason: 'menu' })).toBe(false)
    expect(focus.revision).toBe(revision)
    for (let i = 0; i <= 200; i++) {
      frame(1.02 + 0.4 * i / 200)
      expect(motion.owner).toBe('stellar')
      if (i > 0) expect(motion.dispatch({ type: 'voyager' })).toBe(false)
    }
    for (let i = 0; i < 2000; i++) frame(1.42)
    expect(actions.timeout).not.toHaveBeenCalled()
    for (let i = 200; i >= 0; i--) frame(1 + 0.42 * i / 200)
    expect(motion.owner).toBe('global')
    expect(focus.planetScale).toBe(1)
    expect(camera.position.distanceTo(new Vector3(0, 0.25, 8))).toBeLessThan(1e-9)
  })

  it.each([1.01, 1.15])('在 %s 暂停保留构图，反向回到 Act 3 平滑恢复全景且仅通知一次', peak => {
    const { motion, onReturn, camera, frame } = setup()
    motion.dispatch({ type: 'voyager' })
    for (let i = 0; i < 150; i++) frame(1)
    motion.dispatch({ type: 'exit', reason: 'menu' }); frame(peak)
    for (let i = 0; i < 360; i++) frame(peak)
    const frozen = camera.position.clone()
    for (let i = 0; i < 60; i++) frame(peak)
    expect(camera.position.distanceTo(frozen)).toBeLessThan(1e-9)
    frame(1, 0)
    expect(camera.position.distanceTo(frozen)).toBeLessThan(1e-9)
    expect(motion.owner).toBe('return')
    expect(onReturn).toHaveBeenCalledOnce()
    for (let i = 0; i < 360; i++) frame(1)
    expect(onReturn).toHaveBeenCalledOnce()
    expect(camera.position.distanceTo(new Vector3(0, 0.25, 8))).toBeLessThan(1e-9)
  })

  it('交接开始前可重新聚焦，旧注册释放不会杀死新会话；释放后无动画残留', () => {
    const { motion, focus, stellar, frame } = setup()
    motion.dispatch({ type: 'voyager' }); frame(1)
    motion.dispatch({ type: 'exit', reason: 'menu' }); frame(1)
    expect(motion.dispatch({ type: 'focus', planetIdx: 2 }, 2)).toBe(true)
    expect(motion.owner).toBe('focus')
    const oldActions = { focus: vi.fn(), exit: () => [0, 0, 0], timeout: vi.fn() }
    const detachOld = motion.attachFocus(oldActions, vi.fn())
    const newActions = { ...oldActions, focus: vi.fn(), timeout: vi.fn() }
    const detachNew = motion.attachFocus(newActions, vi.fn())
    detachOld()
    motion.dispatch({ type: 'focus', planetIdx: 1 }, 1)
    expect(oldActions.focus).not.toHaveBeenCalled()
    expect(newActions.focus).toHaveBeenCalledWith(1)
    const detachStellar = motion.attachStellar()
    frame(1.15)
    detachNew(); detachStellar()
    const elapsed = focus.elapsed, zoom = stellar.zoom
    frame(1.42)
    expect(focus.elapsed).toBe(elapsed)
    expect(stellar.zoom).toBe(zoom)
    expect(motion.dispatch({ type: 'voyager' })).toBe(false)
  })
})
