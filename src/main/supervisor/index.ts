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
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AgentEvent, InboundMessage, Decision, Persona, SessionMeta, SupervisorMode } from '../../shared/types'
import { SessionQueue } from './sessionQueue'
import { processHook, processPty as processPtyClaude } from './parsers/claudeCode'
import { processPty as processPtyGemini } from './parsers/gemini'
import { processPty as processPtyCodex } from './parsers/codex'
import { appendTranscript, flush, readTranscript, readMemory } from './sessionMemory'
import {
  createDecision,
  resolveDecision as resolveHitlDecision,
  clearSessionDecisions,
  loadAutoRules,
  setOnPush,
  setOnAutoRuleSuggestion,
  assessRisk,
} from './hitl'
import { record as recordFile, clearSession as clearConflictSession, getSessionFiles } from './conflictDetector'
import { generateBriefing } from './briefingEngine'
import { generateReport } from './reportGenerator'
import { agentActivated, agentDeactivated, killCaffeinate } from './sleepGuard'
import { sendPush } from '../notifications/push'
import { TaskTracker } from './taskTracker'
import { SupervisorChat } from './supervisorChat'

const PERSONAS_DIR = join(homedir(), '.octoagent', 'personas')

/** Callback type for writing to an agent's PTY terminal. */
export type PtyBridgeFn = (sessionId: string, text: string) => boolean

/** Permission grant with expiry timestamp. */
interface PeerPermission {
  grantedAt: number
  expiresAt: number
}

/** How long a peer-to-peer permission grant lasts (60 minutes). */
const PEER_PERMISSION_TTL_MS = 60 * 60 * 1000

export class Supervisor extends EventEmitter {
  private queue = new SessionQueue()
  /** Active sessions tracked by the supervisor. */
  private sessions = new Map<string, SessionMeta>()
  /** Personas loaded from ~/.octoagent/personas/. */
  private personas = new Map<string, Persona>()
  /** Current supervisor mode. */
  private mode: SupervisorMode = 'focused'
  /** PTY bridge: write text to an agent's terminal by sessionId. */
  private writeToPty: PtyBridgeFn | null = null
  /** Approved peer communication pairs with 60-min TTL. Key: "from→to" */
  private peerPermissions = new Map<string, PeerPermission>()
  /** Task lifecycle tracker. */
  private taskTracker = new TaskTracker()
  /** Supervisor chat (brain + conversation). */
  private chat: SupervisorChat

  constructor() {
    super()
    this.setMaxListeners(50)

    // Load auto-rules from disk
    loadAutoRules()

    // Wire HITL push callback → push notification module
    setOnPush((decision: Decision) => {
      void sendPush(decision)
    })

    // Wire HITL auto-rule suggestion → WS event
    setOnAutoRuleSuggestion((suggestion) => {
      this.emit('autoRuleSuggestion', suggestion)
    })

    // Load personas from disk
    this.loadPersonasFromDisk()

    // Initialize supervisor chat (brain + task tracker)
    this.chat = new SupervisorChat({
      taskTracker: this.taskTracker,
      sendDirective: (sessionId, instruction) => this.sendDirective(sessionId, instruction),
      briefSession: (opts) => this.briefSession(opts),
      getActiveSessions: () => this.getActiveSessions(),
      getMode: () => this.getMode(),
      emit: (event, data) => this.emit(event, data),
    })
  }

