/**
 * Claude Code parser: converts hook JSON (primary) and PTY regex (fallback)
 * into typed AgentEvent objects.
 */
import { randomUUID } from 'crypto'
import type { AgentEvent, InboundMessage } from '../../../shared/types'

/**
 * Process a structured hook event from Claude Code's PostToolUse / Stop hooks.
 * Returns parsed AgentEvents.
 */
export function processHook(sessionId: string, hookData: Record<string, unknown>): AgentEvent[] {
  const events: AgentEvent[] = []
  const ts = Date.now()

  const hookType = hookData.hook_type as string | undefined
  const toolName = hookData.tool_name as string | undefined
  const toolInput = hookData.tool_input as Record<string, unknown> | undefined

  if (hookType === 'PostToolUse') {
    // File change events
    if (toolName === 'Write' || toolName === 'Edit') {
      const filePath = toolInput?.file_path as string | undefined
      events.push({
        id: randomUUID(),
        sessionId,
        type: 'fileChanged',
        timestamp: ts,
        data: { toolName, filePath },
      })
    }

    // Any tool use means agent is working
    events.push({
      id: randomUUID(),
      sessionId,
      type: 'toolUse',
      timestamp: ts,
      data: { toolName: toolName ?? 'unknown', ...hookData },
    })
  }

  if (hookType === 'Stop' || hookData.event === 'stop') {
    events.push({
      id: randomUUID(),
      sessionId,
      type: 'done',
      timestamp: ts,
      data: { reason: (hookData.reason as string) ?? 'completed' },
    })
  }

  // Permission request → waiting for input
  if (hookType === 'PreToolUse' || hookData.event === 'permission_request') {
    events.push({
      id: randomUUID(),
      sessionId,
      type: 'waitingForInput',
      timestamp: ts,
      data: {
        toolName: toolName ?? 'unknown',
        prompt: (hookData.description as string) ?? `Allow ${toolName}?`,
        ...hookData,
      },
    })
  }

  return events
}

/**
 * PTY regex fallback parser — extracts events from raw terminal output.
 * Used when hooks aren't available or as supplementary data.
 */
export function processPty(message: InboundMessage): AgentEvent[] {
  if (message.source !== 'pty') return []
  const text = typeof message.raw === 'string' ? message.raw : ''
  const events: AgentEvent[] = []
  const ts = message.timestamp

  // Detect "waiting for permission" patterns
  if (/Do you want to proceed\?/i.test(text) ||
      /Allow|Deny|Yes|No.*\?/i.test(text) ||
      /waiting for.*permission/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'waitingForInput',
      timestamp: ts,
      data: { prompt: text, source: 'pty-regex' },
    })
  }

  // Detect working patterns
  if (/^(Reading|Writing|Editing|Searching|Running|Executing)/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'working',
      timestamp: ts,
      data: { activity: text, source: 'pty-regex' },
    })
  }

  // Detect completion
  if (/^(Done|Completed|Finished|Task complete)/i.test(text) ||
      /I've completed/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'done',
      timestamp: ts,
      data: { message: text, source: 'pty-regex' },
    })
  }

  // Detect errors
  if (/^(Error|Failed|Exception)/i.test(text)) {
    events.push({
      id: randomUUID(),
      sessionId: message.sessionId,
      type: 'error',
      timestamp: ts,
      data: { message: text, source: 'pty-regex' },
    })
  }

  return events
}
