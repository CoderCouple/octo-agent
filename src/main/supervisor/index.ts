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
import type { AgentEvent, InboundMessage, Decision, Persona, SessionMeta } from '../../shared/types'
import { SessionQueue } from './sessionQueue'
import { processHook, processPty } from './parsers/claudeCode'
import { appendTranscript, flush, readTranscript, readMemory } from './sessionMemory'
import { createDecision, resolveDecision as resolveHitlDecision, clearSessionDecisions } from './hitl'
import { record as recordFile, clearSession as clearConflictSession, getSessionFiles } from './conflictDetector'
import { generateBriefing } from './briefingEngine'
import { generateReport } from './reportGenerator'

export class Supervisor extends EventEmitter {
  private queue = new SessionQueue()
  /** Active sessions tracked by the supervisor. */
  private sessions = new Map<string, SessionMeta>()
  /** Personas loaded from ~/.octoagent/personas/. */
  private personas = new Map<string, Persona>()

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /** Register a session with the supervisor. */
  registerSession(meta: SessionMeta): void {
    this.sessions.set(meta.id, meta)
  }

  /** Unregister a session. */
  unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  /** Get all active sessions. */
  getActiveSessions(): SessionMeta[] {
    return [...this.sessions.values()]
  }

  /** Load a persona (from disk or config). */
  loadPersona(persona: Persona): void {
    this.personas.set(persona.id, persona)
  }

  /** Get a persona by ID. */
  getPersona(personaId: string): Persona | undefined {
    return this.personas.get(personaId)
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

    // Update session status
    const meta = this.sessions.get(event.sessionId)
    if (meta) {
      if (event.type === 'working') meta.status = 'active'
      else if (event.type === 'done') meta.status = 'done'
      else if (event.type === 'error') meta.status = 'error'
      else if (event.type === 'idle') meta.status = 'idle'
    }

    // Check for file conflicts on fileChanged events
    if (event.type === 'fileChanged') {
      const filePath = event.data.filePath as string | undefined
      if (filePath) {
        const conflicts = recordFile(event.sessionId, filePath)
        if (conflicts.length > 0) {
          // Emit conflict event with hard stop
          const conflictEvent: AgentEvent = {
            id: randomUUID(),
            sessionId: event.sessionId,
            type: 'conflict',
            timestamp: Date.now(),
            data: { filePath, conflictingSessions: conflicts },
          }
          appendTranscript(conflictEvent)
          this.emit('agentEvent', conflictEvent)

          // Also notify the conflicting session
          for (const conflictSessionId of conflicts) {
            const notifyEvent: AgentEvent = {
              id: randomUUID(),
              sessionId: conflictSessionId,
              type: 'conflict',
              timestamp: Date.now(),
              data: { filePath, conflictingSessions: [event.sessionId] },
            }
            appendTranscript(notifyEvent)
            this.emit('agentEvent', notifyEvent)
          }
        }
      }
    }

    // Handle waiting for input -> create decision
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

    // Handle session done -> flush memory, check for all-done
    if (event.type === 'done') {
      void this.queue.enqueue(event.sessionId, async () => {
        // Invariant #3: Flush before discard
        await flush(event.sessionId)
        clearSessionDecisions(event.sessionId)

        // Emit memoryUpdate so renderer shows the summary
        this.emit('memoryUpdate', {
          sessionId: event.sessionId,
          summary: readMemory(event.sessionId) ?? 'Memory saved',
        })

        // Check if ALL sessions are done -> generate report
        const activeSessions = this.getActiveSessions()
        const allDone = activeSessions.length > 0 &&
          activeSessions.every((s) => s.status === 'done' || s.status === 'idle')

        if (allDone && activeSessions.length > 0) {
          const sessionIds = activeSessions.map((s) => s.id)
          try {
            const report = await generateReport({ sessionIds })
            this.emit('report', {
              sessionIds,
              content: report,
            })
          } catch (err) {
            console.error('[Supervisor] Report generation failed:', err)
          }
        }
      })
    }

    // Emit the event to the gateway
    this.emit('agentEvent', event)
  }

  /**
   * Handle a user message sent to an agent session (e.g. from chat input).
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
   * Generate a briefing for a target session from source sessions.
   */
  async briefSession(opts: {
    targetSessionId: string
    sourceSessionIds: string[]
    additionalContext?: string
  }): Promise<string> {
    const meta = this.sessions.get(opts.targetSessionId)
    const persona = meta?.personaId ? this.personas.get(meta.personaId) : undefined

    const briefing = await generateBriefing({
      targetSessionId: opts.targetSessionId,
      sourceSessionIds: opts.sourceSessionIds,
      persona,
      additionalContext: opts.additionalContext,
    })

    // Emit as an agent event so it appears in chat
    const event: AgentEvent = {
      id: randomUUID(),
      sessionId: opts.targetSessionId,
      type: 'message',
      timestamp: Date.now(),
      data: { from: 'briefing', text: briefing },
    }
    appendTranscript(event)
    this.emit('agentEvent', event)

    return briefing
  }

  /**
   * Recover session state from disk on restart (invariant #5).
   */
  recoverSession(sessionId: string): { events: AgentEvent[]; memory: string | null; files: string[] } {
    const events = readTranscript(sessionId)
    const memory = readMemory(sessionId)
    const files = getSessionFiles(sessionId)
    return { events, memory, files }
  }

  /**
   * Clean up a session (e.g. on close).
   */
  async closeSession(sessionId: string): Promise<void> {
    await flush(sessionId)
    clearSessionDecisions(sessionId)
    clearConflictSession(sessionId)
    this.sessions.delete(sessionId)
    this.queue.clear(sessionId)
  }
}
