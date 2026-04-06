/**
 * Supervisor Chat: conversation state + action executor.
 *
 * Manages the user↔supervisor conversation, builds context for the brain,
 * executes brain actions, and persists conversation history to disk.
 * Invariant #5: Conversation persisted to ~/.octoagent/supervisor/conversation.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { think, analyzeCompletion, reviewPeerConversation } from './supervisorBrain'
import type { BrainAction, BrainResponse, BrainContext } from './supervisorBrain'
import type { TaskTracker } from './taskTracker'
import type { SessionMeta, SupervisorMode } from '../../shared/types'

// ─── Types ──────────────────────────────────────────────────────

export interface SupervisorChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  actions?: BrainAction[]
  thinking?: string
}

type SendDirectiveFn = (sessionId: string, instruction: string) => void
type BriefSessionFn = (opts: { targetSessionId: string; sourceSessionIds: string[]; additionalContext?: string }) => Promise<string>
type GetActiveSessionsFn = () => SessionMeta[]
type GetModeFn = () => SupervisorMode
type EmitFn = (event: string, data: unknown) => void

// ─── Persistence ────────────────────────────────────────────────

const SUPERVISOR_DIR = join(homedir(), '.octoagent', 'supervisor')
const CONVERSATION_FILE = join(SUPERVISOR_DIR, 'conversation.json')

function ensureDir(): void {
  if (!existsSync(SUPERVISOR_DIR)) {
    mkdirSync(SUPERVISOR_DIR, { recursive: true })
  }
}

// ─── Peer Monitoring ────────────────────────────────────────────

/** Track message count between peer pairs for periodic review. */
const peerMessageCounts = new Map<string, number>()
const PEER_REVIEW_INTERVAL = 10

// ─── Monitor Timers ─────────────────────────────────────────────

const monitorTimers = new Map<string, ReturnType<typeof setInterval>>()
const MONITOR_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ─── SupervisorChat ─────────────────────────────────────────────

export class SupervisorChat {
  private conversation: SupervisorChatMessage[] = []
  private taskTracker: TaskTracker
  private sendDirective: SendDirectiveFn
  private briefSession: BriefSessionFn
  private getActiveSessions: GetActiveSessionsFn
  private getMode: GetModeFn
  private emit: EmitFn

  constructor(opts: {
    taskTracker: TaskTracker
    sendDirective: SendDirectiveFn
    briefSession: BriefSessionFn
    getActiveSessions: GetActiveSessionsFn
    getMode: GetModeFn
    emit: EmitFn
  }) {
    this.taskTracker = opts.taskTracker
    this.sendDirective = opts.sendDirective
    this.briefSession = opts.briefSession
    this.getActiveSessions = opts.getActiveSessions
    this.getMode = opts.getMode
    this.emit = opts.emit

    this.loadConversation()
  }

  /** Load conversation from disk (Invariant #5). */
  private loadConversation(): void {
    try {
      if (existsSync(CONVERSATION_FILE)) {
        this.conversation = JSON.parse(readFileSync(CONVERSATION_FILE, 'utf-8')) as SupervisorChatMessage[]
        console.log(`[SupervisorChat] Loaded ${this.conversation.length} messages from disk`)
      }
    } catch (err) {
      console.error('[SupervisorChat] Failed to load conversation:', err)
      this.conversation = []
    }
  }

  /** Persist conversation to disk. */
  private saveConversation(): void {
    try {
      ensureDir()
      // Keep last 100 messages to prevent unbounded growth
      const toSave = this.conversation.slice(-100)
      writeFileSync(CONVERSATION_FILE, JSON.stringify(toSave, null, 2), 'utf-8')
    } catch (err) {
      console.error('[SupervisorChat] Failed to save conversation:', err)
    }
  }

  /** Build context for the brain. */
  private buildContext(): BrainContext {
    return {
      activeSessions: this.getActiveSessions(),
      conversationHistory: this.conversation
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      activeTasks: this.taskTracker.getActiveTasks(),
      supervisorMode: this.getMode(),
    }
  }

  /**
   * Handle a user message: build context → call brain → execute actions → emit events.
   */
  async handleMessage(text: string): Promise<BrainResponse> {
    console.log(`[SupervisorChat] handleMessage: "${text.substring(0, 80)}"`)

    // Record user message
    const userMsg: SupervisorChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    this.conversation.push(userMsg)

    // Don't emit user message back — the UI already added it locally.
    // Only emit assistant/system/action messages.

    // Call brain
    const context = this.buildContext()
    console.log(`[SupervisorChat] Calling brain with ${context.activeSessions.length} sessions, ${context.activeTasks.length} tasks`)
    const response = await think(text, context)
    console.log(`[SupervisorChat] Brain replied: "${response.reply.substring(0, 80)}", actions: ${response.actions.length}`)

    // Record assistant response
    const assistantMsg: SupervisorChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response.reply,
      timestamp: Date.now(),
      actions: response.actions,
      thinking: response.thinking,
    }
    this.conversation.push(assistantMsg)
    this.saveConversation()

    // Execute actions
    await this.executeActions(response.actions)

    // Emit brain response
    this.emit('supervisorChat', {
      type: 'assistant',
      content: response.reply,
      thinking: response.thinking,
      actions: response.actions,
      timestamp: assistantMsg.timestamp,
    })

