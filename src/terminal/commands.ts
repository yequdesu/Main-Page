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
      const current = (window as any).__DEBUG__ === true
      ;(window as any).__DEBUG__ = !current
      return `debug mode: ${!current ? 'ON' : 'OFF'}`
    },
  },
  {
    name: 'day',
    aliases: ['light'],
    description: 'Switch to day mode',
    handler: () => {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      return 'switched to day mode'
    },
  },
  {
    name: 'night',
    aliases: ['dark'],
    description: 'Switch to night mode',
    handler: () => {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
      return 'switched to night mode'
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
