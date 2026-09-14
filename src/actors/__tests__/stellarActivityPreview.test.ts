import { expect, it, vi } from 'vitest'
import { Mesh, PerspectiveCamera, ShaderMaterial, Vector3 } from 'three'
import { createStellarActivity } from '../assets/stellarActivity'
import { createStellarActivityChannels, createStellarLimbFrame } from '../../behaviors/stellarActivity'
import { getStructureLayout } from '../../behaviors/structureLayout'
import { STELLAR_LIMB, stellarLimbPhase } from '../../behaviors/stellarLimb'
import { createProminencePlacement } from '../../behaviors/stellarPlacement'
import { createProminenceStructure } from '../../behaviors/stellarMorphology'
import { createFluxRopeSimulation } from '../../behaviors/stellarPlasma'
import { createStellarTransitionPose, createStellarTransitionState, sampleStellarTransition } from '../../behaviors/stellarTransition'
import { createCameraFocusController } from '../../behaviors/useCameraFocus'
import { createFocusChannels } from '../../behaviors/useFocusTimeline'

it('左侧 CME 贯穿拉近、最终裁切及窗口改变，保留出生相位和磁路径', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  Object.assign(channels.cme, { opacity: 1, age: 3, seed: 0.47, position: -0.8, serial: 1 })
  const u = (asset.root.getObjectByName('日冕抛射弧丝') as Mesh<never, ShaderMaterial>).material.uniforms
  const frame = createStellarLimbFrame(), initial = getStructureLayout(16 / 9)
  frame.layout(initial)
  const phase = stellarLimbPhase(0.47, -0.8, 2, frame.referenceLimit)
  expect(phase).toBeLessThan(-Math.PI / 2)
  const camera = new PerspectiveCamera(40, 16 / 9), focus = createFocusChannels()
  const updateCamera = createCameraFocusController(), transition = createStellarTransitionState(), samplePose = createStellarTransitionPose()
  const anchor = new Vector3(), tangent = new Vector3(), normal = new Vector3()
  let paths: Float32Array | undefined
  try {
    for (const [aspect, progress] of [[16 / 9, 0.35], [16 / 9, 0.65], [16 / 9, 1], [390 / 844, 1], [390 / 844, 0.35], [16 / 9, 0.35]]) {
      const layout = getStructureLayout(aspect)
      asset.layout(layout, aspect * 800, 800)
      camera.aspect = aspect; camera.updateProjectionMatrix()
      sampleStellarTransition(progress, transition)
      updateCamera(camera, focus, null, 1, 0, transition)
      const pose = samplePose(transition, aspect)
      asset.root.scale.setScalar(pose.structureScale)
      asset.root.position.copy(pose.star)
      asset.root.position.x -= layout.sunX * pose.structureScale
      asset.update(camera)
      // 用固定的出生相位验证当前切圆；resize 不能再次按新弧段抽样。
      frame.layout(layout)
      const localCamera = camera.position.clone().sub(asset.root.position).divideScalar(pose.structureScale)
      const localUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
      frame.view(localCamera, localUp); frame.sampleAngle(phase, anchor, tangent, normal)
      expect(u.uAnchor.value.distanceTo(anchor)).toBeLessThan(1e-8)
      expect(u.uAge.value).toBe(3)
      expect(u.uSeed.value).toBe(0.47)
      const data = u.uCurves.value.image.data
      if (!paths) paths = data.slice()
      else expect(data).toEqual(paths)
      const projected = anchor.clone().applyMatrix4(asset.root.matrixWorld).project(camera)
      if (progress === 0.35) expect(projected.x).toBeLessThan(pose.star.clone().project(camera).x)
      if (progress === 1) expect(projected.x).toBeLessThan(-1) // 自然出画，未迁回可见边缘。
    }
  } finally { asset.dispose() }
})

