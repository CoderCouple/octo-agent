// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../../test/react-setup'
import { createPtyDataHandler } from './ptyDataHandler'

vi.mock('../utils/terminalActivityDetector', () => ({
  evaluateActivity: vi.fn().mockReturnValue({ status: null, scheduleIdle: false }),
}))

// Mock requestAnimationFrame to execute immediately
vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
vi.stubGlobal('cancelAnimationFrame', vi.fn())

function makeMockTerminal() {
  const writeCbs: (() => void)[] = []
  return {
    buffer: { active: { viewportY: 0, baseY: 0, cursorY: 0 } },
    write: vi.fn((data: string, cb?: () => void) => { if (cb) writeCbs.push(cb) }),
    scrollToBottom: vi.fn(),
    _flushWriteCallbacks() {
      while (writeCbs.length) writeCbs.shift()!()
    },
  }
}

function makeMockHelpers() {
  return {
    isAtBottom: vi.fn().mockReturnValue(true),
    forceViewportSync: vi.fn(),
    isViewportDesynced: vi.fn().mockReturnValue(false),
    isScrollStuck: vi.fn().mockReturnValue(false),
  }
}

function makeMockState() {
  return {
    isFollowingRef: { current: true },
    processPlanDetection: vi.fn(),
    lastUserInputRef: { current: 0 },
    lastInteractionRef: { current: 0 },
    lastStatusRef: { current: 'idle' as 'working' | 'idle' },
    idleTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    scheduleUpdate: vi.fn(),
  }
}

function makeMockScrollTracking() {
  return {
    state: { pendingScrollRAF: 0 },
    logScrollDiag: vi.fn(),
  }
}

