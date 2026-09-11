import { expect, it, vi } from 'vitest'
import { Mesh, ShaderMaterial } from 'three'
import { createStellarActivity } from '../assets/stellarActivity'
import { createStellarActivityChannels } from '../../behaviors/stellarActivity'
import { getStructureLayout } from '../../behaviors/structureLayout'

it('局部预览复用路径和材质，换类型/回退重建模型，恢复场景布局且释放资源', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  Object.assign(channels.prominences[0], { opacity: 1, age: 0, seed: 0.47, morphology: 'nested' })
  const mesh = asset.root.getObjectByName('日珥弧丝_0') as Mesh<never, ShaderMaterial>
  const u = mesh.material.uniforms, texture = u.uCurves.value
  const dispose = vi.spyOn(texture, 'dispose')
  try {
    asset.layoutLocal(800, 400, 2.5); asset.update()
    expect(u.uAnchor.value.toArray()).toEqual([0, 0, 0])
    expect(u.uTangent.value.toArray()).toEqual([1, 0, 0])
    expect(u.uNormal.value.toArray()).toEqual([0, 1, 0])
    expect(u.uScale.value).toBe(1)
    expect(u.uUnitPixels.value).toBe(160)
    const initial = texture.image.data.slice()
    channels.prominences[0].age = 1; asset.update()
    expect(texture.image.data).not.toEqual(initial)
    channels.prominences[0].age = 0; asset.update()
    expect(texture.image.data).toEqual(initial)
    channels.prominences[0].morphology = 'cluster'; asset.update()
    expect(texture.image.data).not.toEqual(initial)
    expect(u.uCurves.value).toBe(texture)
    const layout = getStructureLayout(1280 / 720)
    asset.layout(layout); asset.update()
    expect(u.uRadius.value).toBe(layout.sunRadius)
    expect(u.uAnchor.value.length()).toBeGreaterThan(0)
  } finally { asset.dispose() }
  expect(dispose).toHaveBeenCalledTimes(1)
})
