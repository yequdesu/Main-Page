import { useScrollStore } from '../stores/scrollStore'
import { readPlanetParticleIndex } from '../composition/coreAnchors'
import type { PlanetLink } from '../types'

/**
 * 行星标签终端命令处理器。
 *
 * 独立命令集（不与 MainTerminal 全局命令合并）：
 *   info  — 显示轨道索引、标签名、URL、聚焦状态
 *   focus — 聚焦当前行星
 *   open  — 在新标签页打开行星链接
 *
 * 返回 TerminalBarCommandConfig.onCommand 兼容的回调。
 */
export function createPlanetCommandHandler(
  trackIdx: number,
  link: PlanetLink,
): (input: string) => string {
  return (input: string): string => {
    const trimmed = input.trim()
    if (!trimmed) return ''

    switch (trimmed) {
      case 'info': {
        const store = useScrollStore.getState()
        const planetIdx = readPlanetParticleIndex(trackIdx)
        // planetIdx 可能是 undefined（尚未初始化）
        const isFocused = planetIdx !== undefined && store.focusedPlanetIdx === planetIdx
        return [
          `轨道索引: ${trackIdx}`,
          `标签: ${link.label}`,
          `URL: ${link.url}`,
          `聚焦状态: ${isFocused ? '已聚焦' : '未聚焦'}`,
        ].join('\n')
      }

      case 'focus': {
        const store = useScrollStore.getState()
        const planetIdx = readPlanetParticleIndex(trackIdx)
        if (planetIdx !== undefined) {
          store.setFocusedPlanet(planetIdx)
        }
        return `已聚焦: ${link.label}`
      }

      case 'open': {
        window.open(link.url, '_blank')
        return `已打开: ${link.url}`
      }

      default:
        return `command not found: ${trimmed}\n可用命令: info, focus, open`
    }
  }
}
