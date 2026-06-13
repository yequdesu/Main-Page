import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import Scrollable from '../Scrollable'
import type { ScrollableHandle } from '../Scrollable'

describe('Scrollable', () => {
  it('renders children', () => {
    render(
      <Scrollable scrollable={false} maxHeight="200px">
        <div data-testid="child">content</div>
      </Scrollable>
    )
    expect(screen.getByTestId('child')).toBeTruthy()
  })

  it('applies scrollable class when scrollable=true', () => {
    const { container } = render(
      <Scrollable scrollable={true} maxHeight="200px">
        <div>content</div>
      </Scrollable>
    )
    const content = container.querySelector('.scrollable-content')
    expect(content?.classList.contains('scrollable')).toBe(true)
  })

  it('does not apply scrollable class when scrollable=false', () => {
    const { container } = render(
      <Scrollable scrollable={false} maxHeight="200px">
        <div>content</div>
      </Scrollable>
    )
    const content = container.querySelector('.scrollable-content')
    expect(content?.classList.contains('scrollable')).toBe(false)
  })

  it('renders overlay when provided', () => {
    render(
      <Scrollable
        scrollable={false}
        maxHeight="200px"
        overlay={() => <span data-testid="overlay-content">▲</span>}
      >
        <div>content</div>
      </Scrollable>
    )
    expect(screen.getByTestId('overlay-content')).toBeTruthy()
  })

  it('passes scroll state to overlay', () => {
    const overlaySpy = vi.fn(() => <span>indicator</span>)
    render(
      <Scrollable scrollable={false} maxHeight="200px" overlay={overlaySpy}>
        <div>content</div>
      </Scrollable>
    )
    expect(overlaySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canScrollUp: false,
        canScrollDown: false,
      })
    )
  })

  it('exposes scrollToBottom via ref', () => {
    function TestComponent() {
      const ref = useRef<ScrollableHandle>(null)
      return (
        <>
          <Scrollable ref={ref} scrollable={true} maxHeight="100px">
            <div style={{ height: 500 }}>tall content</div>
          </Scrollable>
          <button onClick={() => ref.current?.scrollToBottom()}>scroll bottom</button>
        </>
      )
    }
    render(<TestComponent />)
    // Should not throw
    fireEvent.click(screen.getByText('scroll bottom'))
  })

  it('exposes getLineHeight via ref', () => {
    const ref = { current: null as ScrollableHandle | null }
    render(
      <Scrollable
        ref={ref}
        scrollable={false}
        maxHeight="200px"
      >
        <div>content</div>
      </Scrollable>
    )
    const lh = ref.current?.getLineHeight()
    expect(typeof lh).toBe('number')
    expect(lh).toBeGreaterThan(0)
  })

  it('does not render overlay when not provided', () => {
    const { container } = render(
      <Scrollable scrollable={false} maxHeight="200px">
        <div>content</div>
      </Scrollable>
    )
    expect(container.querySelector('.scrollable-overlay')).toBeNull()
  })

  it('applies custom className', () => {
    const { container } = render(
      <Scrollable scrollable={false} maxHeight="200px" className="custom">
        <div>content</div>
      </Scrollable>
    )
    expect(container.querySelector('.scrollable-wrapper.custom')).toBeTruthy()
  })
})
