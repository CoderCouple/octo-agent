// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPtyDataHandler } from './ptyDataHandler'

vi.mock('../utils/terminalActivityDetector', () => ({
  evaluateActivity: vi.fn().mockReturnValue({ status: null, scheduleIdle: false }),
}))

function makeTerminal() {
  return {
    write: vi.fn(),
    buffer: { active: { viewportY: 0, baseY: 0 } },
    cols: 80,
    rows: 24,
    resize: vi.fn(),
  } as unknown as import('@xterm/xterm').Terminal
}

function makeState() {
  return {
    processPlanDetection: vi.fn(),
    lastUserInputRef: { current: 0 },
    lastInteractionRef: { current: 0 },
    lastStatusRef: { current: 'idle' as const },
    idleTimeoutRef: { current: null } as { current: ReturnType<typeof setTimeout> | null },
    scheduleUpdate: vi.fn(),
  }
}

describe('createPtyDataHandler', () => {
  let terminal: ReturnType<typeof makeTerminal>
  let state: ReturnType<typeof makeState>

  beforeEach(() => {
    vi.clearAllMocks()
    terminal = makeTerminal()
    state = makeState()
  })

  function createHandler(overrides: { isAgent?: boolean } = {}) {
    return createPtyDataHandler({
      terminal,
      isAgent: overrides.isAgent ?? false,
      state,
      effectStartTime: Date.now(),
    })
  }

  it('writes data to terminal', () => {
    const handler = createHandler()
    handler.handleData('hello')
    expect(terminal.write).toHaveBeenCalledWith('hello')
  })

  it('does not call scrollToBottom — xterm 6 handles scroll pinning natively', () => {
    const handler = createHandler()
    handler.handleData('data')
    expect((terminal as { scrollToBottom?: unknown }).scrollToBottom).toBeUndefined()
  })

  it('always writes data to terminal regardless of visibility', () => {
    const handler = createHandler()
    handler.handleData('hello')
    handler.handleData(' world')
    expect(terminal.write).toHaveBeenCalledTimes(2)
    expect(terminal.write).toHaveBeenCalledWith('hello')
    expect(terminal.write).toHaveBeenCalledWith(' world')
  })

  it('runs activity detection for agent terminals', async () => {
    const { evaluateActivity } = await import('../utils/terminalActivityDetector')
    vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: true })

    const handler = createHandler({ isAgent: true })
    handler.handleData('output')

    expect(evaluateActivity).toHaveBeenCalled()
    expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'working' })
  })

  it('does not run activity detection for non-agent terminals', () => {
    const handler = createHandler({ isAgent: false })
    handler.handleData('output')
    expect(state.processPlanDetection).not.toHaveBeenCalled()
  })

  it('schedules idle timeout when scheduleIdle is true and status is not working', async () => {
    vi.useFakeTimers()
    const { evaluateActivity } = await import('../utils/terminalActivityDetector')
    vi.mocked(evaluateActivity).mockReturnValue({ status: null, scheduleIdle: true })

    const handler = createHandler({ isAgent: true })
    handler.handleData('output')

    // Idle timeout not yet fired
    expect(state.scheduleUpdate).not.toHaveBeenCalledWith({ status: 'idle' })

    // Existing idle timeout should have been cleared and a new one scheduled
    vi.advanceTimersByTime(1000)
    expect(state.lastStatusRef.current).toBe('idle')
    expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'idle' })

    vi.useRealTimers()
  })

  it('clears previous idle timeout when scheduleIdle and status is not working', async () => {
    vi.useFakeTimers()
    const { evaluateActivity } = await import('../utils/terminalActivityDetector')
    vi.mocked(evaluateActivity).mockReturnValue({ status: null, scheduleIdle: true })

    const handler = createHandler({ isAgent: true })
    // Set up an existing idle timeout
    state.idleTimeoutRef.current = setTimeout(() => {}, 5000)
    handler.handleData('output')

    // The old timeout should have been replaced
    vi.advanceTimersByTime(1000)
    expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'idle' })

    vi.useRealTimers()
  })
})
