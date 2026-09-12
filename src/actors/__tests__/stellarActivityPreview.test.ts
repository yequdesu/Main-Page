import { expect, it, vi } from 'vitest'
import { Mesh, ShaderMaterial } from 'three'
import { createStellarActivity } from '../assets/stellarActivity'
import { createStellarActivityChannels } from '../../behaviors/stellarActivity'
import { getStructureLayout } from '../../behaviors/structureLayout'
import { createFluxRopeSimulation } from '../../behaviors/stellarPlasma'

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

it('CME 对照只切换显示，回退清除逸散历史且复用/释放粒子与雾资源', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  Object.assign(channels.cme, { opacity: 1, seed: 0.47, age: 9 })
  const particles = asset.root.getObjectByName('CME 闭环逸散粒子') as Mesh<never, ShaderMaterial>
  const mist = asset.root.getObjectByName('CME 逸散薄雾') as Mesh<never, ShaderMaterial>
  const pGeometry = vi.spyOn(particles.geometry, 'dispose'), pMaterial = vi.spyOn(particles.material, 'dispose')
  const mGeometry = vi.spyOn(mist.geometry, 'dispose'), mMaterial = vi.spyOn(mist.material, 'dispose')
  try {
    asset.layoutLocal(800, 500, 6); asset.update()
    expect(particles.material.uniforms.uFirstClosure.value).toBe(Math.min(...particles.material.uniforms.uClosureTimes.value))
    const cloudCenter = mist.material.uniforms.uMistCenter.value.toArray()
    const mistKernels = (mist.geometry as import('three').InstancedBufferGeometry).getAttribute('aMist')
    const expectedKernels = mistKernels.array.slice()
    expect(mistKernels.getX(0)).toBeGreaterThan(0)
    const geometry = particles.geometry as import('three').InstancedBufferGeometry
    const position = geometry.getAttribute('aCenter'), expected = position.array.slice()
    asset.setEjectionAppearance(false); asset.update()
    expect(particles.material.uniforms.uEjection.value).toBe(0)
    expect(position.array).toEqual(expected)
    asset.setEjectionAppearance(true, 0); asset.update()
    expect(particles.material.uniforms.uEjection.value).toBe(1)
    expect(mist.material.uniforms.uMistStrength.value).toBe(0)
    channels.cme.age = 6; asset.update()
    expect(particles.material.uniforms.uClosureTimes.value.every((t: number) => t < 0)).toBe(true)
    expect(particles.material.uniforms.uFirstClosure.value).toBe(-1)
    expect(mist.material.uniforms.uMistCenter.value.toArray()).toEqual([0, 0, 0])
    for (let i = 0; i < mistKernels.count; i++) expect(mistKernels.getZ(i)).toBe(0)
    expect(mist.material.uniforms.uMistAge.value).toBe(0)
    const life = geometry.getAttribute('aLife')
    for (let i = 0; i < life.count; i++) expect(life.getX(i)).toBe(-1)
    channels.cme.age = 9; asset.update()
    expect(position.array).toEqual(expected)
    expect(mist.material.uniforms.uMistCenter.value.toArray()).toEqual(cloudCenter)
    expect(mistKernels.array).toEqual(expectedKernels)
    for (const mesh of [particles, mist]) {
      expect(mesh.material.depthWrite).toBe(false)
      expect(mesh.material.depthTest).toBe(true)
      expect(mesh.material.transparent).toBe(true)
    }
  } finally { asset.dispose() }
  for (const spy of [pGeometry, pMaterial, mGeometry, mMaterial]) expect(spy).toHaveBeenCalledTimes(1)
})

it('稀释颗粒仍覆盖全部流线，保留薄雾样本，并与磁拱环共用颜色', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  Object.assign(channels.cme, { opacity: 1, seed: 0.47, age: 8 })
  const reference = createFluxRopeSimulation(0.47, true)
  reference.advanceTo(8)
  const particles = asset.root.getObjectByName('CME 闭环逸散粒子') as Mesh<import('three').InstancedBufferGeometry, ShaderMaterial>
  const mist = asset.root.getObjectByName('CME 逸散薄雾') as Mesh<import('three').InstancedBufferGeometry, ShaderMaterial>
  const arc = asset.root.getObjectByName('日冕抛射弧丝') as Mesh<never, ShaderMaterial>
  try {
    asset.layoutLocal(800, 500, 6); asset.update()
    expect(particles.geometry.instanceCount).toBe(reference.ejection!.particleEnabled.reduce((sum, enabled) => sum + enabled, 0))
    expect(particles.geometry.instanceCount).toBeLessThan(192)
    expect(mist.geometry.instanceCount).toBe(96)
    const life = particles.geometry.getAttribute('aLife')
    const coverage = new Array(12).fill(0)
    for (let i = 0; i < particles.geometry.instanceCount; i++) coverage[life.getW(i)]++
    expect(coverage.every(count => count >= 8 && count <= 16)).toBe(true)
    const pointPosition = particles.geometry.getAttribute('aCenter')
    let instance = 0
    for (let i = 0; i < reference.ejection!.particleEnabled.length; i++) {
      if (!reference.ejection!.particleEnabled[i]) continue
      expect([pointPosition.getX(instance), pointPosition.getY(instance), pointPosition.getZ(instance)])
        .toEqual(Array.from(reference.ejection!.positions.slice(i * 3, i * 3 + 3)))
      instance++
    }
    const fogPosition = mist.geometry.getAttribute('aCenter')
    for (let i = 0; i < fogPosition.count; i++) {
      // 减少可见颗粒后，仍逐点保持原先每六个外流样本生成一个雾片的轨迹。
      expect([fogPosition.getX(i), fogPosition.getY(i), fogPosition.getZ(i)])
        .toEqual(Array.from(reference.ejection!.positions.slice(i * 18, i * 18 + 3)))
    }
    expect(particles.material.uniforms.uColor).toBe(arc.material.uniforms.uColor)
  } finally { asset.dispose() }
})

