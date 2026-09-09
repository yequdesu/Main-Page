import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ChargeEnergyBar from '../ChargeEnergyBar'
import { chargeGates, resetChargeGates, publishChargeGates } from '../../behaviors/chargeGates'
vi.mock('../../composition/actorRuntime', () => ({ useActorRuntime: vi.fn() }))
afterEach(() => { cleanup(); resetChargeGates() })
it('shows only at a gate and fills the capsule with a circular-ended white bar', () => {
  render(<ChargeEnergyBar />)
  const bar = screen.getByRole('progressbar', { hidden: true })
  expect(bar.getAttribute('aria-hidden')).toBe('true')
  chargeGates.active = 0; chargeGates.energy = .5; publishChargeGates()
  expect(bar.getAttribute('aria-hidden')).toBe('false')
  expect(bar.getAttribute('aria-valuenow')).toBe('50')
  const fill = bar.querySelectorAll('rect')[1]
  expect(fill.getAttribute('width')).toBe('58')
  expect(fill.getAttribute('rx')).toBe('4')
  chargeGates.energy = 1; publishChargeGates()
  expect(fill.getAttribute('width')).toBe('108')
  chargeGates.active = -1; publishChargeGates()
  expect(bar.getAttribute('aria-hidden')).toBe('true')
})
