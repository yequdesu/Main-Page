import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector4, type LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { _mainPlanetIndices, _planetWorldPositions, _planetCoreWorldRadii } from './Planets'

interface OrbitLineMaterialProps {
  color: string
  maxOpacity: number
  appearStart: number
  /** 静态轨道索引；省略时视为外层装饰轨道。 */
  trackIdx?: number
}

/** 仅用于导航轨道线；保留 Three 内置线材质的主题、雾和深度测试。 */
export default function OrbitLineMaterial({ color, maxOpacity, appearStart, trackIdx }: OrbitLineMaterialProps) {
  const materialRef = useRef<LineBasicMaterial>(null)
  const state = useMemo(() => ({
    focus: { value: 0 },
    spheres: { value: [new Vector4(), new Vector4(), new Vector4()] },
    visibility: 1,
  }), [])
  const onBeforeCompile = useMemo<LineBasicMaterial['onBeforeCompile']>(() => shader => {
    shader.uniforms.uOrbitFocus = state.focus
    shader.uniforms.uOrbitPlanets = state.spheres
    shader.vertexShader = `varying vec3 vOrbitWorldPosition;\n${shader.vertexShader}`
      .replace('#include <project_vertex>', `
        #include <project_vertex>
        vOrbitWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `)
    shader.fragmentShader = `
      uniform float uOrbitFocus;
      uniform vec4 uOrbitPlanets[3];
      varying vec3 vOrbitWorldPosition;
      ${shader.fragmentShader}
    `.replace('#include <opaque_fragment>', `
      float orbitClearance = 1.0;
      for (int i = 0; i < 3; i++) {
        float radius = uOrbitPlanets[i].w;
        if (radius > 0.0) {
          float distanceToPlanet = distance(vOrbitWorldPosition, uOrbitPlanets[i].xyz);
          orbitClearance = min(orbitClearance, smoothstep(radius * 1.08, radius * 1.65, distanceToPlanet));
        }
      }
      diffuseColor.a *= mix(1.0, orbitClearance, uOrbitFocus);
      #include <opaque_fragment>
    `)
  }, [state])

  useFrame((_frame, delta) => {
    const { scrollProgress: sp, focusedPlanetIdx } = useScrollStore.getState()
    const focusedTrack = _mainPlanetIndices.indexOf(focusedPlanetIdx)
    const focused = sp >= GRID_SHIFT_START && focusedPlanetIdx >= 0 && focusedTrack >= 0
    // 与相机衔接同步渐变；切换目标和退出聚焦都沿用当前透明度，不产生跳变。
    const alpha = 1 - Math.exp(-Math.min(delta, 0.1) / 0.8)
    state.focus.value += ((focused ? 1 : 0) - state.focus.value) * alpha
    const visibility = !focused ? 1 : trackIdx === undefined ? 0.12 : trackIdx === focusedTrack ? 0.45 : 0.18
    state.visibility += (visibility - state.visibility) * alpha
    for (let i = 0; i < 3; i++) {
      const center = _planetWorldPositions[i]
      if (center) state.spheres.value[i].set(center.x, center.y, center.z, _planetCoreWorldRadii[i])
      else state.spheres.value[i].set(0, 0, 0, 0)
    }
    if (materialRef.current) {
      materialRef.current.opacity = smoothstep(clamped(sp, appearStart, 1)) * maxOpacity * state.visibility
    }
    // 主页面 Planets 在可见阶段持续 invalidate；此处不启动额外帧循环。
  })

  return <lineBasicMaterial
    ref={materialRef}
    color={color}
    transparent
    opacity={0}
    depthWrite={false}
    depthTest
    onBeforeCompile={onBeforeCompile}
    customProgramCacheKey={() => 'orbit-planet-clearance-v1'}
  />
}
