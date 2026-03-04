import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

import { devcontainerApi } from './devcontainer'

describe('preload devcontainer API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('status invokes devcontainer:status', async () => {
    mockInvoke.mockResolvedValue({ available: true, version: '0.71.0' })
    const result = await devcontainerApi.status()
    expect(mockInvoke).toHaveBeenCalledWith('devcontainer:status')
    expect(result).toEqual({ available: true, version: '0.71.0' })
  })

  it('hasConfig invokes devcontainer:hasConfig', async () => {
    mockInvoke.mockResolvedValue(true)
    const result = await devcontainerApi.hasConfig('/workspace')
    expect(mockInvoke).toHaveBeenCalledWith('devcontainer:hasConfig', '/workspace')
    expect(result).toBe(true)
  })

  it('generateDefaultConfig invokes devcontainer:generateDefaultConfig', async () => {
    await devcontainerApi.generateDefaultConfig('/workspace')
    expect(mockInvoke).toHaveBeenCalledWith('devcontainer:generateDefaultConfig', '/workspace')
  })
})