it('25% 前保留团块，随后逐渐解析为线束，不改变磁路径、种子或时钟，局部图鉴恢复原表现', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  for (const c of [...channels.prominences, channels.cme]) Object.assign(c, { opacity: 1, age: 4, seed: 0.47 })
  const layout = getStructureLayout(16 / 9), camera = new PerspectiveCamera(40, 16 / 9)
  camera.position.set(layout.sunX, 0, 24)
  const names = ['日珥弧丝_0', '日珥弧丝_1', '日珥重绘短环_0_1', '日冕抛射弧丝', '重联后上升磁通']
  const uniforms = names.map(name => (asset.root.getObjectByName(name) as Mesh<never, ShaderMaterial>).material.uniforms)
  try {
    asset.layout(layout, 1280, 720)
    asset.root.scale.setScalar(0.027)
    asset.setDetail(0); asset.update(camera)
    const snapshots = uniforms.map(u => ({ paths: u.uCurves.value.image.data.slice(), texture: u.uCurves.value, anchor: u.uAnchor.value.clone() }))
    expect(uniforms[0].uParcelGain.value).toBe(1)
    for (const detail of [0.5, 1, 0]) {
      asset.setDetail(detail); asset.update(camera)
      uniforms.forEach((u, i) => {
        expect(u.uCurves.value).toBe(snapshots[i].texture)
        expect(u.uCurves.value.image.data).toEqual(snapshots[i].paths)
        expect(u.uAnchor.value.equals(snapshots[i].anchor)).toBe(true)
        expect(u.uAge.value).toBe(4)
        expect(u.uSeed.value).toBe(0.47)
        expect(u.uRibbonMinPixels.value).toBeGreaterThanOrEqual(0.55)
        expect(u.uRibbonMinPixels.value).toBeLessThanOrEqual(0.90)
        expect(u.uBundleResolve.value).toBe(detail)
        expect(u.uParcelGain.value).toBeCloseTo(1 - 0.94 * detail)
      })
    }
    asset.root.scale.setScalar(1)
    asset.setDetail(1); asset.update(camera)
    expect(uniforms[0].uParcelGain.value).toBeGreaterThan(0.06)
    asset.setDetail(0)
    asset.layoutLocal(800, 500, 6); asset.update()
    for (const u of uniforms) {
      expect(u.uRibbonMinPixels.value).toBe(0)
      expect(u.uBundleResolve.value).toBe(1)
      expect(u.uParcelGain.value).toBe(1)
    }
  } finally { asset.dispose() }
})

