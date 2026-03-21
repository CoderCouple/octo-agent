/**
 * Handles incoming PTY data by writing to the xterm instance and detecting agent activity transitions.
 *
 * Scroll pinning is handled natively by xterm.js 6 — it keeps the viewport
 * at the bottom when data arrives (if already there) and stays put when
 * the user has scrolled away.  We do NOT call scrollToBottom() ourselves.
 *
 * Data is always written directly to the terminal — xterm 6 is fast enough
 * that background (invisible) terminals don't need buffering.
 */
import { Terminal as XTerm } from '@xterm/xterm'
import { evaluateActivity } from '../utils/terminalActivityDetector'

interface TerminalStateForPtyData {
  processPlanDetection: (data: string) => void
  lastUserInputRef: React.MutableRefObject<number>
  lastInteractionRef: React.MutableRefObject<number>
  lastStatusRef: React.MutableRefObject<'working' | 'idle'>
  idleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  scheduleUpdate: (update: { status?: 'working' | 'idle' | 'error'; lastMessage?: string }) => void
}

interface CreatePtyDataHandlerArgs {
  terminal: XTerm
  isAgent: boolean
  state: TerminalStateForPtyData
  effectStartTime: number
}

interface PtyDataHandlerController {
  handleData: (data: string) => void
  clearTimers: () => void
}

export function createPtyDataHandler(args: CreatePtyDataHandlerArgs): PtyDataHandlerController {
  const { terminal, isAgent, state, effectStartTime } = args

  const processActivityDetection = (data: string) => {
    if (!isAgent) return

    state.processPlanDetection(data)
    const now = Date.now()
    const result = evaluateActivity(data.length, now, {
      lastUserInput: state.lastUserInputRef.current,
      lastInteraction: state.lastInteractionRef.current,
      lastStatus: state.lastStatusRef.current,
      startTime: effectStartTime,
    })
    if (result.status === 'working') {
      if (state.idleTimeoutRef.current) clearTimeout(state.idleTimeoutRef.current)
      state.lastStatusRef.current = 'working'
      state.scheduleUpdate({ status: 'working' })
    }
    if (result.scheduleIdle) {
      if (result.status !== 'working' && state.idleTimeoutRef.current) clearTimeout(state.idleTimeoutRef.current)
      state.idleTimeoutRef.current = setTimeout(() => {
        state.lastStatusRef.current = 'idle'
        state.scheduleUpdate({ status: 'idle' })
      }, 1000)
    }
  }

  const handleData = (data: string) => {
    processActivityDetection(data)
    terminal.write(data)
  }

  const clearTimers = () => {
    // Reserved for future cleanup — currently no timers owned by the data handler.
  }

  return { handleData, clearTimers }
}
