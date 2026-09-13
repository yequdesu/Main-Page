import { PAGE_FLOW } from '../types'
export { PAGE_FLOW } from '../types'

export function getPageFlow(value: number) {
  const pageProgress = Math.max(0, Math.min(PAGE_FLOW.end, value))
  return {
    pageProgress,
    scrollProgress: Math.min(1, pageProgress),
    structureProgress: Math.max(0, Math.min(1, (pageProgress - PAGE_FLOW.structureStart) / (PAGE_FLOW.structureEnd - PAGE_FLOW.structureStart))),
  }
}
