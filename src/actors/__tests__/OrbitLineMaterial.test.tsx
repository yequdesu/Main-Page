import { afterEach, describe, expect, it, vi } from 'vitest'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { Line, ShaderLib, Vector3, type LineBasicMaterial } from 'three'
import OrbitLineMaterial from '../OrbitLineMaterial'
import { useScrollStore } from '../../stores/scrollStore'
import { _planetWorldPositions, _planetCoreWorldRadii } from '../Planets'

vi.mock('../Planets', () => ({
  _mainPlanetIndices: [10, 20, 30],
  _planetWorldPositions: [new Vector3(4, -1, -16), null, null],
  _planetCoreWorldRadii: [0.5, 0, 0],
}))

const initialState = useScrollStore.getState()
afterEach(() => useScrollStore.setState(initialState, true))

function Lines() {
  return <>
    {[0, 1, undefined].map((trackIdx, i) => <threeLine key={i}>
      <OrbitLineMaterial color="#cbd5e1" maxOpacity={0.35} appearStart={0.94} trackIdx={trackIdx} />
    </threeLine>)}
  </>
}

describe('轨道聚焦视觉', () => {
  it('聚焦时逐渐弱化轨道、突出当前轨道；切换与退出连续并恢复远景', async () => {
    useScrollStore.setState({ scrollProgress: 1, focusedPlanetIdx: -1 })
    const renderer = await ReactThreeTestRenderer.create(<Lines />)
    try {
      const materials = renderer.scene.children.map(node => (node.instance as Line).material as LineBasicMaterial)
      await renderer.advanceFrames(1, 1 / 60)
      expect(materials.map(mat => mat.opacity)).toEqual([0.35, 0.35, 0.35])
      useScrollStore.getState().setFocusedPlanet(10)
      await renderer.advanceFrames(1, 1 / 60)
      for (const mat of materials) expect(mat.opacity).toBeGreaterThan(0.34)
      await renderer.advanceFrames(300, 1 / 60)
      expect(materials[0].opacity).toBeGreaterThan(materials[1].opacity)
      expect(materials[1].opacity).toBeGreaterThan(materials[2].opacity)
      expect(materials[0].opacity).toBeLessThan(0.18)
      const beforeSwitch = materials.map(mat => mat.opacity)
      useScrollStore.getState().setFocusedPlanet(20)
      await renderer.advanceFrames(1, 1 / 60)
      materials.forEach((mat, i) => expect(Math.abs(mat.opacity - beforeSwitch[i])).toBeLessThan(0.005))
      await renderer.advanceFrames(300, 1 / 60)
      expect(materials[1].opacity).toBeGreaterThan(materials[0].opacity)
      useScrollStore.getState().clearFocus()
      await renderer.advanceFrames(360, 1 / 60)
      for (const mat of materials) expect(mat.opacity).toBeCloseTo(0.35, 3)
      useScrollStore.setState({ scrollProgress: 0.9 })
      await renderer.advanceFrames(1, 1 / 60)
      expect(materials.every(mat => mat.opacity === 0)).toBe(true)
    } finally { await renderer.unmount() }
  })

  it('向着色器同步球体位置、真实半径和聚焦渐变量，并保留深度遮挡', async () => {
    useScrollStore.setState({ scrollProgress: 1, focusedPlanetIdx: 10 })
    const renderer = await ReactThreeTestRenderer.create(<Lines />)
    try {
      const material = (renderer.scene.children[0].instance as Line).material as LineBasicMaterial
      const shader = { ...ShaderLib.basic, uniforms: { ...ShaderLib.basic.uniforms } } as Parameters<LineBasicMaterial['onBeforeCompile']>[0]
      material.onBeforeCompile(shader, {} as Parameters<LineBasicMaterial['onBeforeCompile']>[1])
      await renderer.advanceFrames(300, 1 / 60)
      const spheres = shader.uniforms.uOrbitPlanets.value
      expect(spheres[0].toArray()).toEqual([4, -1, -16, 0.5])
      expect(spheres[1].w).toBe(0)
      expect(shader.uniforms.uOrbitFocus.value).toBeGreaterThan(0.99)
      _planetWorldPositions[0]!.set(5, -1, -18)
      _planetCoreWorldRadii[0] = 0.8
      await renderer.advanceFrames(1, 1 / 60)
      expect(spheres[0].toArray()).toEqual([5, -1, -18, 0.8])
      useScrollStore.setState({ scrollProgress: 0.5 })
      await renderer.advanceFrames(360, 1 / 60)
      expect(shader.uniforms.uOrbitFocus.value).toBeLessThan(0.001)
      expect(material.depthTest).toBe(true)
      expect(material.depthWrite).toBe(false)
      expect(material.transparent).toBe(true)
    } finally {
      await renderer.unmount()
      _planetWorldPositions[0]!.set(4, -1, -16)
      _planetCoreWorldRadii[0] = 0.5
    }
  })
})
