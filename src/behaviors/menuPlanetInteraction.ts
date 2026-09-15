import { gsap } from 'gsap'
import { Raycaster, Vector2, type Camera, type Group, type Mesh, type Intersection } from 'three'
import { STRUCTURE_LAYOUT } from './structureLayout'
import { PLANET_LINKS } from '../types'

export const MENU_PLANET_HOVER_SCALE = 1.2
const HOVER_DURATION = 0.24

/** Menu 独占：仅命中实体网格，悬停使用由 R3F 推进的暂停时间轴。 */
export function createMenuPlanetInteraction(
  canvas: HTMLCanvasElement,
  camera: Camera,
  planets: readonly { root: Group; targets: Mesh[] }[],
  enabled: () => boolean,
  invalidate: () => void,
) {
  const raycaster = new Raycaster(), ndc = new Vector2()
  raycaster.layers.set(STRUCTURE_LAYOUT.layer)
  const targets = planets.flatMap(planet => planet.targets)
  const owners = new Map(targets.map(target => [target, planets.findIndex(planet => planet.targets.includes(target))]))
  const hits: Intersection[] = []
  let hovered = -1, inside = false, clientX = 0, clientY = 0
  let timeline: gsap.core.Timeline | null = null
  let previousCursor: string | null = null

  const restoreCursor = () => {
    if (previousCursor !== null) {
      if (canvas.style.cursor === 'pointer') canvas.style.cursor = previousCursor
      previousCursor = null
    }
  }
  const pick = (x: number, y: number) => {
    if (!enabled()) return -1
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return -1
    ndc.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2)
    camera.updateWorldMatrix(true, false)
    for (const planet of planets) planet.root.updateWorldMatrix(true, true)
    raycaster.setFromCamera(ndc, camera)
    hits.length = 0
    raycaster.intersectObjects(targets, false, hits)
    for (const hit of hits) {
      const index = owners.get(hit.object as Mesh)!
      if (planets[index].root.visible && hit.object.visible) return index
    }
    // 卫星/环随放大向外移动，保留原尺寸命中区，避免边缘触发反复放大/缩回。
    if (hovered >= 0 && planets[hovered].root.visible) {
      const planet = planets[hovered], scale = planet.root.scale.x
      planet.root.scale.setScalar(1)
      planet.root.updateWorldMatrix(true, true)
      hits.length = 0
      raycaster.intersectObjects(planet.targets, false, hits)
      planet.root.scale.setScalar(scale)
      planet.root.updateWorldMatrix(true, true)
      if (hits.some(hit => hit.object.visible)) return hovered
    }
    return -1
  }
  const hover = (index: number) => {
    if (hovered === index) return
    hovered = index
    timeline?.kill()
    timeline = gsap.timeline({ paused: true })
    planets.forEach((planet, i) => {
      const scale = i === index ? MENU_PLANET_HOVER_SCALE : 1
      timeline!.to(planet.root.scale, { x: scale, y: scale, z: scale, duration: HOVER_DURATION, ease: 'power2.out' }, 0)
    })
    if (index >= 0) {
      previousCursor ??= canvas.style.cursor
      canvas.style.cursor = 'pointer'
    } else restoreCursor()
    invalidate()
  }
  const reset = () => {
    timeline?.kill(); timeline = null
    hovered = -1
    planets.forEach(planet => planet.root.scale.setScalar(1))
    restoreCursor()
  }
  const move = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    inside = true; clientX = event.clientX; clientY = event.clientY
    hover(pick(clientX, clientY))
  }
  const leave = () => { inside = false; hover(-1) }
  const click = (event: MouseEvent) => {
    if (event.button !== 0) return
    const index = pick(event.clientX, event.clientY)
    if (index < 0) return
    event.stopPropagation()
    window.open(PLANET_LINKS[index].url, '_blank', 'noopener')
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerleave', leave)
  canvas.addEventListener('pointercancel', leave)
  canvas.addEventListener('click', click)
  window.addEventListener('blur', leave)
  return {
    advance(delta: number) {
      if (!enabled()) { reset(); return }
      // 附件和相机仍在运动；指针静止时也使用当前世界矩阵重新命中。
      hover(inside ? pick(clientX, clientY) : -1)
      if (timeline) {
        timeline.totalTime(Math.min(timeline.duration(), timeline.time() + Math.min(0.1, Math.max(0, delta))))
        if (timeline.progress() === 1) { timeline.kill(); timeline = null }
      }
    },
    dispose() {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointercancel', leave)
      canvas.removeEventListener('click', click)
      window.removeEventListener('blur', leave)
      reset()
    },
  }
}
