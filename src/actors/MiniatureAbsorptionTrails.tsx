import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, DoubleSide, MeshBasicMaterial, Vector3, type Camera } from 'three'
import { getCircleConnector, smootherstep } from '../behaviors/motionTrail'
import { buildParticleField, buildFieldScans, getFieldParticleState, selectScanMembers, CUBE_BOUND_RADIUS, FIELD_SCAN_END,
  type ProjectedFieldCircle } from '../behaviors/miniatureParticleField'
import { getMiniatureTransform, MINIATURE_PIVOT } from '../behaviors/miniatureUniverse'
import { useScrollStore } from '../stores/scrollStore'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { getParticleScanCanvas } from './MiniatureParticleScan'

const SEGMENTS = 24, SAMPLES = 12
const CAPACITY = 240 * SAMPLES * (SEGMENTS * 3 + 6)
const pivot = new Vector3(...MINIATURE_PIVOT)
const directions = Array.from({ length: SEGMENTS + 1 }, (_, i) =>
  [Math.cos(i * Math.PI * 2 / SEGMENTS), Math.sin(i * Math.PI * 2 / SEGMENTS)])

export default function MiniatureAbsorptionTrails() {
  const sceneCamera = useThree(state => state.camera)
  const selectionCamera = useMemo(() => {
    const camera = sceneCamera.clone()
    camera.position.set(0, 0.25, 8)
    camera.lookAt(pivot)
    camera.updateMatrixWorld(true)
    return camera
  }, [sceneCamera])
  const selections = useMemo(() => new Map<number, number[]>(), [])
  const selectionViewport = useMemo(() => ({ width: 0, height: 0, projection: '' }), [])
  const field = useMemo(() => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1
    return { particles: buildParticleField(seed), scans: buildFieldScans(seed) }
  }, [])
  const layer = getWebglLayer('webgl.miniatureAbsorptionTrails')
  const resources = useMemo(() => {
    const geometry = new BufferGeometry()
    const position = new BufferAttribute(new Float32Array(CAPACITY * 3), 3)
    position.setUsage(DynamicDrawUsage)
    geometry.setAttribute('position', position)
    geometry.setDrawRange(0, 0)
    const material = new MeshBasicMaterial({ color: '#f2f6ff', side: DoubleSide,
      transparent: true, depthTest: true, depthWrite: false, toneMapped: false, fog: false })
    return { geometry, position, material }
  }, [])
  const scratch = useMemo(() => ({
    right: new Vector3(), up: new Vector3(), forward: new Vector3(), point: new Vector3(),
    projected: new Vector3(), radiusPoint: new Vector3(), center: new Vector3(),
    relative: new Vector3(), ray: new Vector3(), projectForward: new Vector3(), projectRight: new Vector3(),
    samples: Array.from({ length: 2 }, () => ({
      point: { x: 0, y: 0 }, radius: 0, world: new Vector3(),
    })),
  }), [])
  useActorRuntime('miniatureAbsorptionTrails', true)
  useEffect(() => () => { resources.geometry.dispose(); resources.material.dispose() }, [resources])

  useFrame(({ camera, clock, gl }) => {
    const sp = useScrollStore.getState().scrollProgress
    const canvas = getParticleScanCanvas()
    const ctx = canvas?.getContext('2d')
    const rect = gl.domElement.getBoundingClientRect()
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height)
    const projectionKey = camera.projectionMatrix.elements.join(',')
    if (selectionViewport.width !== width || selectionViewport.height !== height || selectionViewport.projection !== projectionKey) {
      selections.clear()
      Object.assign(selectionViewport, { width, height, projection: projectionKey })
      selectionCamera.projectionMatrix.copy(camera.projectionMatrix)
      selectionCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
    }
    if (canvas && ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }
    if (sp < 0.25 || sp >= 0.648) {
      resources.geometry.setDrawRange(0, 0)
      touchActorFrame('miniatureAbsorptionTrails', Math.round(clock.elapsedTime * 60), false)
      return
    }
    const { right, up, forward, point, projected, radiusPoint, center, relative, ray } = scratch
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    camera.getWorldDirection(forward)
    const scale = getMiniatureTransform(sp).scale
    let count = 0
    const emit = (x: number, y: number, z: number) => {
      resources.position.setXYZ(count++, x, y, z)
    }
    const circleVertex = (c: Vector3, x: number, y: number) =>
      emit(c.x + right.x * x + up.x * y, c.y + right.y * x + up.y * y, c.z + right.z * x + up.z * y)
    const projectField = (at: number, targetCamera: Camera): ProjectedFieldCircle[] => {
      const result: ProjectedFieldCircle[] = []
      const atScale = getMiniatureTransform(at).scale
      targetCamera.getWorldDirection(scratch.projectForward)
      scratch.projectRight.setFromMatrixColumn(targetCamera.matrixWorld, 0)
      for (const p of field.particles) {
        if (at >= p.start) continue
        point.set(...p.offset).multiplyScalar(atScale).add(pivot)
        relative.copy(point).sub(targetCamera.position)
        if (relative.dot(scratch.projectForward) <= 0) continue
        // Conservative cube occlusion prevents selecting hidden particles.
        ray.copy(relative).normalize()
        center.copy(pivot).sub(targetCamera.position)
        const along = center.dot(ray)
        const hidden = along > 0 && along < relative.length() &&
          center.lengthSq() - along * along < (CUBE_BOUND_RADIUS * atScale) ** 2
        if (hidden) continue
        projected.copy(point).project(targetCamera)
        radiusPoint.copy(point).addScaledVector(scratch.projectRight, p.radius * atScale).project(targetCamera)
        const radius = Math.abs(radiusPoint.x - projected.x) * width / 2
        const x = rect.left + (projected.x + 1) * width / 2
        const y = rect.top + (1 - projected.y) * height / 2
        if (x - radius < rect.left || x + radius > rect.right ||
          y - radius < rect.top || y + radius > rect.bottom) continue
        result.push({ id: p.id, x, y, radius })
      }
      return result
    }
    for (const p of field.particles) {
      const head = getFieldParticleState(p, sp)
      if (head.radius <= 0) continue
      const samples = sp <= p.start ? 1 : SAMPLES
      let previous: { point: { x: number; y: number }; radius: number; world: Vector3 } | null = null
      // Short history in logical space; parent scale applies to the whole history.
      for (let i = 0; i < samples; i++) {
        const lag = samples === 1 ? 0 : (samples - 1 - i) / (samples - 1)
        const sampleSp = Math.max(p.start, sp - lag * 0.004)
        const state = getFieldParticleState(p, sampleSp)
        const radius = Math.min(state.radius, head.radius) * scale * (1 - lag)
        if (radius <= 0.00001) continue
        point.set(...p.offset).multiplyScalar(scale * (1 - state.travel)).add(pivot)
        // Camera-facing disks at their true world depth.
        const current = scratch.samples[i % 2]
        current.point.x = point.dot(right)
        current.point.y = point.dot(up)
        current.radius = radius
        current.world.copy(point)
        if (previous) {
          const connector = getCircleConnector(previous, current)
          if (connector) {
            const corner = (q: { x: number; y: number }, base: typeof current) =>
              circleVertex(base.world, q.x - base.point.x, q.y - base.point.y)
            corner(connector.firstPositive, previous); corner(connector.secondPositive, current); corner(connector.secondNegative, current)
            corner(connector.firstPositive, previous); corner(connector.secondNegative, current); corner(connector.firstNegative, previous)
          }
        }
        for (let j = 0; j < SEGMENTS; j++) {
          circleVertex(point, 0, 0)
          circleVertex(point, directions[j][0] * radius, directions[j][1] * radius)
          circleVertex(point, directions[j + 1][0] * radius, directions[j + 1][1] * radius)
        }
        previous = current
      }
    }
    resources.geometry.setDrawRange(0, count)
    resources.position.needsUpdate = count > 0
    touchActorFrame('miniatureAbsorptionTrails', Math.round(clock.elapsedTime * 60), count > 0)
    if (ctx && sp >= 0.4 && sp < FIELD_SCAN_END) {
      const visible = projectField(sp, camera)
      const cube = center.copy(pivot).project(camera)
      const cx = rect.left + (cube.x + 1) * width / 2, cy = rect.top + (1 - cube.y) * height / 2
      let concurrent = 0
      for (const event of field.scans) {
        if (sp < event.start || sp >= event.end || concurrent >= 9) continue
        let ids = selections.get(event.id)
        if (!ids) {
          ids = selectScanMembers(projectField(event.start, selectionCamera), event.selection)
          selections.set(event.id, ids)
        }
        const members = visible.filter(p => ids.includes(p.id))
        if (!members.length) continue
        concurrent++
        const x = Math.min(...members.map(p => p.x - p.radius)) - 6
        const y = Math.min(...members.map(p => p.y - p.radius)) - 6
        const w = Math.max(...members.map(p => p.x + p.radius)) + 6 - x
        const h = Math.max(...members.map(p => p.y + p.radius)) + 6 - y
        const actual = visible.filter(p => p.x - p.radius >= x && p.x + p.radius <= x + w &&
          p.y - p.radius >= y && p.y + p.radius <= y + h)
        const t = (sp - event.start) / (event.end - event.start)
        ctx.globalAlpha = smootherstep(Math.min(1, t / 0.12)) * (1 - smootherstep(Math.max(0, (t - 0.78) / 0.22)))
        ctx.strokeStyle = '#cbd5e1'; ctx.fillStyle = '#cbd5e1'; ctx.lineWidth = 0.8
        ctx.strokeRect(x, y, w, h)
        ctx.beginPath(); ctx.moveTo(x + w / 2, y + h / 2); ctx.lineTo(cx, cy); ctx.stroke()
        ctx.font = '10px ui-monospace, Consolas, monospace'
        const label = 'REGION ' + String(event.id + 1).padStart(2, '0') + ' | N=' + actual.length +
          ' | AVG=' + (actual.reduce((sum, p) => sum + p.radius * 2, 0) / actual.length).toFixed(1) + 'px'
        ctx.fillText(label, Math.max(8, Math.min(window.innerWidth - ctx.measureText(label).width - 8, x)),
          Math.max(12, y - 7))
      }
      ctx.globalAlpha = 1
    }
  })
  return <mesh geometry={resources.geometry} material={resources.material} renderOrder={layer.renderOrder}
    frustumCulled={false} raycast={() => {}} />
}
