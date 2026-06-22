import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, BufferGeometry, BufferAttribute, LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { clamped, smoothstep, SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { _planetWorldPositions } from './Planets'

export const DROP_START = 0.80, DROP_END = 0.87
export const RETRACT_END = 0.94
export const ANCHOR_Y = 30.0

/** 计算风铃下落进度 — Planets/CentralStar 各自调用以独立获取正确的值 */
export function getWindChimeProgress(sp: number): { smoothP: number; active: boolean } {
  const dropFactor = clamped(sp, DROP_START, DROP_END)
  const retractFactor = clamped(sp, DROP_END, RETRACT_END)
  const active = sp >= DROP_START && sp < RETRACT_END

  let lineProgress: number
  if (sp < DROP_END) {
    lineProgress = dropFactor
  } else if (sp < RETRACT_END) {
    lineProgress = 1.0 - retractFactor
  } else {
    lineProgress = 0
  }
  return { smoothP: smoothstep(lineProgress), active }
}

/**
 * WindChimeLines — 4 条亮线吊着行星/恒星从上方垂落，随后从下往上回收。
 * 同时通过 _windChimeDropY / _windChimeActive 驱动行星和恒星的实际 Y 位移。
 */
export default function WindChimeLines() {
  const lines = useMemo(() => {
    const result: Line[] = []
    for (let i = 0; i < 4; i++) {
      const pts = new Float32Array([0, ANCHOR_Y, 0, 0, 0, 0])
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(pts, 3))
      const mat = new LineBasicMaterial({ color: '#f1f5f9', transparent: true, opacity: 0.8, depthTest: true, depthWrite: false })
      const line = new Line(g, mat)
      line.renderOrder = 3
      result.push(line)
    }
    return result
  }, [])

  const starTarget = { x: 0, y: -1.0, z: SCENE_CENTER_Z }

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    const { smoothP } = getWindChimeProgress(sp)
    const opacity = smoothP * 0.8

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