it('释放后交接长寿命尾迹，缩放不重选，时间回退可重放', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  Object.assign(channels.cme, { opacity: 1, seed: 0.47, age: 10 })
  const particles = asset.root.getObjectByName('CME 闭环逸散粒子') as Mesh<import('three').InstancedBufferGeometry, ShaderMaterial>
  const tail = asset.root.getObjectByName('CME 长寿命尾迹') as Mesh<import('three').InstancedBufferGeometry, ShaderMaterial>
  const mist = asset.root.getObjectByName('CME 逸散薄雾') as Mesh<import('three').InstancedBufferGeometry, ShaderMaterial>
  const disposeGeometry = vi.spyOn(tail.geometry, 'dispose'), disposeMaterial = vi.spyOn(tail.material, 'dispose')
  try {
    asset.layoutLocal(800, 500, 6); asset.update()
    expect(particles.geometry.instanceCount).toBe(0)
    expect(tail.geometry.instanceCount).toBeGreaterThanOrEqual(4)
    expect(tail.geometry.instanceCount).toBeLessThanOrEqual(16)
    expect(mist.geometry.instanceCount).toBe(96)
    const count = tail.geometry.instanceCount, positions = tail.geometry.getAttribute('aCenter').array.slice(0, count * 3)
    asset.layoutLocal(800, 500, 3); asset.update()
    expect(tail.geometry.instanceCount).toBe(count)
    expect(tail.geometry.getAttribute('aCenter').array.slice(0, count * 3)).toEqual(positions)
    channels.cme.age = 8; asset.update()
    expect(particles.geometry.instanceCount).toBeGreaterThan(150)
    expect(tail.geometry.instanceCount).toBe(0)
    channels.cme.age = 10; asset.update()
    expect(tail.geometry.getAttribute('aCenter').array.slice(0, count * 3)).toEqual(positions)
    asset.setEjectionAppearance(false); expect(tail.visible).toBe(false)
    asset.setEjectionAppearance(true); expect(tail.visible).toBe(true)
    channels.cme.age = 120; channels.cme.opacity = 0; asset.update()
    expect(tail.geometry.instanceCount).toBe(count)
    const replay = tail.geometry.getAttribute('aCenter').array.slice(0, count * 3)
    expect(replay).not.toEqual(positions)
    channels.cme.age = 6; asset.update()
    expect(tail.geometry.instanceCount).toBe(0)
    channels.cme.age = 120; asset.update()
    expect(tail.geometry.getAttribute('aCenter').array.slice(0, count * 3)).toEqual(replay)
    channels.cme.age = 313; asset.update()
    expect(tail.geometry.instanceCount).toBe(0)
  } finally { asset.dispose() }
  expect(disposeGeometry).toHaveBeenCalledTimes(1)
  expect(disposeMaterial).toHaveBeenCalledTimes(1)
})

it('喷发结束和下一次同种子事件不清空尾迹，300 秒到期后按批次回收', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  const tail = asset.root.getObjectByName('CME 长寿命尾迹') as Mesh<import('three').InstancedBufferGeometry, ShaderMaterial>
  const tick = (time: number, age: number, opacity: number) => {
    channels.time = time; Object.assign(channels.cme, { age, opacity }); asset.update()
  }
  try {
    asset.layout(getStructureLayout(16 / 9), 1280, 720)
    Object.assign(channels.cme, { seed: 0.47, serial: 1 })
    tick(10, 10, 1)
    const firstCount = tail.geometry.instanceCount
    tick(20, 20, 0)
    expect(tail.geometry.instanceCount).toBe(firstCount)
    channels.cme.serial = 2
    tick(21, 0, 0)
    expect(tail.geometry.instanceCount).toBe(firstCount)
    tick(31, 10, 1)
    expect(tail.geometry.instanceCount).toBe(firstCount * 2)
    tick(100, 79, 0)
    expect(tail.geometry.instanceCount).toBe(firstCount * 2)
    const paused = tail.geometry.getAttribute('aCenter').array.slice()
    asset.update(); expect(tail.geometry.getAttribute('aCenter').array).toEqual(paused)
    tick(319, 298, 0)
    expect(tail.geometry.instanceCount).toBe(firstCount)
    tick(332, 311, 0)
    expect(tail.geometry.instanceCount).toBe(0)
  } finally { asset.dispose() }
})
