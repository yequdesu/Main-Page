import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Group, Matrix4, Vector3 } from 'three'
import type { OrbitalRingConfig } from '../types'
import { clamped, GRID_SHIFT_START, smoothstep } from '../r3f/ScrollRig'
import { useFocusAnimation } from '../r3f/FocusAnimationContext'
import { useScrollStore } from '../stores/scrollStore'
import { sampleVoyagerOrbit, VOYAGER_ORBIT } from '../behaviors/useVoyagerOrbit'
import { createVoyagerAsset } from './assets/voyager'
import { voyagerState } from './voyagerState'

/** 最外层进动椭圆上的风格化巡航；GLB 来源：illidroid / Sketchfab，CC BY 4.0。 */
export default function VoyagerOrbiter({ config, speedScale = 1 }: { config: OrbitalRingConfig; speedScale?: number }) {
  const { scene } = useGLTF('/models/voyager-1-low-poly.glb')
  const asset = useMemo(() => createVoyagerAsset(scene, VOYAGER_ORBIT.size), [scene])
  const group = useRef<Group>(null)
  const angle = useRef<number>(VOYAGER_ORBIT.phase)
  const focus = useFocusAnimation()
  const scratch = useMemo(() => ({
    tangent: new Vector3(), normal: new Vector3(), side: new Vector3(), world: new Vector3(), matrix: new Matrix4(), up: new Vector3(0, 1, 0), right: new Vector3(), above: new Vector3(),
  }), [])
  useEffect(() => {
    voyagerState.available = true
    voyagerState.radius = asset.radius
    voyagerState.hitRadius = asset.hitRadius
    voyagerState.hitTargets = asset.hitTargets
    return () => {
      voyagerState.available = false
      voyagerState.opacity = 0
      voyagerState.hitTargets = []
      if (useScrollStore.getState().focusedVoyager) useScrollStore.getState().clearFocus('scene')
      asset.dispose()
    }
  }, [asset])
  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    angle.current = (angle.current - delta * speedScale * Math.PI * 2 / VOYAGER_ORBIT.period) % (Math.PI * 2)
    sampleVoyagerOrbit(config, angle.current, node.position, scratch.tangent)
    // 天线 +Y 指向恒星；磁力仪悬杆沿资产 +Z 伸展，朝对星视角的左上方。
    scratch.normal.copy(node.position).negate().normalize()
    scratch.right.crossVectors(scratch.normal, scratch.up).normalize()
    scratch.above.crossVectors(scratch.right, scratch.normal).normalize()
    scratch.tangent.copy(scratch.above).sub(scratch.right).normalize()
    scratch.side.crossVectors(scratch.normal, scratch.tangent).normalize()
    scratch.tangent.crossVectors(scratch.side, scratch.normal).normalize()
    scratch.matrix.makeBasis(scratch.side, scratch.normal, scratch.tangent)
    node.quaternion.setFromRotationMatrix(scratch.matrix)
    node.getWorldPosition(scratch.world)
    voyagerState.position.copy(asset.center).applyMatrix4(node.matrixWorld)
    const nearFade = smoothstep(clamped(scratch.world.distanceTo(state.camera.position), 4, 8))
    const opacity = smoothstep(clamped(useScrollStore.getState().scrollProgress, GRID_SHIFT_START, 1))
      * (focus.orbitVisibility[3] + (1 - focus.orbitVisibility[3]) * focus.voyagerFocus)
      * (nearFade + (1 - nearFade) * focus.voyagerFocus)
    voyagerState.opacity = opacity
    node.visible = opacity > 0.005
    asset.setOpacity(opacity)
    // Act 3 可见时维持巡航；场景切换后的隐藏组件不额外请求帧。
    if (useScrollStore.getState().scrollProgress >= GRID_SHIFT_START) state.invalidate()
  }, -0.5)
  return <group ref={group} name="Voyager 外环巡航" visible={false}><primitive object={asset.root} dispose={null} /></group>
}
