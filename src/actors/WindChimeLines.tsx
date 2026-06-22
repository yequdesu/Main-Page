import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, BufferGeometry, BufferAttribute, LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { clamped, smoothstep, SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { _planetWorldPositions } from './Planets'

const DROP_START = 0.80, DROP_END = 0.87
const RETRACT_END = 0.94
const ANCHOR_Y = 30.0

/**
 * WindChimeLines — 4 条亮线吊着行星/恒星从上方垂落，随后从下往上回收。
 * 0.80→0.87 下落，0.87→0.94 回收，0.94 后完全消失。
 */
export default function WindChimeLines() {
  const lines = useMemo(() => {
    const result: Line[] = []
    for (let i = 0; i < 4; i++) {
      const pts = new Float32Array([0, ANCHOR_Y, 0, 0, 0, 0])
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(pts, 3))
      const mat = new LineBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.7, depthTest: true, depthWrite: false })
      const line = new Line(g, mat)
      line.renderOrder = 3
      result.push(line)
    }
    return result
  }, [])

  const starTarget = { x: 0, y: -1.0, z: SCENE_CENTER_Z }

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress

    // 下落阶段 0.80→0.87，回收阶段 0.87→0.94
    const dropFactor = clamped(sp, DROP_START, DROP_END)
    const retractFactor = clamped(sp, DROP_END, RETRACT_END)

    let lineProgress: number
    if (sp < DROP_END) {
      lineProgress = dropFactor  // 0→1 下落
    } else if (sp < RETRACT_END) {
      lineProgress = 1.0 - retractFactor  // 1→0 回收
    } else {
      lineProgress = 0
    }
    const smoothP = smoothstep(lineProgress)
    const opacity = smoothP * 0.7

    for (let i = 0; i < 4; i++) {
      const pArr = lines[i].geometry.attributes.position.array as Float32Array
      let tx: number, ty: number, tz: number

      if (i < 3) {
        const pos = _planetWorldPositions[i]
        tx = pos ? pos.x : 0; ty = pos ? pos.y : -1.0; tz = pos ? pos.z : SCENE_CENTER_Z
      } else {
        tx = starTarget.x; ty = starTarget.y; tz = starTarget.z
      }

      const curY = ANCHOR_Y + (ty - ANCHOR_Y) * smoothP
      pArr[0] = tx; pArr[1] = ANCHOR_Y; pArr[2] = tz
      pArr[3] = tx; pArr[4] = curY;    pArr[5] = tz
      lines[i].geometry.attributes.position.needsUpdate = true
      ;(lines[i].material as LineBasicMaterial).opacity = opacity
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
