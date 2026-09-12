import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CapturePanel from '../CapturePanel'
import { DEFAULT_CAPTURE_CONFIG } from '../../actors/LighthouseCaptureTypes'

// 不创建 WebGL；此处验证真实编辑表单、请求结果与草稿状态。
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('保存失败保留参数；重新加载会恢复磁盘值', async () => {
  const saved = { ...DEFAULT_CAPTURE_CONFIG, cameraY: -1.5 }
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => saved })
  vi.stubGlobal('fetch', fetchMock)
  render(<CapturePanel active={false} handle={null} readyVersion={0} />)
  const input = await screen.findByRole('textbox', { name: '相机 Y' })
  fireEvent.change(input, { target: { value: '-1.2' } })
  fireEvent.blur(input)
  await screen.findByText('● 有未保存参数')
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'disk full' }) })
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
  await screen.findByText('保存失败：disk full。调整已保留。')
  expect((screen.getByRole('textbox', { name: '相机 Y' }) as HTMLInputElement).value).toBe('-1.2')
  const body = JSON.parse(fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')![1].body)
  expect(body.cameraY).toBe(-1.2)
  expect(body).not.toHaveProperty('captureW')
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
  await waitFor(() =>
    expect((screen.getByRole('textbox', { name: '相机 Y' }) as HTMLInputElement).value).toBe('-1.5'),
  )
  await screen.findByText('✓ 参数与已保存配置一致')
})
