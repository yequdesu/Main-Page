import { Vector3 } from 'three'
import { magneticEase } from './stellarMagnetism'
import { CME_TAIL } from './stellarParticleDensity'

type Triple = [number, number, number]
export interface CmeTailRecord {
  born: number
  depart: number
  origin: Triple
  velocity: Triple
  drift: Triple
  wave: Triple
  phase: number
  random: number
  appearance: [number, number, number, number] // s、磁丝、seed、交接事件年龄
}

/** 解析外流：保留交接位置/速度，数秒内松弛至缓慢背景漂移，无逐帧积分误差。 */
export function sampleCmeTail(record: CmeTailRecord, time: number, out: Vector3) {
  const age = Math.max(0, time - record.depart)
  const relaxation = CME_TAIL.relaxation * (1 - Math.exp(-age / CME_TAIL.relaxation))
  const wave = (1 - Math.exp(-age / 12)) ** 2 * (Math.sin(age * 0.035 + record.phase) - Math.sin(record.phase))
  for (let axis = 0; axis < 3; axis++) out.setComponent(axis, record.origin[axis] + record.drift[axis] * age
    + (record.velocity[axis] - record.drift[axis]) * relaxation + record.wave[axis] * wave)
  return out
}
export function cmeTailOpacity(record: CmeTailRecord, time: number) {
  return magneticEase((time - record.depart) / CME_TAIL.crossfade)
    * (1 - magneticEase((time - record.born - CME_TAIL.fadeStart) / (CME_TAIL.lifetime - CME_TAIL.fadeStart)))
}

/** 活动场景所有，不随单次 CME 复位。容量覆盖 300 秒内按最短正常周期累积的尾迹。 */
export function createCmeTailPool() {
  const records: (CmeTailRecord | null)[] = new Array(CME_TAIL.capacity).fill(null)
  return {
    records,
    add(record: CmeTailRecord, time: number) {
      if (time >= record.born + CME_TAIL.lifetime) return
      let slot = records.findIndex(r => !r || time >= r.born + CME_TAIL.lifetime)
      if (slot < 0) {
        slot = 0
        for (let i = 1; i < records.length; i++) if (records[i]!.born < records[slot]!.born) slot = i
      }
      records[slot] = record
    },
    expire(time: number) {
      for (let i = 0; i < records.length; i++) if (records[i] && time >= records[i]!.born + CME_TAIL.lifetime) records[i] = null
    },
    clear() { records.fill(null) },
  }
}
