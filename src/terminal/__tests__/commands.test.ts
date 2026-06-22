// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { executeCommand, commandRegistry } from '../commands'

describe('executeCommand', () => {
  it('returns help text for "help" command', () => {
    const result = executeCommand('help')
    expect(result).toContain('Available commands:')
    expect(result).toContain('help')
    expect(result).toContain('debug')
    expect(result).toContain('day')
    expect(result).toContain('night')
  })

  it('toggles debug mode with "debug"', () => {
    ;(window as any).__DEBUG__ = false
    const r1 = executeCommand('debug')
    expect(r1).toContain('ON')
    expect((window as any).__DEBUG__).toBe(true)

    const r2 = executeCommand('debug')
    expect(r2).toContain('OFF')
    expect((window as any).__DEBUG__).toBe(false)
  })

  it('matches aliases (day → light, night → dark)', () => {
    const r1 = executeCommand('light')
    expect(r1).toContain('day mode')

    const r2 = executeCommand('dark')
    expect(r2).toContain('night mode')
  })

  it('returns error for unknown command', () => {
    const result = executeCommand('foobar')
    expect(result).toContain('command not found: foobar')
  })

  it('returns empty string for blank input', () => {
    expect(executeCommand('')).toBe('')
    expect(executeCommand('  ')).toBe('')
  })

  it('trims whitespace from input', () => {
    const result = executeCommand('  help  ')
    expect(result).toContain('Available commands:')
  })

  it('commandRegistry has at least the 4 initial commands', () => {
    const names = commandRegistry.map((c) => c.name)
    expect(names).toContain('help')
    expect(names).toContain('debug')
    expect(names).toContain('day')
    expect(names).toContain('night')
  })
})
