import { Vector3 } from 'three'
import { SHORT_LOOP_ARC, type ShortLoopArcDiagnostic } from './stellarShortLoop'

/** 逐条测量实际三维弧长，整束共用投影系数。数组由调用方写入；工厂拥有临时向量。 */
export function createArcBundle(count: number, confine: (s: number, p: Vector3) => Vector3, segments = 112) {
  const rowSize = (segments + 1) * 3
  const candidate = new Float64Array(count * rowSize), reference = new Float64Array(count * rowSize)
  const output = new Float64Array(count * rowSize), lengths = new Float64Array(count)
  const point = new Vector3(), previous = new Vector3()
  const state = { blend: 1, diagnostic: { length: 0, reference: 0, maxStrain: 0, projection: 0 } as ShortLoopArcDiagnostic }
  function assess(blend: number) {
    let valid = true, maxStrain = 0, total = 0
    for (let i = 0; i < count; i++) {
      let length = 0
      for (let j = 0; j <= segments; j++) {
        const offset = i * rowSize + j * 3
        point.fromArray(reference, offset)
        point.x += blend * (candidate[offset] - point.x)
        point.y += blend * (candidate[offset + 1] - point.y)
        point.z += blend * (candidate[offset + 2] - point.z)
        confine(j / segments, point).toArray(output, offset)
        if (j) length += point.distanceTo(previous)
        previous.copy(point)
      }
      const strain = Math.abs(length / lengths[i] - 1)
      maxStrain = Math.max(maxStrain, strain); total += length
      valid &&= strain <= SHORT_LOOP_ARC.strainLimit - 0.0001
    }
    state.diagnostic.length = total / count
    state.diagnostic.maxStrain = maxStrain
    return valid
  }
  return { candidate, reference, output, state, project() {
    for (let i = 0; i < count; i++) {
      let length = 0
      for (let j = 0; j <= segments; j++) {
        point.fromArray(reference, i * rowSize + j * 3)
        if (j) length += point.distanceTo(previous)
        previous.copy(point)
      }
      lengths[i] = length
    }
    state.blend = 1
    if (!assess(1)) {
      let low = 0, high = 1
      for (let i = 0; i < 12; i++) { const mid = (low + high) / 2; if (assess(mid)) low = mid; else high = mid }
      state.blend = low; assess(low)
    }
    state.diagnostic.reference = lengths.reduce((sum, l) => sum + l, 0) / count
    state.diagnostic.projection = 1 - state.blend
  } }
}
