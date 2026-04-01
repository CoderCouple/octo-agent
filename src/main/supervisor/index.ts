/**
 * Supervisor: The brain of OctoAgent.
 * EventEmitter that receives typed AgentEvent objects only.
 * Orchestrates session queues, conflict detection, HITL decisions,
 * memory, briefings, and reports.
 *
 * Invariant #1: All state flows through the supervisor.
 */
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { AgentEvent, InboundMessage, Decision } from '../../shared/types'
import { SessionQueue } from './sessionQueue'
import { processHook, processPty } from './parsers/claudeCode'
import { appendTranscript, flush } from './sessionMemory'
import { createDecision, resolveDecision as resolveHitlDecision, clearSessionDecisions } from './hitl'
import { record as recordFile, clearSession as clearConflictSession } from './conflictDetector'

export class Supervisor extends EventEmitter {
  private queue = new SessionQueue()

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /**
   * Handle an inbound message from any adapter (PTY, hook, phone).
   * Parses it into AgentEvents and processes each.
   */
  handleInbound(message: InboundMessage): void {
    let events: AgentEvent[] = []

    if (message.source === 'hook' && typeof message.raw === 'object') {
      events = processHook(message.sessionId, message.raw as Record<string, unknown>)
    } else if (message.source === 'pty') {
      events = processPty(message)
    }

    for (const event of events) {
      this.handleEvent(event)
    }
  }

  /**
   * Process a single typed AgentEvent.
   * Logs to transcript, checks for conflicts, emits to gateway.
   */
  handleEvent(event: AgentEvent): void {
    // Invariant #4: Every action logged
    appendTranscript(event)

    // Check for file conflicts on fileChanged events
    if (event.type === 'fileChanged') {
      const filePath = event.data.filePath as string | undefined
      if (filePath) {
        const conflicts = recordFile(event.sessionId, filePath)
        if (conflicts.length > 0) {
          // Emit conflict event
          const conflictEvent: AgentEvent = {
            id: randomUUID(),
            sessionId: event.sessionId,
            type: 'conflict',
            timestamp: Date.now(),
            data: { filePath, conflictingSessions: conflicts },
          }
          appendTranscript(conflictEvent)
          this.emit('agentEvent', conflictEvent)
        }
      }
    }

    // Handle waiting for input → create decision
    if (event.type === 'waitingForInput') {
      const decision = createDecision({
        sessionId: event.sessionId,
        severity: 'soft',
        prompt: (event.data.prompt as string) ?? 'Permission needed',
        toolName: event.data.toolName as string | undefined,
        filePath: event.data.filePath as string | undefined,
      })
      this.emit('decision', decision)
    }

    // Handle session done → flush memory
    if (event.type === 'done') {
      void this.queue.enqueue(event.sessionId, async () => {
        // Invariant #3: Flush before discard
        await flush(event.sessionId)
        clearSessionDecisions(event.sessionId)
      })
    }

    // Emit the event to the gateway
    this.emit('agentEvent', event)
  }

  /**
   * Handle a user message sent to an agent session (e.g. from chat input).
   * Returns a message event.
   */
  handleUserMessage(sessionId: string, text: string): void {
    const event: AgentEvent = {
      id: randomUUID(),
      sessionId,
      type: 'message',
      timestamp: Date.now(),
      data: { from: 'user', text },
    }
    appendTranscript(event)
    this.emit('agentEvent', event)
  }

  /**
   * Resolve a HITL decision.
   */
  resolveDecision(decisionId: string, resolution: string): Decision | null {
    const decision = resolveHitlDecision(decisionId, resolution)
    if (decision) {
      this.emit('decisionResolved', decision)
    }
    return decision
  }

  /**
   * Clean up a session (e.g. on close).
   */
  async closeSession(sessionId: string): Promise<void> {
    await flush(sessionId)
    clearSessionDecisions(sessionId)
    clearConflictSession(sessionId)
    this.queue.clear(sessionId)
  }
}
