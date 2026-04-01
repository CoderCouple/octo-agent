/**
 * PTY adapter: listens to node-pty onData events, strips ANSI codes,
 * and emits InboundMessage objects to the gateway.
 */
import type { InboundMessage } from '../../../shared/types'

type PtyDataCallback = (message: InboundMessage) => void

// Strip ANSI escape sequences for cleaner parsing
const ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '')
}

/**
 * Attach a PTY adapter that converts raw PTY data into InboundMessages.
 * Returns a disposer function.
 */
export function attachPtyAdapter(
  sessionId: string,
  ptyProcess: { onData: (callback: (data: string) => void) => { dispose: () => void } },
  onMessage: PtyDataCallback,
): { dispose: () => void } {
  // Buffer to accumulate partial lines
  let buffer = ''

  const disposable = ptyProcess.onData((data: string) => {
    buffer += data

    // Process complete lines
    const lines = buffer.split('\n')
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() || ''

    for (const line of lines) {
      const cleaned = stripAnsi(line).trim()
      if (!cleaned) continue

      onMessage({
        sessionId,
        source: 'pty',
        raw: cleaned,
        timestamp: Date.now(),
      })
    }
  })

  return {
    dispose: () => {
      disposable.dispose()
      // Flush remaining buffer
      if (buffer.trim()) {
        const cleaned = stripAnsi(buffer).trim()
        if (cleaned) {
          onMessage({
            sessionId,
            source: 'pty',
            raw: cleaned,
            timestamp: Date.now(),
          })
        }
      }
      buffer = ''
    },
  }
}
