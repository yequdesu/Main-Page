import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector4, type LineBasicMaterial } from 'three'
import { useFocusAnimation } from '../r3f/FocusAnimationContext'
import { useScrollStore } from '../stores/scrollStore'
import { clamped, smoothstep } from '../r3f/ScrollRig'
import { _planetWorldPositions, _planetCoreWorldRadii } from './Planets'

interface OrbitLineMaterialProps {
  color: string
  maxOpacity: number
  appearStart: number
  /** 静态轨道索引；省略时视为外层装饰轨道。 */
  trackIdx?: number
}

/** 仅用于导航轨道线；保留 Three 内置线材质的主题、雾和深度测试。 */
export default function OrbitLineMaterial({ color, maxOpacity, appearStart, trackIdx }: OrbitLineMaterialProps) {
  const focusChannels = useFocusAnimation()
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

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    state.focus.value = focusChannels.orbitFocus
    state.visibility = focusChannels.orbitVisibility[trackIdx ?? 3]
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
