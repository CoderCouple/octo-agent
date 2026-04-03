// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../../test/setup'
import { useIssuePlanDetection } from './useIssuePlanDetection'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useIssuePlanDetection', () => {
  it('returns false when sessionId is null', () => {
    const { result } = renderHook(() => useIssuePlanDetection(null, '/repos/project'))
    expect(result.current).toBe(false)
  })

  it('returns false when directory is undefined', () => {
    const { result } = renderHook(() => useIssuePlanDetection('session-1', undefined))
    expect(result.current).toBe(false)
  })

  it('checks file existence on mount', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)

    let result: { current: boolean }
    await act(async () => {
      const hook = renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))
      result = hook.result
    })

    expect(result!.current).toBe(true)
    expect(window.fs.exists).toHaveBeenCalledWith('/repos/project/.octoagent/output/plan.md')
  })

  it('sets up a file watcher on the output directory', () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)

    renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))

    expect(window.fs.watch).toHaveBeenCalledWith('issue-plan-session-1', '/repos/project/.octoagent/output')
    expect(window.fs.onChange).toHaveBeenCalledWith('issue-plan-session-1', expect.any(Function))
  })

  it('re-checks existence when plan.md change event fires', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    let changeCallback: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeCallback = cb
      return () => {}
    })

    let result: { current: boolean }
    await act(async () => {
      const hook = renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))
      result = hook.result
    })

    expect(result!.current).toBe(false)

    // Simulate plan.md being created
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)
    await act(async () => {
      changeCallback({ eventType: 'rename', filename: 'plan.md' })
    })

    expect(result!.current).toBe(true)
  })

  it('ignores change events for other files', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    let changeCallback: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeCallback = cb
      return () => {}
    })

    await act(async () => {
      renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))
    })

    // Reset call count after initial check
    vi.mocked(window.fs.exists).mockClear()

    await act(async () => {
      changeCallback({ eventType: 'change', filename: 'other.md' })
    })

    expect(window.fs.exists).not.toHaveBeenCalled()
  })

  it('cleans up watcher on unmount', () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    const removeListener = vi.fn()
    vi.mocked(window.fs.onChange).mockReturnValue(removeListener)

    const { unmount } = renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))
    unmount()

    expect(removeListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('issue-plan-session-1')
  })

  it('does not set up watcher when sessionId is null', () => {
    renderHook(() => useIssuePlanDetection(null, '/repos/project'))

    expect(window.fs.watch).not.toHaveBeenCalled()
    expect(window.fs.onChange).not.toHaveBeenCalled()
  })
})
