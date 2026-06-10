/** 最短角度差（-PI..PI） */
export function shortestDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI)  d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
