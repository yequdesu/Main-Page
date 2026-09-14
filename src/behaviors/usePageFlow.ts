import { PAGE_FLOW } from '../types'
import { progress } from '../composition/timeline'
export { PAGE_FLOW } from '../types'

export function getPageFlow(value: number) {
  const pageProgress = Math.max(0, Math.min(PAGE_FLOW.end, value))
  return {
    pageProgress,
    scrollProgress: Math.min(1, pageProgress),
    structureProgress: progress('act4StellarTransition', pageProgress),
  }
}
