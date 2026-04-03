/**
 * OpenAI Codex CLI PTY regex parser.
 * Extracts AgentEvent objects from raw terminal output of the Codex CLI.
 */
import { randomUUID } from 'crypto'
import type { AgentEvent, InboundMessage } from '../../../shared/types'

/**
 * Parse PTY output from Codex CLI into typed AgentEvents.
 */
export function processPty(message: InboundMessage): AgentEvent[] {
  if (message.source !== 'pty') return []
  const text = typeof message.raw === 'string' ? message.raw : ''
  if (!text.trim()) return []
  const events: AgentEvent[] = []
  const ts = message.timestamp

  // Codex CLI permission prompts
  // e.g. "Allow command execution? [y/N]"
  // e.g. "Codex wants to run: npm test"
  // e.g. "Approve file write to src/foo.ts? (yes/no)"
  if (/Allow command execution/i.test(text) ||
      /Codex wants to/i.test(text) ||
      /Approve file write/i.test(text) ||
      /\[y\/N\]/i.test(text) ||
      /\(yes\/no\)/i.test(text) ||
      /Do you approve/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'waitingForInput',
      timestamp: ts,
      data: { prompt: text, source: 'pty-regex-codex' },
    })
  }

  // Working indicators
  // e.g. "Running...", "Executing command...", "Analyzing code..."
  if (/^(Running|Executing|Analyzing|Generating|Thinking|Processing)/i.test(text) ||
      /\.\.\.\s*$/m.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'working',
      timestamp: ts,
      data: { activity: text, source: 'pty-regex-codex' },
    })
  }

  // File changes
  // e.g. "Wrote src/foo.ts", "File written: bar.js", "Patched src/baz.ts"
  const fileWriteMatch = text.match(/(?:Wrote|File written:|Patched|Created|Modified)\s+(.+?)(?:\s|$)/i)
  if (fileWriteMatch) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'fileChanged',
      timestamp: ts,
      data: { filePath: fileWriteMatch[1].trim(), source: 'pty-regex-codex' },
    })
  }

  // Completion
  if (/^(Done|Completed|Finished|Task complete)/i.test(text) ||
      /I've completed/i.test(text) ||
      /session ended/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'done',
      timestamp: ts,
      data: { message: text, source: 'pty-regex-codex' },
    })
  }

  // Errors
  if (/^(Error|Failed|Exception|APIError)/i.test(text) ||
      /rate limit/i.test(text) ||
      /token limit/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'error',
      timestamp: ts,
      data: { message: text, source: 'pty-regex-codex' },
    })
  }

  return events
}
