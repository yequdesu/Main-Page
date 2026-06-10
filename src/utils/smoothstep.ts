/** 3t² - 2t³ */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}
