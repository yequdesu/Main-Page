// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { PerspectiveCamera, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import PlanetClickHandler from '../PlanetClickHandler'
import { voyagerState } from '../../actors/voyagerState'
import { useScrollStore } from '../../stores/scrollStore'
import { executeCommand } from '../../terminal/commands'

const context = vi.hoisted(() => ({ value: {} as unknown }))
vi.mock('@react-three/fiber', () => ({ useThree: () => context.value }))
const initial = useScrollStore.getState()
afterEach(() => {
  cleanup()
  useScrollStore.setState(initial, true)
  voyagerState.available = false
  voyagerState.opacity = 0
  voyagerState.hitTargets = []
  vi.restoreAllMocks()
})

it('缩小后的飞行器保留 16px 命中半径，空白退出，隐藏或未加载时不能点击', () => {
  const canvas = document.createElement('canvas')
  const camera = new PerspectiveCamera(40, 1280 / 720)
  camera.updateMatrixWorld()
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1280, height: 720 } as DOMRect)
  context.value = { camera, gl: { domElement: canvas } }
  useScrollStore.setState({ scrollProgress: 1 })
  Object.assign(voyagerState, { available: true, opacity: 1, radius: 0.3, hitRadius: 0.02 })
  voyagerState.position.set(0, 0, -20)
  render(<PlanetClickHandler />)
  const click = (x: number, y: number) => canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y }))
  click(650, 360)
  expect(useScrollStore.getState().focusEvent).toEqual({ type: 'voyager' })
  expect(useScrollStore.getState().focusedVoyager).toBe(true)
  click(1000, 100)
  expect(useScrollStore.getState().focusedVoyager).toBe(false)
  useScrollStore.getState().setPageProgress(1.22)
  click(640, 360)
  expect(useScrollStore.getState().focusedVoyager).toBe(false)
  useScrollStore.getState().setPageProgress(1)
  voyagerState.opacity = 0
  click(640, 360)
  expect(useScrollStore.getState().focusedVoyager).toBe(false)
  voyagerState.opacity = 1
  voyagerState.available = false
  click(640, 360)
  expect(useScrollStore.getState().focusedVoyager).toBe(false)
})

it('voyager 命令只在模型可用的太阳系场景发出聚焦事件', () => {
  expect(executeCommand('voyager')).toContain('available after')
  Object.assign(voyagerState, { available: true })
  useScrollStore.setState({ scrollProgress: 1 })
  expect(executeCommand('voyager')).toContain('Focusing Voyager')
  expect(useScrollStore.getState().focusEvent).toEqual({ type: 'voyager' })
  useScrollStore.getState().setFocusedPlanet(1)
  expect(useScrollStore.getState().focusedVoyager).toBe(false)
  useScrollStore.getState().clearFocus('manual')
  useScrollStore.getState().setPageProgress(1.22)
  expect(executeCommand('voyager')).toContain('available after')
  expect(useScrollStore.getState().focusedVoyager).toBe(false)
})


it('近景只点击核心实体：悬杆与原包围球内部的空白均能退出', () => {
  const camera = new PerspectiveCamera(40, 1280 / 720)
  camera.updateMatrixWorld()
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1280, height: 720 } as DOMRect)
  context.value = { camera, gl: { domElement: canvas } }
  const material = new MeshBasicMaterial()
  const core = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), material)
  core.position.set(0, 0, -1); core.updateMatrixWorld()
  const boom = new Mesh(new BoxGeometry(0.3, 0.01, 0.01), material)
  boom.position.set(-0.2, 0.15, -1); boom.updateMatrixWorld()
  Object.assign(voyagerState, { available: true, opacity: 1, radius: 0.5, hitRadius: 0.1, hitTargets: [core] })
  voyagerState.position.copy(core.position)
  useScrollStore.setState({ scrollProgress: 1 })
  render(<PlanetClickHandler />)
  const click = (x: number, y: number) => canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y }))
  try {
    useScrollStore.getState().focusVoyager()
    click(640, 360)
    expect(useScrollStore.getState().focusedVoyager).toBe(true)
    const boomScreen = boom.position.clone().project(camera)
    click((boomScreen.x + 1) * 640, (1 - boomScreen.y) * 360)
    expect(useScrollStore.getState().focusedVoyager).toBe(false)
    useScrollStore.getState().focusVoyager()
    click(800, 420)
    expect(useScrollStore.getState().focusedVoyager).toBe(false)
  } finally { core.geometry.dispose(); boom.geometry.dispose(); material.dispose() }
})
