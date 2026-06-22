import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, BufferGeometry, BufferAttribute, LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { getWindChimeProgress, WC_ANCHOR_Y } from '../behaviors/useWindChime'
import { _planetOrbitTargets, _planetRawOrbitY } from './Planets'

/**
 * WindChimeLines — 4 条亮线吊着行星/恒星从上方垂落，随后从下往上回收。
 */
export default function WindChimeLines() {
  const lines = useMemo(() => {
    const result: Line[] = []
    for (let i = 0; i < 4; i++) {
      const pts = new Float32Array([0, WC_ANCHOR_Y, 0, 0, 0, 0])
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(pts, 3))
      const mat = new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 1.0, depthTest: false, depthWrite: false })
      const line = new Line(g, mat)
      line.renderOrder = 9999
      result.push(line)
    }
    return result
  }, [])

  const starTarget = { x: 0, y: -1.0, z: SCENE_CENTER_Z }

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    const { smoothP } = getWindChimeProgress(sp)

    for (let i = 0; i < 4; i++) {
      const pArr = lines[i].geometry.attributes.position.array as Float32Array
      let tx: number, ty: number, tz: number

      if (i < 3) {
        const pos = _planetOrbitTargets[i]
        tx = pos ? pos.x : 0; tz = pos ? pos.z : SCENE_CENTER_Z
        ty = _planetRawOrbitY[i]  // 纯轨道Y(无偏移)
      } else {
        tx = starTarget.x; ty = starTarget.y; tz = starTarget.z
      }

      const curY = WC_ANCHOR_Y + (ty - WC_ANCHOR_Y) * smoothP
      const zOffset = 6 * smoothP
      pArr[0] = tx; pArr[1] = WC_ANCHOR_Y; pArr[2] = tz + zOffset
      pArr[3] = tx; pArr[4] = curY;        pArr[5] = tz + zOffset
      lines[i].geometry.attributes.position.needsUpdate = true
      ;(lines[i].material as LineBasicMaterial).opacity = smoothP
    }
  })

  return (
    <group>
      {lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  )
}