  /** Load all persona JSON files from ~/.octoagent/personas/. */
  private loadPersonasFromDisk(): void {
    try {
      if (!existsSync(PERSONAS_DIR)) return
      const files = readdirSync(PERSONAS_DIR).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        try {
          const data = JSON.parse(readFileSync(join(PERSONAS_DIR, file), 'utf-8')) as Persona
          if (data.id) {
            this.personas.set(data.id, data)
          }
        } catch (err) {
          console.error(`[Supervisor] Failed to load persona ${file}:`, err)
        }
      }
      if (this.personas.size > 0) {
        console.log(`[Supervisor] Loaded ${this.personas.size} persona(s) from disk`)
      }
    } catch {
      // Personas dir doesn't exist yet — fine
    }
  }

  /** Set the PTY bridge callback (called by main process after supervisor creation). */
  setPtyBridge(bridge: PtyBridgeFn): void {
    this.writeToPty = bridge
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

  /** Set the supervisor mode (focused/away/autonomous). */
  setMode(mode: SupervisorMode): void {
    this.mode = mode
    console.log(`[Supervisor] Mode set to: ${mode}`)
    this.emit('modeChanged', mode)
  }

  /** Get the current supervisor mode. */
  getMode(): SupervisorMode {
    return this.mode
  }

  /**
   * Handle an inbound message from any adapter (PTY, hook, phone).
   * Parses it into AgentEvents and processes each.
   * Routes to the correct parser based on session's agentType.
   */
  handleInbound(message: InboundMessage): void {
    let events: AgentEvent[] = []

    // Hook data always goes through Claude Code parser (hooks are Claude-specific)
    if (message.source === 'hook' && typeof message.raw === 'object') {
      events = processHook(message.sessionId, message.raw as Record<string, unknown>)
    } else if (message.source === 'pty') {
      // Route PTY parsing by agent type
      const meta = this.sessions.get(message.sessionId)
      const agentType = meta?.agentType ?? 'claude-code'

      switch (agentType) {
        case 'gemini':
          events = processPtyGemini(message)
          break
        case 'codex':
          events = processPtyCodex(message)
          break
        case 'claude-code':
        default:
          events = processPtyClaude(message)
          break
      }
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

    // Update session status + sleep guard
    const meta = this.sessions.get(event.sessionId)
    if (meta) {
      const prevStatus = meta.status
      if (event.type === 'working') meta.status = 'active'
      else if (event.type === 'done') meta.status = 'done'
      else if (event.type === 'error') meta.status = 'error'
      else if (event.type === 'idle') meta.status = 'idle'

      // Sleep guard transitions
      if (prevStatus !== 'active' && meta.status === 'active') {
        agentActivated()
      } else if (prevStatus === 'active' && (meta.status === 'done' || meta.status === 'idle' || meta.status === 'error')) {
        agentDeactivated()
      }
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

    // Handle waiting for input -> Layer 0 risk assessment + 4-layer HITL
    if (event.type === 'waitingForInput') {
      const persona = meta?.personaId ? this.personas.get(meta.personaId) : undefined
      const prompt = (event.data.prompt as string) ?? 'Permission needed'
      const toolName = event.data.toolName as string | undefined

      // Layer 0: Risk assessment
      const risk = assessRisk({ toolName, prompt })

      // Safe operations auto-approve regardless of mode
      if (risk === 'safe') {
        this.emit('decisionResolved', {
          id: randomUUID(),
          sessionId: event.sessionId,
          severity: 'soft',
          prompt,
          timestamp: Date.now(),
          resolved: true,
          resolution: 'yes',
          resolvedAt: Date.now(),
          toolName,
        } satisfies Decision)
      } else if (this.mode === 'autonomous' && risk !== 'critical') {
        // In autonomous mode, auto-approve moderate ops (but NOT critical)
        this.emit('decisionResolved', {
          id: randomUUID(),
          sessionId: event.sessionId,
          severity: 'soft',
          prompt,
          timestamp: Date.now(),
          resolved: true,
          resolution: 'yes',
          resolvedAt: Date.now(),
          toolName,
        } satisfies Decision)
      } else if (risk === 'critical') {
        // Critical ops always require human approval — force hard severity
        const severity: Decision['severity'] = 'hard'
        const result = createDecision({
          sessionId: event.sessionId,
          severity,
          prompt,
          toolName,
          filePath: event.data.filePath as string | undefined,
          persona,
        })
        if (result.decision) {
          this.emit('decision', result.decision)
        } else if (result.autoResolution) {
          this.emit('decisionResolved', {
            id: randomUUID(),
            sessionId: event.sessionId,
            severity: 'hard',
            prompt,
            timestamp: Date.now(),
            resolved: true,
            resolution: result.autoResolution,
            resolvedAt: Date.now(),
            toolName,
          } satisfies Decision)
        }
      } else {
        const severity: Decision['severity'] = event.data.isConflict ? 'hard' : 'soft'
        const result = createDecision({
          sessionId: event.sessionId,
          severity,
          prompt: (event.data.prompt as string) ?? 'Permission needed',
          toolName: event.data.toolName as string | undefined,
          filePath: event.data.filePath as string | undefined,
          persona,
        })

        if (result.decision) {
          // Human decision needed
          this.emit('decision', result.decision)
        } else if (result.autoResolution) {
          // Auto-resolved (persona or rule) — emit resolved decision
          this.emit('decisionResolved', {
            id: randomUUID(),
            sessionId: event.sessionId,
            severity: 'soft',
            prompt: (event.data.prompt as string) ?? 'Permission needed',
            timestamp: Date.now(),
            resolved: true,
            resolution: result.autoResolution,
            resolvedAt: Date.now(),
            toolName: event.data.toolName as string | undefined,
          } satisfies Decision)
        }
      }
    }

    // Handle session done -> flush memory, let brain analyze, check for all-done
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

        // Let the brain analyze completion and decide next steps
        const completedMeta = this.sessions.get(event.sessionId)
        if (completedMeta) {
          try {
            await this.chat.checkTaskProgress(event.sessionId, completedMeta)
          } catch (err) {
            console.error('[Supervisor] Brain task progress check failed:', err)
          }
        }

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
    // Deliver to agent's PTY terminal
    this.writeToPty?.(sessionId, `${text}\n`)
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

  /**
   * Handle a peer-to-peer message with supervisor permission gate.
   * First message between a peer pair requires approval (HITL decision).
   * After approval, the pair can communicate freely for 60 minutes.
   */
  handlePeerMessage(message: { id: string; from: string; fromName?: string; to: string; text: string; timestamp: number }): void {
    const { from, to } = message
    const permKey = `${from}→${to}`

    // Check if this peer pair has an active (non-expired) permission
    const perm = this.peerPermissions.get(permKey)
    if (perm && Date.now() < perm.expiresAt) {
      // Already approved and not expired — deliver immediately
      this.deliverPeerMessage(message)
      // Track for brain monitoring
      void this.chat.trackPeerMessage(from, to, message.text)
      return
    }

    // Permission expired or never granted — clean up and request approval
    if (perm) this.peerPermissions.delete(permKey)

    // Task affinity: auto-grant if both agents share a task
    if (this.taskTracker.shareTask(from, to)) {
      this.grantPeerPermission(from, to)
      this.deliverPeerMessage(message)
      void this.chat.trackPeerMessage(from, to, message.text)
      return
    }

    // In autonomous mode, auto-approve
    if (this.mode === 'autonomous') {
      this.grantPeerPermission(from, to)
      this.deliverPeerMessage(message)
      void this.chat.trackPeerMessage(from, to, message.text)
      return
    }

    // Create HITL decision for approval
    const decisionId = `peer-${message.id}`
    const fromLabel = message.fromName || from
    const decision: Decision = {
      id: decisionId,
      sessionId: to,
      severity: 'soft',
      prompt: `Agent "${fromLabel}" wants to communicate with agent "${to}": "${message.text.substring(0, 120)}"`,
      timestamp: Date.now(),
      resolved: false,
    }

    this.emit('decision', decision)

    // Listen for resolution (one-time)
    const handler = (resolvedDecision: Decision) => {
      if (resolvedDecision.id !== decisionId) return
      this.removeListener('decisionResolved', handler)

      if (resolvedDecision.resolution === 'yes' || resolvedDecision.resolution === 'approve') {
        // Grant 60-min permission for this pair
        this.grantPeerPermission(from, to)
        this.deliverPeerMessage(message)
      } else {
        // Denied — notify sender agent
        const denyEvent: AgentEvent = {
          id: randomUUID(),
          sessionId: from,
          type: 'message',
          timestamp: Date.now(),
          data: { from: 'supervisor', text: `Permission denied to message ${to}. The supervisor did not approve this communication.` },
        }
        appendTranscript(denyEvent)
        this.emit('agentEvent', denyEvent)
      }
    }
    this.on('decisionResolved', handler)
  }

  /** Grant a 60-minute peer communication permission. */
  private grantPeerPermission(from: string, to: string): void {
    const now = Date.now()
    this.peerPermissions.set(`${from}→${to}`, {
      grantedAt: now,
      expiresAt: now + PEER_PERMISSION_TTL_MS,
    })
    console.log(`[Supervisor] Peer permission granted: ${from} → ${to} (expires in 60 min)`)
  }

  /** Deliver a peer message: log, emit to UI, queue for polling, write to PTY. */
  private deliverPeerMessage(message: { id: string; from: string; fromName?: string; to: string; text: string; timestamp: number }): void {
    const event: AgentEvent = {
      id: message.id,
      sessionId: message.to,
      type: 'message',
      timestamp: message.timestamp,
      data: { from: message.from, fromName: message.fromName, text: message.text, peerMessage: true },
    }
    appendTranscript(event)

    // Emit peer message event for UI
    this.emit('peerMessage', {
      sessionId: message.to,
      from: message.from,
      fromName: message.fromName,
      text: message.text,
      timestamp: message.timestamp,
    })

    // Queue for P2P polling (kept for direct check_messages MCP tool)
    this.emit('peerMessageApproved', message)

    // Write to target agent's PTY
    const fromLabel = message.fromName || message.from
    this.writeToPty?.(message.to, `[From ${fromLabel}]: ${message.text}\n`)
  }

  /**
   * Send a message from a group session to all member agents.
   * Each member receives the text in their PTY input.
   */
  sendToGroupMembers(memberSessionIds: string[], text: string, from: string): void {
    console.log(`[Supervisor] sendToGroupMembers: ${memberSessionIds.length} members, text="${text.substring(0, 60)}"`)
    for (const memberId of memberSessionIds) {
      const event: AgentEvent = {
        id: randomUUID(),
        sessionId: memberId,
        type: 'message',
        timestamp: Date.now(),
        data: { from, text, groupMessage: true },
      }
      appendTranscript(event)
      this.emit('agentEvent', event)
      const written = this.writeToPty?.(memberId, `${text}\n`)
      console.log(`[Supervisor] writeToPty(${memberId}) = ${written}`)
    }
  }

  /**
   * Send a directive from the supervisor to a specific agent.
   * Used for orchestration: "Agent A, review Agent B's PR"
   */
  sendDirective(sessionId: string, instruction: string): void {
    const event: AgentEvent = {
      id: randomUUID(),
      sessionId,
      type: 'message',
      timestamp: Date.now(),
      data: { from: 'supervisor', text: instruction },
    }
    appendTranscript(event)
    this.emit('agentEvent', event)
    this.writeToPty?.(sessionId, `${instruction}\n`)
  }

  /**
   * Brief all members of a group session about each other's work.
   */
  async briefAllMembers(memberSessionIds: string[], additionalContext?: string): Promise<void> {
    for (const targetId of memberSessionIds) {
      const sourceIds = memberSessionIds.filter((id) => id !== targetId)
      if (sourceIds.length > 0) {
        await this.briefSession({
          targetSessionId: targetId,
          sourceSessionIds: sourceIds,
          additionalContext,
        })
      }
    }
  }

  /**
   * Handle a message sent to the supervisor brain (from supervisor chat UI).
   */
  async handleSupervisorChat(text: string): Promise<void> {
    await this.chat.handleMessage(text)
  }

  /** Get the task tracker (for external access). */
  getTaskTracker(): TaskTracker {
    return this.taskTracker
  }

  /** Get the supervisor chat (for external access). */
  getSupervisorChat(): SupervisorChat {
    return this.chat
  }

  /**
   * Shutdown: kill caffeinate, cleanup.
   */
  shutdown(): void {
    killCaffeinate()
    this.chat.shutdown()
  }
}
