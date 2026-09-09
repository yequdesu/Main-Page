import React, { act, useEffect } from 'react'
import { describe, it, expect, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { type Mesh, type ShaderMaterial } from 'three'
import { useAct1WorldStore } from '../act1World'
import { useScrollStore } from '../../stores/scrollStore'
import { useActorRuntimeStore } from '../../composition/actorRuntime'
import Act1WorldHost from '../Act1WorldHost'

const capture = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }))
vi.mock('../../actors/LightBeam', () => ({ default: () => <group name="test-beam" /> }))
vi.mock('../../actors/OceanWaves', () => ({ default: () => <group name="test-ocean" /> }))
vi.mock('../../actors/Lighthouse', () => ({ default: () => <group name="test-lighthouse" /> }))
vi.mock('../../actors/LighthouseCapture', () => ({ default: () => {
  useEffect(() => { capture.mount(); return () => { capture.unmount() } }, [])
  return null
} }))

describe('Act1 world lifecycle', () => {
  it('switches only content, retains the shell and releases all farm GPU resources', async () => {
    useAct1WorldStore.setState({ sceneId: 'lighthouse' })
    const scroll = useScrollStore.getState().scrollProgress
    const renderer = await ReactThreeTestRenderer.create(<group name="persistent-shell"><Act1WorldHost active /></group>)
    const shell = renderer.scene.findByProps({ name: 'persistent-shell' }).instance
    expect(capture.mount).toHaveBeenCalledTimes(1)
    await act(async () => { useAct1WorldStore.getState().selectScene('sunset-wheat') })
    expect(capture.unmount).toHaveBeenCalledTimes(1)
    expect(renderer.scene.findByProps({ name: 'persistent-shell' }).instance).toBe(shell)
    expect(useScrollStore.getState().scrollProgress).toBe(scroll)
    expect(useActorRuntimeStore.getState().actors.sunsetWheatWorld.active).toBe(true)
    const nodes = ['wheat-sky', 'wheat-ground']
      .map(name => renderer.scene.findByProps({ name }).instance as Mesh)
    const world = renderer.scene.findByProps({ name: 'sunset-wheat-world' }).instance
    const tiles: Mesh[] = []
    world.traverse(node => { if (node.name.startsWith('wheat-tile-')) tiles.push(node as Mesh) })
    expect(tiles.length).toBeGreaterThan(3)
    expect(world.getObjectByName('wheat-canopy')).toBeUndefined()
    nodes.push(...tiles)
    // Pulling the cube away must not replace or dissolve the original ears.
    for (const scale of [1, .1, .001, .1, 1]) {
      world.scale.setScalar(scale)
      await renderer.advanceFrames(1, 1 / 60)
      for (const tile of tiles) {
        expect(tile.visible).toBe(true)
        expect(tile.frustumCulled).toBe(true)
        expect((tile.material as ShaderMaterial).uniforms).not.toHaveProperty('uDetail')
      }
    }
    const geometries = nodes.map(m => vi.spyOn(m.geometry, 'dispose'))
    const ground = nodes[1].geometry
    ground.computeBoundingBox()
    expect(ground.boundingBox!.min.y).toBeCloseTo(-32)
    expect(ground.boundingBox!.max.y).toBeCloseTo(-2.5)
    expect(ground.boundingBox!.max.x).toBeCloseTo(31.98)
    expect(ground.boundingBox!.min.z).toBeCloseTo(-31.98)
    const materials = [...new Set(nodes.map(m => m.material as ShaderMaterial))]
    for (const material of materials) {
      expect(material.depthTest).toBe(true)
      expect(material.depthWrite).toBe(true)
      expect(material.fog).toBe(false)
      expect(material.toneMapped).toBe(false)
      expect(material.fragmentShader).toContain('greaterThan(abs(vLocal)')
    }
    const disposal = materials.map(m => vi.spyOn(m, 'dispose'))
    await act(async () => { useAct1WorldStore.getState().selectScene('lighthouse') })
    expect(capture.mount).toHaveBeenCalledTimes(2)
    for (const dispose of [...geometries, ...disposal]) expect(dispose).toHaveBeenCalledTimes(1)
    expect(useActorRuntimeStore.getState().actors.sunsetWheatWorld.mounted).toBe(false)
    expect(renderer.scene.findByProps({ name: 'persistent-shell' }).instance).toBe(shell)
    await renderer.update(<group name="persistent-shell"><Act1WorldHost active={false} /></group>)
    expect(capture.unmount).toHaveBeenCalledTimes(2)
    await renderer.unmount()
  })
})
