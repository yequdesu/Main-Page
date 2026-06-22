import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, BufferGeometry, BufferAttribute, LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { getWindChimeProgress, WC_ANCHOR_Y } from '../behaviors/useWindChime'
import { _planetWorldPositions } from './Planets'

const TARGET_Y = -1.0  // 所有星体轨道Y相同，不依赖 Planets 共享数组

/**
 * WindChimeLines — 4 条亮线，Y 自行计算，仅从 _planetWorldPositions 取 X/Z。
 */
export default function WindChimeLines() {
  const lines = useMemo(() => {
    const result: Line[] = []
    for (let i = 0; i < 4; i++) {
      const pts = new Float32Array([0, WC_ANCHOR_Y, 0, 0, 0, 0])
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(pts, 3))
      const mat = new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false })
      const line = new Line(g, mat)
      line.renderOrder = 9999
      result.push(line)
    }
    return result
  }, [])

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    const { smoothP } = getWindChimeProgress(sp)
    const curY = WC_ANCHOR_Y + (TARGET_Y - WC_ANCHOR_Y) * smoothP
    const zOffset = 6 * smoothP

    for (let i = 0; i < 4; i++) {
      const pArr = lines[i].geometry.attributes.position.array as Float32Array
      let tx = 0, tz = SCENE_CENTER_Z

      if (i < 3) {
        const pos = _planetWorldPositions[i]
        if (pos) { tx = pos.x; tz = pos.z }
      }

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
