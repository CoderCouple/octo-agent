/**
 * Ring buffer that records terminal scroll events for debugging.
 *
 * Each terminal instance gets its own ScrollLog. Events are tagged with
 * a source (what triggered the scroll) and capture both the xterm buffer
 * state and the DOM viewport state at the time of the event.
 *
 * Logs are retrieved via the global scrollLogRegistry for inclusion in
 * the Cmd+Shift+C debug dump.
 */

import { Terminal as XTerm } from '@xterm/xterm'

export type ScrollSource =
  | 'wheel-up'
  | 'wheel-down'
  | 'key-pageup'
  | 'key-pagedown'
  | 'key-shift-arrow'
  | 'xterm-scroll'       // onScroll event with no recent user gesture
  | 'scroll-to-bottom'   // explicit handleScrollToBottom call
  | 'scroll-restored'    // defensive restore after unexpected jump
  | 'write'              // data write happened
  | 'resize'             // fitAddon.fit() / terminal.resize()

export interface ScrollEvent {
  t: number             // timestamp (ms since terminal creation)
  source: ScrollSource
  viewportY: number
  baseY: number
  /** DOM scrollTop of .xterm-viewport (if available). */
  scrollTop?: number
  /** DOM scrollHeight of .xterm-viewport (if available). */
  scrollHeight?: number
  /** DOM clientHeight of .xterm-viewport (if available). */
  clientHeight?: number
  following: boolean
  /** Extra context, e.g. "jumped from 450 to 0". */
  detail?: string
}

const MAX_EVENTS = 100

export class ScrollLog {
  private events: ScrollEvent[] = []
  private startTime: number

  constructor() {
    this.startTime = Date.now()
  }

  add(event: Omit<ScrollEvent, 't'>) {
    const entry: ScrollEvent = { t: Date.now() - this.startTime, ...event }
    this.events.push(entry)
    if (this.events.length > MAX_EVENTS) {
      this.events.shift()
    }
  }

  format(): string {
    if (this.events.length === 0) return '(no scroll events recorded)'
    const lines = this.events.map((e) => {
      const ts = `${(e.t / 1000).toFixed(2)}s`
      const pos = `vY=${e.viewportY} bY=${e.baseY}`
      const dom = e.scrollTop !== undefined
        ? ` dom(sT=${e.scrollTop} sH=${e.scrollHeight} cH=${e.clientHeight})`
        : ''
      const fol = e.following ? ' [following]' : ' [scrolled-up]'
      const det = e.detail ? ` -- ${e.detail}` : ''
      return `  ${ts} ${e.source.padEnd(18)} ${pos}${dom}${fol}${det}`
    })
    return lines.join('\n')
  }
}

// ── Global registry so debug copy can access logs ──────────────────

const logs = new Map<string, ScrollLog>()

export const scrollLogRegistry = {
  register(sessionId: string, log: ScrollLog) {
    logs.set(sessionId, log)
  },
  unregister(sessionId: string) {
    logs.delete(sessionId)
  },
  get(sessionId: string): ScrollLog | undefined {
    return logs.get(sessionId)
  },
  format(sessionId: string): string {
    return logs.get(sessionId)?.format() ?? '(no scroll log)'
  },
}

// ── Scroll lock ────────────────────────────────────────────────────
//
// Locks the xterm viewport's scrollTop so it can only change when:
//   1. The user is following (at bottom) — new output naturally pushes down.
//   2. The user explicitly scrolled (wheel, key, or "Go to End" button).
//
// Any other scrollTop change (e.g. xterm reflow, DOM reattach, spacer
// height glitch) is immediately reverted and logged.

export interface ScrollLockDeps {
  terminal: XTerm
  isFollowingRef: React.MutableRefObject<boolean>
  lastUserGestureTime: () => number
  scrollLog: ScrollLog
  viewportEl: HTMLElement
}

export interface ScrollLockHandle {
  cleanup: () => void
}

export function setupScrollLock(deps: ScrollLockDeps): ScrollLockHandle {
  const { terminal, isFollowingRef, lastUserGestureTime, scrollLog, viewportEl } = deps
  let savedScrollTop = viewportEl.scrollTop
  let isRestoring = false

  const handleScroll = () => {
    if (isRestoring) return
    const newScrollTop = viewportEl.scrollTop

    if (isFollowingRef.current) {
      savedScrollTop = newScrollTop
      return
    }

    const timeSinceGesture = Date.now() - lastUserGestureTime()
    if (timeSinceGesture < 300) {
      savedScrollTop = newScrollTop
      return
    }

    // No user gesture, not following — revert.
    if (newScrollTop !== savedScrollTop) {
      scrollLog.add({
        source: 'scroll-restored',
        viewportY: terminal.buffer.active.viewportY,
        baseY: terminal.buffer.active.baseY,
        scrollTop: newScrollTop,
        scrollHeight: viewportEl.scrollHeight,
        clientHeight: viewportEl.clientHeight,
        following: false,
        detail: `scrollTop ${savedScrollTop} -> ${newScrollTop} with no gesture (${timeSinceGesture}ms ago) -- reverting`,
      })
      isRestoring = true
      viewportEl.scrollTop = savedScrollTop
      isRestoring = false
    }
  }

  viewportEl.addEventListener('scroll', handleScroll)

  // Also log via xterm's onScroll for buffer-level position tracking.
  terminal.onScroll((newViewportY: number) => {
    if (isRestoring) return
    const timeSinceGesture = Date.now() - lastUserGestureTime()
    if (!isFollowingRef.current && timeSinceGesture >= 300) {
      scrollLog.add({
        source: 'xterm-scroll',
        viewportY: newViewportY,
        baseY: terminal.buffer.active.baseY,
        scrollTop: viewportEl.scrollTop,
        scrollHeight: viewportEl.scrollHeight,
        clientHeight: viewportEl.clientHeight,
        following: false,
        detail: `no gesture for ${timeSinceGesture}ms`,
      })
    }
  })

  return { cleanup: () => viewportEl.removeEventListener('scroll', handleScroll) }
}