it('随机摆放作用于整个普通活动区，保持日面法线、内部路径、次通道比例和局部预览', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  const frame = createStellarLimbFrame(), anchor = new Vector3(), tangent = new Vector3(), normal = new Vector3()
  const layout = getStructureLayout(16 / 9), seed = 0.79, placement = createProminencePlacement(seed)
  const u = (asset.root.getObjectByName('日珥弧丝_0') as Mesh<never, ShaderMaterial>).material.uniforms
  const second = (asset.root.getObjectByName('日珥弧丝_1') as Mesh<never, ShaderMaterial>).material.uniforms
  const cme = (asset.root.getObjectByName('日冕抛射弧丝') as Mesh<never, ShaderMaterial>).material.uniforms
  for (const c of [...channels.prominences, channels.cme]) Object.assign(c, { opacity: 1, age: 1, seed, position: 0.4, morphology: 'bilateral' })
  try {
    asset.layoutLocal(800, 500, 6); asset.update()
    const paths = u.uCurves.value.image.data.slice()
    asset.layout(layout, 1280, 720); asset.update()
    frame.layout(layout); frame.sampleAngle(stellarLimbPhase(seed, 0.4, 0, frame.referenceLimit), anchor, tangent, normal)
    expect(u.uAnchor.value.distanceTo(anchor)).toBeLessThan(1e-10)
    expect(u.uNormal.value.distanceTo(normal)).toBeLessThan(1e-10)
    expect(u.uTangent.value.dot(normal)).toBeCloseTo(0, 12)
    expect(u.uTangent.value.length()).toBeCloseTo(1, 12)
    expect(u.uTangent.value.dot(tangent)).toBeCloseTo(Math.cos(placement.azimuth), 12)
    expect(u.uCurves.value.image.data).toEqual(paths)
    const scale = layout.sunRadius * STELLAR_LIMB.scaleRatios[0] * placement.scale
    expect(u.uScale.value).toBeCloseTo(scale, 12)
    expect(second.uScale.value / scale).toBeCloseTo(0.58, 12)
    for (const branch of [1, 2, 3]) {
      const short = asset.root.getObjectByName(`日珥重绘短环_0_${branch}`) as Mesh<never, ShaderMaterial>
      expect(short.material.uniforms.uTangent).toBe(u.uTangent)
      expect(short.material.uniforms.uScale).toBe(u.uScale)
    }
    frame.sampleAngle(stellarLimbPhase(seed, 0.4, 2, frame.referenceLimit), anchor, tangent, normal)
    expect(cme.uTangent.value.distanceTo(tangent)).toBeLessThan(1e-10)
    const saved = u.uTangent.value.clone()
    channels.prominences[0].age = 1.1; asset.update()
    expect(u.uTangent.value.distanceTo(saved)).toBeLessThan(1e-10)
    asset.layout(getStructureLayout(0.5), 400, 800); asset.update()
    asset.layout(layout, 1280, 720); asset.update()
    expect(u.uTangent.value.distanceTo(saved)).toBeLessThan(1e-10)
    asset.layoutLocal(800, 500, 6); asset.update()
    expect(u.uTangent.value.toArray()).toEqual([1, 0, 0]); expect(u.uScale.value).toBe(1)
    channels.prominences[0].age = 1; asset.update()
    expect(u.uCurves.value.image.data).toEqual(paths)
  } finally { asset.dispose() }
})

it('首次创建、换主类型和换伴随类型都根据实际环系选择低簇尺寸分布', () => {
  const channels = createStellarActivityChannels(), channel = channels.prominences[0]
  Object.assign(channel, { opacity: 1, age: 0, seed: 0.47, morphology: 'cluster' })
  const asset = createStellarActivity(channels), layout = getStructureLayout(16 / 9)
  const u = (asset.root.getObjectByName('日珥弧丝_0') as Mesh<never, ShaderMaterial>).material.uniforms
  try {
    asset.layout(layout, 1280, 720)
    for (const [kind, seed, lowCluster] of [['cluster', 0.47, true], ['nested', 0.47, false], ['nested', 0.79, true], ['bilateral', 0.79, false]] as const) {
      Object.assign(channel, { morphology: kind, seed })
      asset.update()
      const structure = createProminenceStructure(seed, kind)
      expect(structure.kind === 'cluster' || structure.companion === 'cluster').toBe(lowCluster)
      const expected = createProminencePlacement(seed, structure)
      const baseline = layout.sunRadius * STELLAR_LIMB.scaleRatios[0]
      expect(u.uScale.value / baseline).toBeCloseTo(expected.scale, 12)
      if (lowCluster) {
        expect(u.uScale.value / baseline).toBeGreaterThanOrEqual(0.85)
        expect(u.uScale.value / baseline).toBeLessThanOrEqual(1.05)
      } else expect(expected).toEqual(createProminencePlacement(seed))
    }
    channel.morphology = 'cluster'; asset.update()
    const scale = u.uScale.value
    asset.layoutLocal(800, 500, 6); asset.update()
    expect(u.uScale.value).toBe(1)
    asset.layout(layout, 1280, 720); asset.update()
    expect(u.uScale.value).toBeCloseTo(scale, 12)
  } finally { asset.dispose() }
})