describe('createPtyDataHandler', () => {
  let terminal: ReturnType<typeof makeMockTerminal>
  let helpers: ReturnType<typeof makeMockHelpers>
  let state: ReturnType<typeof makeMockState>
  let scrollTracking: ReturnType<typeof makeMockScrollTracking>
  let viewportEl: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    terminal = makeMockTerminal()
    helpers = makeMockHelpers()
    state = makeMockState()
    scrollTracking = makeMockScrollTracking()
    viewportEl = document.createElement('div')
    Object.defineProperty(viewportEl, 'clientHeight', { value: 600, configurable: true })
    Object.defineProperty(viewportEl, 'scrollHeight', { value: 1200, configurable: true })
    Object.defineProperty(viewportEl, 'scrollTop', { value: 0, writable: true, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createHandler(overrides: Record<string, unknown> = {}) {
    return createPtyDataHandler({
      terminal: terminal as never,
      viewportEl,
      helpers,
      scrollTracking,
      isAgent: false,
      state,
      effectStartTime: Date.now(),
      ...overrides,
    })
  }

  it('writes data to the terminal', () => {
    const handler = createHandler()
    handler.handleData('hello')
    expect(terminal.write).toHaveBeenCalledWith('hello', expect.any(Function))
  })

  it('scrolls to bottom when following and data arrives', () => {
    state.isFollowingRef.current = true
    // rAF inside the write callback needs to execute too
    // Our global mock executes rAF immediately, but scrollToBottomRAF
    // guards against re-entry. Reset the mock to return unique IDs.
    let rafId = 0
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return ++rafId })

    const handler = createHandler()
    handler.handleData('data')
    terminal._flushWriteCallbacks()
    expect(terminal.scrollToBottom).toHaveBeenCalled()
  })

  it('does not scroll to bottom when not following', () => {
    state.isFollowingRef.current = false
    const handler = createHandler()
    handler.handleData('data')
    terminal._flushWriteCallbacks()
    expect(terminal.scrollToBottom).not.toHaveBeenCalled()
  })

  it('forces viewport sync when scrollToBottom leaves terminal not at bottom', () => {
    helpers.isAtBottom.mockReturnValue(false)
    state.isFollowingRef.current = true
    let rafId = 0
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return ++rafId })

    const handler = createHandler()
    handler.handleData('data')
    terminal._flushWriteCallbacks()
    expect(helpers.forceViewportSync).toHaveBeenCalled()
    // Should call scrollToBottom again after sync
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(2)
  })

  it('handles screen clear sequences', () => {
    const handler = createHandler()
    handler.handleData('\x1b[2J')
    terminal._flushWriteCallbacks()
    expect(helpers.forceViewportSync).toHaveBeenCalled()
  })

  it('handles scrollback clear sequences', () => {
    const handler = createHandler()
    handler.handleData('\x1b[3J')
    terminal._flushWriteCallbacks()
    expect(helpers.forceViewportSync).toHaveBeenCalled()
  })

  it('resets scrollTop when stale after screen clear', () => {
    Object.defineProperty(viewportEl, 'scrollHeight', { value: 100, configurable: true })
    Object.defineProperty(viewportEl, 'clientHeight', { value: 100, configurable: true })
    viewportEl.scrollTop = 500 // stale value higher than max
    const handler = createHandler()
    handler.handleData('\x1b[2J')
    terminal._flushWriteCallbacks()
    expect(viewportEl.scrollTop).toBe(0)
  })

  it('schedules sync check timeout on first data', () => {
    const handler = createHandler()
    handler.handleData('data')
    // Sync check triggers after 500ms
    vi.advanceTimersByTime(500)
    // With defaults (not desynced, not stuck) no sync should happen
    expect(helpers.forceViewportSync).not.toHaveBeenCalled()
  })

  it('forces viewport sync when desynced during sync check', () => {
    helpers.isViewportDesynced.mockReturnValue(true)
    const handler = createHandler()
    handler.handleData('data')
    vi.advanceTimersByTime(500)
    expect(helpers.forceViewportSync).toHaveBeenCalled()
    expect(scrollTracking.logScrollDiag).toHaveBeenCalledWith(
      'sync check: forcing viewport sync',
      expect.objectContaining({ desynced: true }),
    )
  })

  it('forces viewport sync when stuck scrolling down', () => {
    helpers.isScrollStuck.mockImplementation((dir: number) => dir === 1)
    const handler = createHandler()
    handler.handleData('data')
    vi.advanceTimersByTime(500)
    expect(helpers.forceViewportSync).toHaveBeenCalled()
  })

  it('forces viewport sync when stuck scrolling up', () => {
    helpers.isScrollStuck.mockImplementation((dir: number) => dir === -1)
    const handler = createHandler()
    handler.handleData('data')
    vi.advanceTimersByTime(500)
    expect(helpers.forceViewportSync).toHaveBeenCalled()
  })

  it('skips sync check when viewport has zero height', () => {
    Object.defineProperty(viewportEl, 'clientHeight', { value: 0, configurable: true })
    helpers.isViewportDesynced.mockReturnValue(true)
    const handler = createHandler()
    handler.handleData('data')
    vi.advanceTimersByTime(500)
    expect(helpers.forceViewportSync).not.toHaveBeenCalled()
  })

  it('does not run sync check on null viewportEl', () => {
    const handler = createPtyDataHandler({
      terminal: terminal as never,
      viewportEl: null,
      helpers,
      scrollTracking,
      isAgent: false,
      state,
      effectStartTime: Date.now(),
    })
    handler.handleData('data')
    vi.advanceTimersByTime(500)
    // Should not throw
  })

  it('does not create multiple sync check timeouts', () => {
    const handler = createHandler()
    handler.handleData('data1')
    handler.handleData('data2')
    handler.handleData('data3')
    // Only one timeout should be pending
    vi.advanceTimersByTime(500)
    // If multiple were created, forceViewportSync would be called multiple times
    // With defaults (not desynced), it shouldn't be called at all
    expect(helpers.forceViewportSync).not.toHaveBeenCalled()
  })

  describe('agent activity detection', () => {
    it('calls processPlanDetection for agent terminals', () => {
      const handler = createHandler({ isAgent: true })
      handler.handleData('some data')
      expect(state.processPlanDetection).toHaveBeenCalledWith('some data')
    })

    it('does not call processPlanDetection for non-agent terminals', () => {
      const handler = createHandler({ isAgent: false })
      handler.handleData('some data')
      expect(state.processPlanDetection).not.toHaveBeenCalled()
    })

    it('sets working status when evaluateActivity returns working', async () => {
      const { evaluateActivity } = await import('../utils/terminalActivityDetector')
      vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: false })

      const handler = createHandler({ isAgent: true })
      handler.handleData('working data')
      expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'working' })
      expect(state.lastStatusRef.current).toBe('working')
    })

    it('clears existing idle timeout when working', async () => {
      const { evaluateActivity } = await import('../utils/terminalActivityDetector')
      vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: false })

      const existingTimeout = setTimeout(() => {}, 10000)
      state.idleTimeoutRef.current = existingTimeout

      const handler = createHandler({ isAgent: true })
      handler.handleData('working data')
      // The existing timeout should have been cleared
      expect(state.lastStatusRef.current).toBe('working')
    })

    it('schedules idle timeout when evaluateActivity says scheduleIdle', async () => {
      const { evaluateActivity } = await import('../utils/terminalActivityDetector')
      vi.mocked(evaluateActivity).mockReturnValue({ status: null, scheduleIdle: true })

      const handler = createHandler({ isAgent: true })
      handler.handleData('some data')
      // Idle timeout should be set
      expect(state.idleTimeoutRef.current).not.toBeNull()
      // After 1000ms, should set idle
      vi.advanceTimersByTime(1000)
      expect(state.lastStatusRef.current).toBe('idle')
      expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'idle' })
    })

    it('handles working + scheduleIdle together', async () => {
      const { evaluateActivity } = await import('../utils/terminalActivityDetector')
      vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: true })

      const handler = createHandler({ isAgent: true })
      handler.handleData('data')
      expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'working' })
      // Should also schedule idle
      vi.advanceTimersByTime(1000)
      expect(state.lastStatusRef.current).toBe('idle')
    })
  })

  describe('write jump detection', () => {
    it('logs write jumps when viewportY changes significantly', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      helpers.isAtBottom.mockReturnValue(false)

      const handler = createHandler()
      // First write sets lastWriteViewportY
      handler.handleData('first')
      terminal._flushWriteCallbacks()

      // Simulate a big viewport jump
      terminal.buffer.active.viewportY = 10
      handler.handleData('second')
      terminal._flushWriteCallbacks()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WRITE JUMP'),
        expect.any(String),
      )
      consoleSpy.mockRestore()
    })

    it('does not log jumps when at bottom', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      helpers.isAtBottom.mockReturnValue(true)

      const handler = createHandler()
      handler.handleData('first')
      terminal._flushWriteCallbacks()

      terminal.buffer.active.viewportY = 10
      handler.handleData('second')
      terminal._flushWriteCallbacks()

      const jumpLogs = consoleSpy.mock.calls.filter(c => String(c[0]).includes('WRITE JUMP'))
      expect(jumpLogs).toHaveLength(0)
      consoleSpy.mockRestore()
    })
  })

  describe('clearTimers', () => {
    it('clears sync check timeout', () => {
      const handler = createHandler()
      handler.handleData('data')
      // syncCheckTimeout is now set
      handler.clearTimers()
      // Advancing time should not trigger the sync check
      vi.advanceTimersByTime(500)
      expect(helpers.forceViewportSync).not.toHaveBeenCalled()
    })

    it('cancels scrollToBottom RAF', () => {
      // Override rAF to NOT execute immediately so we can test cancellation
      let rafCb: (() => void) | null = null
      vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { rafCb = cb; return 99 })
      const cancelRAF = vi.fn()
      vi.stubGlobal('cancelAnimationFrame', cancelRAF)

      state.isFollowingRef.current = true
      const handler = createHandler()
      handler.handleData('data')
      terminal._flushWriteCallbacks()
      // scrollToBottomRAF should be scheduled but not executed
      handler.clearTimers()
      expect(cancelRAF).toHaveBeenCalledWith(99)

      // Restore default rAF mock
      vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
      vi.stubGlobal('cancelAnimationFrame', vi.fn())
    })
  })
})
