/**
 * Gemini CLI PTY regex parser.
 * Extracts AgentEvent objects from raw terminal output of Google's Gemini CLI.
 */
import { randomUUID } from 'crypto'
import type { AgentEvent, InboundMessage } from '../../../shared/types'

/**
 * Parse PTY output from Gemini CLI into typed AgentEvents.
 */
export function processPty(message: InboundMessage): AgentEvent[] {
  if (message.source !== 'pty') return []
  const text = typeof message.raw === 'string' ? message.raw : ''
  if (!text.trim()) return []
  const events: AgentEvent[] = []
  const ts = message.timestamp

  // Gemini CLI permission prompts
  // e.g. "Allow Gemini to run shell command? (y/n)"
  // e.g. "Gemini wants to edit file.ts. Allow? [y/N]"
  if (/Allow Gemini to/i.test(text) ||
      /Gemini wants to/i.test(text) ||
      /\bAllow\?\s*\[/i.test(text) ||
      /\(y\/n\)/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'waitingForInput',
      timestamp: ts,
      data: { prompt: text, source: 'pty-regex-gemini' },
    })
  }

  // Working indicators
  // e.g. "Thinking...", "Generating...", "Searching...", "Reading file..."
  if (/^(Thinking|Generating|Searching|Reading|Analyzing|Processing)/i.test(text) ||
      /\.\.\.\s*$/m.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'working',
      timestamp: ts,
      data: { activity: text, source: 'pty-regex-gemini' },
    })
  }

  // File changes
  // e.g. "Wrote to src/foo.ts", "Updated file: bar.js", "Created src/new.ts"
  const fileWriteMatch = text.match(/(?:Wrote to|Updated file:|Created|Modified)\s+(.+?)(?:\s|$)/i)
  if (fileWriteMatch) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'fileChanged',
      timestamp: ts,
      data: { filePath: fileWriteMatch[1].trim(), source: 'pty-regex-gemini' },
    })
  }

  // Completion
  if (/^(Done|Completed|Finished|Task complete)/i.test(text) ||
      /I've completed/i.test(text) ||
      /^Gemini\s*>/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'done',
      timestamp: ts,
      data: { message: text, source: 'pty-regex-gemini' },
    })
  }

  // Errors
  if (/^(Error|Failed|Exception|APIError)/i.test(text) ||
      /rate limit/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'error',
      timestamp: ts,
      data: { message: text, source: 'pty-regex-gemini' },
    })
  }

  return events
}
