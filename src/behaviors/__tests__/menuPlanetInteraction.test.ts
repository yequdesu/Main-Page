import { afterEach, expect, it, vi } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, SphereGeometry, Vector3 } from 'three'
import { createMenuPlanetInteraction } from '../menuPlanetInteraction'
import { PLANET_LINKS } from '../../types'

afterEach(() => vi.restoreAllMocks())

function setup() {
  const canvas = document.createElement('canvas')
  canvas.style.cursor = 'crosshair'
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800 } as DOMRect)
  const camera = new PerspectiveCamera(40, 1)
  camera.position.z = 10
  camera.updateMatrixWorld()
  const geometry = new SphereGeometry(0.4, 16, 12), material = new MeshBasicMaterial()
  const planets = [-2, 0, 2].map(x => {
    const root = new Group(), core = new Mesh(geometry, material)
    root.position.x = x
    core.layers.set(1); root.add(core)
    return { root, targets: [core] }
  })
  const moon = new Mesh(geometry, material)
  moon.position.y = 1; moon.scale.setScalar(0.4); moon.layers.set(1)
  planets[1].root.add(moon); planets[1].targets.push(moon)
  // 可见光晕范围故意很大，但不进入实体命中列表。
  const halo = new Mesh(geometry, material)
  halo.scale.setScalar(4); halo.layers.set(1); planets[0].root.add(halo)
  let enabled = true
  const invalidate = vi.fn(), open = vi.spyOn(window, 'open').mockReturnValue(null)
  const controller = createMenuPlanetInteraction(canvas, camera, planets, () => enabled, invalidate)
  const screen = (world: Vector3) => {
    const p = world.clone().project(camera)
    return { clientX: (p.x + 1) * 400, clientY: (1 - p.y) * 400 }
  }
  const move = (point: Vector3) => canvas.dispatchEvent(new MouseEvent('pointermove', screen(point)))
  const click = (point: Vector3) => canvas.dispatchEvent(new MouseEvent('click', { ...screen(point), bubbles: true }))
  const advance = (frames = 30) => { for (let i = 0; i < frames; i++) controller.advance(1 / 60) }
  return { planets, moon, canvas, camera, controller, open, invalidate, move, click, advance,
    enable(value: boolean) { enabled = value },
    dispose() { controller.dispose(); geometry.dispose(); material.dispose() } }
}

it('Menu 实体悬停平滑至 120%，移动和离开连续恢复，附件随父节点缩放，光晕不抢占命中', () => {
  const s = setup()
  try {
    s.move(new Vector3(-2, 0, 0))
    expect(s.canvas.style.cursor).toBe('pointer')
    s.advance(4)
    const early = s.planets[0].root.scale.x
    expect(early).toBeGreaterThan(1); expect(early).toBeLessThan(1.2)
    s.advance()
    expect(s.planets[0].root.scale.x).toBeCloseTo(1.2)
    s.move(new Vector3(0, 1, 0)) // 卫星也使用主体链接及缩放。
    s.advance()
    expect(s.planets[0].root.scale.x).toBe(1)
    expect(s.planets[1].root.scale.x).toBeCloseTo(1.2)
    expect(s.moon.scale.x).toBe(0.4)
    s.canvas.dispatchEvent(new MouseEvent('pointerleave'))
    s.advance(4)
    expect(s.planets[1].root.scale.x).toBeGreaterThan(1)
    s.advance()
    expect(s.planets[1].root.scale.x).toBe(1)
    expect(s.canvas.style.cursor).toBe('crosshair')
    s.move(new Vector3(-2, 1, 0))
    s.advance()
    expect(s.planets.every(p => p.root.scale.x === 1)).toBe(true)
    expect(s.invalidate).toHaveBeenCalled()
  } finally { s.dispose() }
})

it('点击重新命中对应链接；空白、转场、隐藏行星及销毁后不导航，离场清理悬停', () => {
  const s = setup()
  try {
    for (let i = 0; i < 3; i++) {
      s.click(new Vector3([-2, 0, 2][i], 0, 0))
      expect(s.open).toHaveBeenLastCalledWith(PLANET_LINKS[i].url, '_blank', 'noopener')
    }
    s.click(new Vector3(0, 1, 0))
    expect(s.open).toHaveBeenLastCalledWith(PLANET_LINKS[1].url, '_blank', 'noopener')
    s.click(new Vector3(-2, 1, 0))
    expect(s.open).toHaveBeenCalledTimes(4)
    s.move(new Vector3(2, 0, 0)); s.advance()
    expect(s.planets[2].root.scale.x).toBeCloseTo(1.2)
    s.enable(false); s.controller.advance(0)
    expect(s.planets[2].root.scale.x).toBe(1)
    expect(s.canvas.style.cursor).toBe('crosshair')
    s.click(new Vector3(2, 0, 0))
    s.enable(true); s.planets[2].root.visible = false
    s.click(new Vector3(2, 0, 0))
    s.controller.dispose()
    s.move(new Vector3(0, 0, 0)); s.click(new Vector3(0, 0, 0))
    expect(s.open).toHaveBeenCalledTimes(4)
    expect(s.canvas.style.cursor).toBe('crosshair')
  } finally { s.dispose() }
})