it('局部预览复用路径和材质，换类型/回退重建模型，恢复场景布局且释放资源', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  Object.assign(channels.prominences[0], { opacity: 1, age: 0, seed: 0.47, morphology: 'nested' })
  const mesh = asset.root.getObjectByName('日珥弧丝_0') as Mesh<never, ShaderMaterial>
  const u = mesh.material.uniforms, texture = u.uCurves.value
  const redraw = u.uRedraw.value
  const central = asset.root.getObjectByName('日珥重绘短环_0_3') as Mesh<never, ShaderMaterial>
  expect(central.material.uniforms.uCurves.value).toBe(texture)
  expect(central.geometry).toBe(mesh.geometry)
  expect(texture.image.height).toBe(48)
  expect(redraw.image.height).toBe(48)
  const disposeCentral = vi.spyOn(central.material, 'dispose')
  const dispose = vi.spyOn(texture, 'dispose'), disposeRedraw = vi.spyOn(redraw, 'dispose')
  try {
    asset.layoutLocal(800, 400, 2.5); asset.update()
    expect(u.uAnchor.value.toArray()).toEqual([0, 0, 0])
    expect(u.uTangent.value.toArray()).toEqual([1, 0, 0])
    expect(u.uNormal.value.toArray()).toEqual([0, 1, 0])
    expect(u.uScale.value).toBe(1)
    expect(u.uUnitPixels.value).toBe(160)
    const initial = texture.image.data.slice(), initialInk = redraw.image.data.slice()
    channels.prominences[0].age = 1; asset.update()
    expect(texture.image.data).not.toEqual(initial)
    expect(redraw.image.data).not.toEqual(initialInk)
    const paths = texture.image.data.slice(), ink = redraw.image.data.slice()
    asset.setRedrawDiagnostic(true); asset.update()
    expect(u.uShowRedraw.value).toBe(1)
    expect(texture.image.data).toEqual(paths)
    expect(redraw.image.data).toEqual(ink)
    asset.setRedrawDiagnostic(false)
    channels.prominences[0].age = 0; asset.update()
    expect(texture.image.data).toEqual(initial)
    expect(redraw.image.data).toEqual(initialInk)
    channels.prominences[0].morphology = 'cluster'; asset.update()
    expect(texture.image.data).not.toEqual(initial)
    expect(u.uCurves.value).toBe(texture)
    expect(u.uRedraw.value).toBe(redraw)
    const layout = getStructureLayout(1280 / 720)
    asset.layout(layout); asset.update()
    expect(u.uRadius.value).toBe(layout.sunRadius)
    expect(u.uAnchor.value.length()).toBeGreaterThan(0)
  } finally { asset.dispose() }
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(disposeRedraw).toHaveBeenCalledTimes(1)
  expect(disposeCentral).toHaveBeenCalledTimes(1)
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


it('旋扭对照按当前年龄重放，复用纹理并重建尾迹，重新开启恢复同一结果', () => {
  const channels = createStellarActivityChannels(), asset = createStellarActivity(channels)
  Object.assign(channels.cme, { opacity: 1, seed: 0.47, age: 10 })
  const arc = asset.root.getObjectByName('日冕抛射弧丝') as Mesh<never, ShaderMaterial>
  const tail = asset.root.getObjectByName('CME 长寿命尾迹') as Mesh<import('three').InstancedBufferGeometry, ShaderMaterial>
  try {
    asset.layoutLocal(800, 500, 6); asset.update()
    const texture = arc.material.uniforms.uCurves.value
    const path = texture.image.data.slice()
    const count = tail.geometry.instanceCount
    const positions = tail.geometry.getAttribute('aCenter').array.slice(0, count * 3)
    asset.setCmeRotation(false); asset.update()
    expect(arc.material.uniforms.uCurves.value).toBe(texture)
    expect(texture.image.data).not.toEqual(path)
    const reference = createFluxRopeSimulation(0.47, true, undefined, undefined, false)
    reference.advanceTo(10)
    expect(texture.image.data).toEqual(reference.curveData)
    asset.setCmeRotation(true); asset.update()
    expect(texture.image.data).toEqual(path)
    expect(tail.geometry.instanceCount).toBe(count)
    expect(tail.geometry.getAttribute('aCenter').array.slice(0, count * 3)).toEqual(positions)
  } finally { asset.dispose() }
})
