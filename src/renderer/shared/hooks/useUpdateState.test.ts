// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpdateState, _resetForTesting } from './useUpdateState'

beforeEach(() => {
  _resetForTesting()
  vi.mocked(window.app.getVersion).mockResolvedValue('0.8.0')
  vi.mocked(window.update.checkForUpdates).mockResolvedValue({ updateAvailable: false })
  vi.mocked(window.update.onUpdateAvailable).mockReturnValue(() => {})
  vi.mocked(window.update.onDownloadProgress).mockReturnValue(() => {})
  vi.mocked(window.update.onUpdateDownloaded).mockReturnValue(() => {})
})

describe('useUpdateState', () => {
  it('loads current version on mount', async () => {
    const { result } = renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    expect(result.current.currentVersion).toBe('0.8.0')
  })

  it('stays idle when no update available', async () => {
    const { result } = renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    expect(result.current.updateState.status).toBe('idle')
  })

  it('sets available state when update found on check', async () => {
    vi.mocked(window.update.checkForUpdates).mockResolvedValue({
      updateAvailable: true,
      version: '0.9.0',
    })

    const { result } = renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    expect(result.current.updateState).toEqual({
      status: 'available',
      version: '0.9.0',
    })
  })

  it('sets available state and opens popover on menu-triggered update', async () => {
    let capturedCallback: ((info: { version: string }) => void) | null = null
    vi.mocked(window.update.onUpdateAvailable).mockImplementation((cb) => {
      capturedCallback = cb
      return () => {}
    })

    const { result } = renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    expect(result.current.popoverOpen).toBe(false)

    act(() => {
      capturedCallback!({ version: '1.0.0' })
    })

    expect(result.current.updateState).toEqual({
      status: 'available',
      version: '1.0.0',
    })
    expect(result.current.popoverOpen).toBe(true)
  })

  it('tracks download progress', async () => {
    let capturedCallback: ((percent: number) => void) | null = null
    vi.mocked(window.update.onDownloadProgress).mockImplementation((cb) => {
      capturedCallback = cb
      return () => {}
    })

    const { result } = renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    act(() => {
      capturedCallback!(50)
    })

    expect(result.current.updateState).toEqual({
      status: 'downloading',
      percent: 50,
    })
  })

  it('sets ready state when download completes', async () => {
    let capturedCallback: (() => void) | null = null
    vi.mocked(window.update.onUpdateDownloaded).mockImplementation((cb) => {
      capturedCallback = cb
      return () => {}
    })

    const { result } = renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    act(() => {
      capturedCallback!()
    })

    expect(result.current.updateState.status).toBe('ready')
  })

  it('only initializes once across multiple hook instances', async () => {
    renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    const callsBefore = vi.mocked(window.update.checkForUpdates).mock.calls.length

    renderHook(() => useUpdateState())
    await act(() => Promise.resolve())

    expect(vi.mocked(window.update.checkForUpdates).mock.calls.length).toBe(callsBefore)
  })
})
