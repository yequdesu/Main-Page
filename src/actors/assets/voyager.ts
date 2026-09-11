import { Box3, Group, Material, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'

/** 模型语义节点白名单：只包括天线、馈源、中央支架和主体基座。 */
export const VOYAGER_CORE_NODES = [
  'Cylinder.001_Material.007_0', 'Cylinder.003_Material.001_0', 'Cylinder.011_Material.002_0',
  'Sphere.001_Material.001_0', 'Retopo_Sphere_Material.002_0.001',
  'Retopo_Cylinder_Material.003_0', 'Retopo_Sphere.002_Material.004_0',
  'Retopo_Sphere.002_Material.004_0.001', 'Retopo_Cylinder.004_Material.004_0',
] as const

/** 缓存 GLB 的节点/材质独立克隆；几何体与贴图继续由加载缓存共享。 */
export function createVoyagerAsset(source: Object3D, size: number) {
  const model = source.clone(true)
  const materials = new Map<Material, Material>()
  model.traverse(object => {
    if (!(object instanceof Mesh)) return
    const clone = (original: Material) => {
      if (!materials.has(original)) {
        const material = original.clone()
        material.transparent = true
        material.depthTest = true
        material.depthWrite = false
        if (material instanceof MeshStandardMaterial) {
          material.emissive.copy(material.color)
          material.emissiveIntensity = 0.08
        }
        materials.set(original, material)
      }
      return materials.get(original)!
    }
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material)
    object.renderOrder = 1
  })
  const box = new Box3().setFromObject(model)
  const dimensions = box.getSize(new Vector3())
  const coreBox = new Box3()
  const hitTargets: Mesh[] = []
  const coreNames = new Set<string>(VOYAGER_CORE_NODES)
  model.traverse(part => {
    // GLTFLoader 会清理 name 中的句点，原始 glTF 节点名保留在 userData.name。
    if (!(part instanceof Mesh) || !coreNames.has(part.userData.name ?? part.name)) return
    coreBox.union(new Box3().setFromObject(part, true))
    hitTargets.push(part)
  })
  // 真实 GLB 的核心中心约为 (0.07769, 1.89051, 0.17659)；加载时随几何体重新核算。
  // 无语义节点的测试/替代资产以整体中心兜底，但不会将附件加入点击白名单。
  if (coreBox.isEmpty()) coreBox.copy(box)
  const pivot = coreBox.getCenter(new Vector3())
  const scale = size / Math.max(dimensions.x, dimensions.y, dimensions.z, 1e-6)
  let radius = 0
  const point = new Vector3()
  model.traverse(object => {
    if (!(object instanceof Mesh)) return
    const positions = object.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld)
      radius = Math.max(radius, point.distanceTo(pivot))
    }
  })
  model.position.sub(pivot)
  const root = new Group()
  root.name = 'Voyager 1 · Low Poly'
  root.add(model)
  root.scale.setScalar(scale)
  return {
    root,
    center: new Vector3(),
    sourceCenter: pivot,
    radius: radius * scale,
    hitRadius: coreBox.getSize(new Vector3()).length() * scale / 2,
    hitTargets,
    setOpacity(opacity: number) {
      materials.forEach((material, original) => {
        material.opacity = original.opacity * opacity
        material.depthWrite = opacity > 0.99 && original.depthWrite
      })
    },
    dispose() { materials.forEach(material => material.dispose()) },
  }
}
