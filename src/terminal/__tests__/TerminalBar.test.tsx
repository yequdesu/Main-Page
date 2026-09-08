import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TerminalBar from '../TerminalBar'
import type { TerminalBarProps } from '../TerminalBar'

afterEach(cleanup)

function setup(props: Partial<TerminalBarProps> = {}) {
  const result = render(
    <TerminalBar
      layout={{
        maxEchoLines: 5, maxWidth: '640px', borderRadius: '12px',
        padding: '8px 14px', fontSize: '12px', fontFamily: 'monospace', zIndex: 15,
      }}
      state={{ mode: 'active' }}
      text={{ placeholder: '' }}
      {...props}
    />,
  )
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Terminal command input' })
  const visual = () => result.container.querySelector('.terminal-input-line')?.textContent
  return { ...result, input, visual }
}

function changeInput(input: HTMLInputElement, value: string, caret = value.length) {
  // 粘贴、输入法和按键重复可能先产生 input，不能等待 keyup / select 再绘制光标。
  fireEvent.input(input, { target: { value, selectionStart: caret, selectionEnd: caret } })
}

describe('TerminalBar input', () => {
  it('updates text and cursor together without a following keyboard or selection event', () => {
    const { input, visual } = setup()
    changeInput(input, 'a')
    expect(visual()).toBe('$a█')
    changeInput(input, 'ab')
    expect(visual()).toBe('$ab█')
    changeInput(input, 'ab测试')
    expect(visual()).toBe('$ab测试█')
    expect(document.activeElement).toBe(input)
  })

  it('keeps the cursor at the native insertion point when editing the middle of a command', () => {
    const { input, visual } = setup()
    changeInput(input, 'help')
    fireEvent.select(input, { target: { selectionStart: 2, selectionEnd: 2 } })
    expect(visual()).toBe('$he█lp')
    changeInput(input, 'he  lp', 4)
    expect(visual()).toBe('$he  █lp')
    changeInput(input, 'he lp', 3)
    expect(visual()).toBe('$he █lp')
    changeInput(input, 'h测试lp', 3)
    expect(visual()).toBe('$h测试█lp')
  })

  it('starts with the cursor after a prefilled command', () => {
    const { input, visual } = setup({ state: { mode: 'active', inputValue: 'help' } })
    expect(input.selectionStart).toBe(4)
    expect(visual()).toBe('$help█')
  })

  it('clears the cursor with a submitted command and accepts the next command', () => {
    const onCommand = vi.fn(() => 'ok')
    const { input, visual } = setup({ commands: { onCommand } })
    changeInput(input, 'help')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommand).toHaveBeenCalledWith('help')
    expect(input.value).toBe('')
    expect(visual()).toBe('$█')
    changeInput(input, 'theme')
    expect(visual()).toBe('$theme█')
  })
})
