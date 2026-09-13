import { describe, expect, it, vi } from 'vitest'
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Texture,
  Vector3,
} from 'three'
import { cloneForViewport, fitCamera, indexScene, localBounds, nodeIsVisible } from '../studioModel'

describe('独立视口模型', () => {
  it('节点和材质独立，卸载时保留缓存几何体与贴图', () => {
    const geometry = new BoxGeometry()
    const texture = new Texture()
    const material = new MeshStandardMaterial({ map: texture })
    const source = new Group()
    source.add(new Mesh(geometry, material), new Mesh(geometry, [material, material]))
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const textureDispose = vi.spyOn(texture, 'dispose')
    const a = cloneForViewport(source),
      b = cloneForViewport(source)
    const meshA = a.root.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>
    const meshB = b.root.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>
    new Group().add(a.root)
    new Group().add(b.root)
    expect(a.root.parent).not.toBe(b.root.parent)
    meshA.material.wireframe = true
    expect(meshB.material.wireframe).toBe(false)
    expect(material.wireframe).toBe(false)
    expect(meshA.geometry).toBe(geometry)
    expect(meshA.material.map).toBe(texture)
    const cloneDispose = vi.spyOn(meshA.material, 'dispose')
    a.dispose()
    expect(cloneDispose).toHaveBeenCalledTimes(1)
    expect(geometryDispose).not.toHaveBeenCalled()
    expect(materialDispose).not.toHaveBeenCalled()
    expect(textureDispose).not.toHaveBeenCalled()
    b.dispose()
    geometry.dispose()
    material.dispose()
    texture.dispose()
  })
  it('模型归一化不受上层变换影响', () => {
    const parent = new Group(),
      root = new Group()
    const mesh = new Mesh(new BoxGeometry(2, 4, 6))
    mesh.position.set(4, 2, 0)
    root.add(mesh)
    parent.add(root)
    parent.position.set(300, 15, -200)
    parent.rotation.set(0.4, 1.2, 0)
    parent.scale.setScalar(8)
    const bounds = localBounds(root)
    expect(bounds.getCenter(new Vector3()).distanceTo(new Vector3(4, 2, 0))).toBeLessThan(1e-8)
    expect(bounds.getSize(new Vector3()).distanceTo(new Vector3(2, 4, 6))).toBeLessThan(1e-8)
    mesh.geometry.dispose()
  })
  it('路径标识跨实例一致，隐藏与隔离保留祖先路径', () => {
    const root = new Group(),
      child = new Group()
    child.add(new Group())
    root.add(child, new Group())
    expect([...indexScene(root).objects.keys()]).toEqual([...indexScene(root.clone(true)).objects.keys()])
    expect(nodeIsVisible('0.0', ['0'], null)).toBe(false)
    expect(nodeIsVisible('0', [], '0.0')).toBe(true)
    expect(nodeIsVisible('0.0.1', [], '0.0')).toBe(true)
    expect(nodeIsVisible('1', [], '0.0')).toBe(false)
    expect(nodeIsVisible('0.01', ['0.0'], null)).toBe(true)
  })
})

describe('自动取景', () => {
  it('临时空包围盒不会破坏已有相机姿态', () => {
    const camera = new PerspectiveCamera(45)
    camera.position.set(5, 3, 8)
    const position = camera.position.clone()
    expect(fitCamera(camera, new Box3(), 1, new Vector3(5, 3, 8))).toBeNull()
    expect(camera.position.equals(position)).toBe(true)
  })
  it('无效观察方向能恢复到有效取景', () => {
    const camera = new PerspectiveCamera(45)
    const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1))
    fitCamera(camera, box, 1, new Vector3(NaN, NaN, NaN))
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true)
    expect(camera.position.length()).toBeGreaterThan(1)
  })
  for (const aspect of [0.45, 1, 2.2])
    for (const orthographic of [false, true]) {
      it(`包围盒所有角点处于 ${aspect} ${orthographic ? '正交' : '透视'} 视锥内`, () => {
        const camera = orthographic ? new OrthographicCamera() : new PerspectiveCamera(45)
        const box = new Box3(new Vector3(-7, -2, -1), new Vector3(3, 5, 4))
        fitCamera(camera, box, aspect, new Vector3(5, 3, 8))
        camera.updateMatrixWorld()
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const point = new Vector3(x, y, z).project(camera)
              expect(Math.abs(point.x)).toBeLessThan(1)
              expect(Math.abs(point.y)).toBeLessThan(1)
              expect(Math.abs(point.z)).toBeLessThan(1)
            }
      })
    }
})