    return response
  }

  /**
   * Execute an array of brain actions.
   */
  async executeActions(actions: BrainAction[]): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'delegate':
            if (action.sessionId && action.text) {
              this.sendDirective(action.sessionId, action.text)
              this.emit('supervisorChat', {
                type: 'action',
                content: `Delegated to session ${action.sessionId}: "${action.text.substring(0, 80)}"`,
                timestamp: Date.now(),
              })
            }
            break

          case 'brief':
            if (action.sessionId && action.sourceSessionIds?.length) {
              await this.briefSession({
                targetSessionId: action.sessionId,
                sourceSessionIds: action.sourceSessionIds,
                additionalContext: action.text,
              })
              this.emit('supervisorChat', {
                type: 'action',
                content: `Briefed session ${action.sessionId} about ${action.sourceSessionIds.length} source session(s)`,
                timestamp: Date.now(),
              })
            }
            break

          case 'create_task': {
            if (action.text) {
              const task = this.taskTracker.createTask({
                description: action.text,
                parentTaskId: action.parentTaskId,
                dependencies: action.dependencies,
              })

              // If a session is specified, assign the task
              if (action.sessionId) {
                this.taskTracker.assignTask(task.id, [action.sessionId])
                // Also delegate the work
                this.sendDirective(action.sessionId, action.text)
              }

              this.emit('taskUpdate', {
                tasks: this.taskTracker.getTaskTree(),
                updated: task,
              })
            }
            break
          }

          case 'monitor':
            if (action.sessionId) {
              this.startMonitoring(action.sessionId)
            }
            break

          case 'report':
            // Emit request for report generation (handled by supervisor)
            this.emit('supervisorChat', {
              type: 'action',
              content: 'Generating progress report...',
              timestamp: Date.now(),
            })
            break

          case 'ask_user':
            // The question is already in the reply, no extra action needed
            break

          case 'auto_approve':
            // No-op here — auto-approval is handled in HITL layer
            break
        }
      } catch (err) {
        console.error(`[SupervisorChat] Failed to execute action ${action.type}:`, err)
      }
    }
  }

  /**
   * Called when an agent finishes. Asks brain what to do next.
   */
  async checkTaskProgress(sessionId: string, sessionMeta: SessionMeta): Promise<void> {
    const context = this.buildContext()
    const response = await analyzeCompletion(sessionId, sessionMeta, context)

    // Record system message about completion
    const systemMsg: SupervisorChatMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: `Agent "${sessionMeta.name}" completed. Brain analysis: ${response.reply}`,
      timestamp: Date.now(),
      actions: response.actions,
      thinking: response.thinking,
    }
    this.conversation.push(systemMsg)
    this.saveConversation()

    // Emit the analysis
    this.emit('supervisorChat', {
      type: 'system',
      content: response.reply,
      thinking: response.thinking,
      actions: response.actions,
      timestamp: systemMsg.timestamp,
    })

    // Update task status for this session
    const sessionTasks = this.taskTracker.getSessionTasks(sessionId)
    for (const task of sessionTasks) {
      if (task.status === 'in_progress' || task.status === 'assigned') {
        this.taskTracker.updateStatus(task.id, 'done')
        this.emit('taskUpdate', {
          tasks: this.taskTracker.getTaskTree(),
          updated: task,
        })
      }
    }

    // Execute follow-up actions
    await this.executeActions(response.actions)
  }

  /**
   * Start periodic monitoring of a session (5-min interval).
   */
  private startMonitoring(sessionId: string): void {
    // Clear existing timer if any
    this.stopMonitoring(sessionId)

    const timer = setInterval(() => {
      // Check if session is still active
      const sessions = this.getActiveSessions()
      const session = sessions.find((s) => s.id === sessionId)
      if (!session || session.status === 'done' || session.status === 'error') {
        this.stopMonitoring(sessionId)
        return
      }

      // Ask brain to review
      void this.handleMessage(`[SYSTEM] Periodic check on agent "${session.name}" (${sessionId}). Status: ${session.status}. Any concerns?`)
    }, MONITOR_INTERVAL_MS)

    monitorTimers.set(sessionId, timer)
    console.log(`[SupervisorChat] Started monitoring session ${sessionId}`)
  }

  /** Stop monitoring a session. */
  stopMonitoring(sessionId: string): void {
    const timer = monitorTimers.get(sessionId)
    if (timer) {
      clearInterval(timer)
      monitorTimers.delete(sessionId)
    }
  }

  /**
   * Track and review peer messages between agents.
   * Called every time a peer message is delivered.
   */
  async trackPeerMessage(from: string, to: string, text: string): Promise<void> {
    const key = [from, to].sort().join('↔')
    const count = (peerMessageCounts.get(key) ?? 0) + 1
    peerMessageCounts.set(key, count)

    // Every N messages, ask brain to review the conversation
    if (count % PEER_REVIEW_INTERVAL === 0) {
      const context = this.buildContext()
      // Collect recent messages (simplified — just the counter triggers review)
      const recentMsgs = [
        `Message ${count} between ${from} and ${to}`,
        `Latest: [${from}]: ${text.substring(0, 200)}`,
      ]
      const response = await reviewPeerConversation(recentMsgs, context)

      if (response.actions.length > 0) {
        // Brain wants to intervene
        this.emit('supervisorChat', {
          type: 'system',
          content: `Peer review (${from} ↔ ${to}): ${response.reply}`,
          thinking: response.thinking,
          actions: response.actions,
          timestamp: Date.now(),
        })
        await this.executeActions(response.actions)
      }
    }
  }

  /** Get the current conversation (for UI). */
  getConversation(): SupervisorChatMessage[] {
    return [...this.conversation]
  }

  /** Get the task tracker instance. */
  getTaskTracker(): TaskTracker {
    return this.taskTracker
  }

  /** Clean up all timers on shutdown. */
  shutdown(): void {
    for (const [sessionId] of monitorTimers) {
      this.stopMonitoring(sessionId)
    }
    peerMessageCounts.clear()
  }
}
