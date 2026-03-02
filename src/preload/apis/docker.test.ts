import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

import { dockerApi } from './docker'

describe('preload docker API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('calls docker:status', async () => {
    mockInvoke.mockResolvedValue({ available: true })
    const result = await dockerApi.status()
    expect(mockInvoke).toHaveBeenCalledWith('docker:status')
    expect(result).toEqual({ available: true })
  })

  it('calls docker:containerInfo with repoDir', async () => {
    mockInvoke.mockResolvedValue({ containerId: 'abc', status: 'running' })
    const result = await dockerApi.containerInfo('/Users/rob/my-repo')
    expect(mockInvoke).toHaveBeenCalledWith('docker:containerInfo', '/Users/rob/my-repo')
    expect(result).toEqual({ containerId: 'abc', status: 'running' })
  })

  it('returns null when no container exists', async () => {
    mockInvoke.mockResolvedValue(null)
    const result = await dockerApi.containerInfo('/no-repo')
    expect(result).toBeNull()
  })

  it('calls docker:resetContainer with repoDir', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await dockerApi.resetContainer('/Users/rob/my-repo')
    expect(mockInvoke).toHaveBeenCalledWith('docker:resetContainer', '/Users/rob/my-repo')
  })
})
