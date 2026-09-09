import {
  Box3,
  Matrix4,
  Mesh,
  Sprite,
  Material,
  Object3D,
  PerspectiveCamera,
  OrthographicCamera,
  Sphere,
  Vector3,
} from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { SceneTreeNode } from './studioTypes'

// GLTF 缓存拥有几何体/贴图；每个视口只拥有自己的节点、骨骼和材质。
export function cloneForViewport(source: Object3D) {
  const root = clone(source)
  const materials = new Map<Material, Material>()
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return
    const copy = (m: Material) => {
      if (!materials.has(m)) materials.set(m, m.clone())
      return materials.get(m)!
    }
    child.material = Array.isArray(child.material) ? child.material.map(copy) : copy(child.material)
  })
  return { root, dispose: () => materials.forEach((m) => m.dispose()) }
}

export function indexScene(root: Object3D) {
  const objects = new Map<string, Object3D>()
  function visit(object: Object3D, id: string): SceneTreeNode {
    objects.set(id, object)
    object.userData.studioNodeId = id
    object.userData.studioInitialVisible = object.visible
    return {
      id,
      name: object.name || `${object.type} ${id.split('.').slice(-1)[0]}`,
      type: object.type,
      children: object.children.map((child, i) => visit(child, `${id}.${i}`)),
    }
  }
  const tree = root.children.map((child, i) => visit(child, String(i)))
  return { objects, tree }
}

// 在模型自己的坐标系测量，避免已有平移、缩放和旋转污染归一化。
export function localBounds(root: Object3D) {
  root.updateWorldMatrix(true, true)
  const inverse = root.matrixWorld.clone().invert()
  const box = new Box3()
  const transform = new Matrix4()
  function visit(object: Object3D) {
    transform.multiplyMatrices(inverse, object.matrixWorld)
    const envelope = object.userData.studioBounds
    if (envelope instanceof Box3) {
      box.union(envelope.clone().applyMatrix4(transform))
      return
    }
    if (object instanceof Mesh || object instanceof Sprite) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
      if (object.geometry.boundingBox) box.union(object.geometry.boundingBox.clone().applyMatrix4(transform))
    }
    object.children.forEach(visit)
  }
  visit(root)
  return box
}

export function nodeIsVisible(id: string, hidden: string[], isolated: string | null) {
  if (hidden.some((parent) => id === parent || id.startsWith(`${parent}.`))) return false
  return !isolated || id === isolated || id.startsWith(`${isolated}.`) || isolated.startsWith(`${id}.`)
}

export function fitCamera(
  camera: PerspectiveCamera | OrthographicCamera,
  box: Box3,
  aspect: number,
  direction: Vector3,
) {
  // 热更新/卸载过程中可能短暂没有几何体，不能将 Infinity 写入相机。
  if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) return null
  const sphere = box.getBoundingSphere(new Sphere())
  const radius = Math.max(sphere.radius, 0.01)
  const center = sphere.center
  const backward = direction.clone()
  if (!backward.toArray().every(Number.isFinite) || backward.lengthSq() < 1e-12) backward.set(5, 3, 8)
  backward.normalize()
  const right = new Vector3().crossVectors(camera.up, backward).normalize()
  const up = new Vector3().crossVectors(backward, right).normalize()
  const corners = []
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const offset = new Vector3(x, y, z).sub(center)
        corners.push({ x: Math.abs(offset.dot(right)), y: Math.abs(offset.dot(up)), z: offset.dot(backward) })
      }
  let distance = radius * 4
  if (camera instanceof PerspectiveCamera) {
    camera.aspect = Math.max(aspect, 0.01)
    const vertical = (camera.fov * Math.PI) / 360
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
    distance =
      Math.max(
        radius * 0.1,
        ...corners.map((p) => p.z + Math.max(p.x / Math.tan(horizontal), p.y / Math.tan(vertical))),
      ) * 1.15
  } else {
    const halfH = Math.max(0.01, ...corners.map((p) => Math.max(p.y, p.x / aspect))) * 1.15
    camera.top = halfH
    camera.bottom = -halfH
    camera.left = -halfH * aspect
    camera.right = halfH * aspect
    camera.zoom = 1
  }
  camera.position.copy(center).addScaledVector(backward, distance)
  camera.near = Math.max(0.001, radius / 1000)
  camera.far = Math.max(1000, distance + radius * 10)
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  return center
}
