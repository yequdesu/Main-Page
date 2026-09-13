import { voyagerState } from '../actors/voyagerState'
import { GRID_SHIFT_START } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'

export interface Command {
  name: string
  aliases?: string[]
  description: string
  handler: () => string
}

// 命令注册表 — 纯数据，添加新命令只需 push
export const commandRegistry: Command[] = [
  {
    name: 'help',
    description: 'Show available commands',
    handler: () => {
      const lines = commandRegistry.map(
        (c) => `  ${c.name.padEnd(8)} ${c.description}`
      )
      return ['Available commands:', ...lines].join('\n')
    },
  },
  {
    name: 'debug',
    description: 'Toggle debug mode',
    handler: () => {
      const current = useScrollStore.getState().debugMode
      const next = !current
      useScrollStore.getState().setDebugMode(next)
      return `debug mode: ${next ? 'ON' : 'OFF'}`
    },
  },
  {
    name: 'day',
    aliases: ['light'],
    description: 'Switch to day mode',
    handler: () => {
      useScrollStore.getState().setDayNight('day')
      return 'switched to day mode'
    },
  },
  {
    name: 'night',
    aliases: ['dark'],
    description: 'Switch to night mode',
    handler: () => {
      useScrollStore.getState().setDayNight('night')
      return 'switched to night mode'
    },
  },
  {
    name: 'voyager',
    description: 'Focus the Voyager spacecraft',
    handler: () => {
      const store = useScrollStore.getState()
      if (store.scrollProgress < GRID_SHIFT_START || store.structureProgress > 0 || !voyagerState.available) return 'Voyager is available after entering the solar system and loading the model.'
      store.focusVoyager()
      return 'Focusing Voyager · click empty space to return · auto return in 30s'
    },
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear the echo area',
    handler: () => {
      // 由 TerminalBar handleKeyDown 直接处理
      return ''
    },
  },
]

export function executeCommand(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  const cmd = commandRegistry.find(
    (c) =>
      c.name === trimmed || (c.aliases && c.aliases.includes(trimmed))
  )

  if (!cmd) return `command not found: ${trimmed}\nType 'help' for available commands`

  return cmd.handler()
}
