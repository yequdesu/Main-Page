import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, BufferGeometry, BufferAttribute, LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { clamped, smoothstep } from '../r3f/ScrollRig'
import { _planetWorldPositions } from './Planets'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

const DROP_START = 0.83, DROP_END = 0.88
const RECYCLE_END = 0.93
const ANCHOR_Y = 30.0

/** 风铃线 — 4 条垂线将行星和恒星从高处吊落，然后回收上升 */
export default function WindChimeLines() {
  const lines = useMemo(() => {
    const result: Line[] = []
    for (let i = 0; i < 4; i++) {
      const pts = new Float32Array([0, ANCHOR_Y, 0, 0, 0, 0])
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(pts, 3))
      const mat = new LineBasicMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.5, depthTest: true, depthWrite: false })
      const line = new Line(g, mat)
      line.renderOrder = 3
      result.push(line)
    }
    return result
  }, [])

  const starTargetY = -1.0, starX = 0, starZ = SCENE_CENTER_Z

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress

    // 下落阶段 0.83→0.88
    const dropFactor = clamped(sp, DROP_START, DROP_END)
    // 回收阶段 0.88→0.93
    const recycleFactor = clamped(sp, DROP_END, RECYCLE_END)

    // 综合：0→1(下落) → 0(回收)
    let lineProgress: number
    if (sp < DROP_END) {
      lineProgress = dropFactor
    } else {
      lineProgress = 1.0 - recycleFactor
    }
    const smoothP = smoothstep(lineProgress)
    const lineOpacity = smoothP * 0.65  // peak at 65%

    for (let i = 0; i < 4; i++) {
      const pArr = lines[i].geometry.attributes.position.array as Float32Array
      let targetX: number, targetY: number, targetZ: number

      if (i < 3) {
        const pos = _planetWorldPositions[i]
        targetX = pos ? pos.x : 0
        targetY = pos ? pos.y : -1.0
        targetZ = pos ? pos.z : SCENE_CENTER_Z
      } else {
        targetX = starX; targetY = starTargetY; targetZ = starZ
      }

      const curY = ANCHOR_Y + (targetY - ANCHOR_Y) * smoothP
      pArr[0] = targetX; pArr[1] = ANCHOR_Y;  pArr[2] = targetZ
      pArr[3] = targetX; pArr[4] = curY;       pArr[5] = targetZ
      lines[i].geometry.attributes.position.needsUpdate = true
      ;(lines[i].material as LineBasicMaterial).opacity = lineOpacity
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
