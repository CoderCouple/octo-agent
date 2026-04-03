/**
 * Shared type definitions used by gateway, supervisor, and renderer.
 * These types form the protocol for all communication in OctoAgent.
 */

// ─── Agent Event Types ───────────────────────────────────────────
export type AgentType = 'claude-code' | 'gemini' | 'codex' | 'unknown'

export type AgentEventType =
  | 'working'
  | 'idle'
  | 'fileChanged'
  | 'waitingForInput'
  | 'done'
  | 'error'
  | 'toolUse'
  | 'message'
  | 'conflict'

export interface AgentEvent {
  id: string
  sessionId: string
  type: AgentEventType
  timestamp: number
  data: Record<string, unknown>
}

// ─── Inbound Message (from adapters) ─────────────────────────────
export type InboundSource = 'pty' | 'hook' | 'phone' | 'slack' | 'whatsapp' | 'telegram'

export interface InboundMessage {
  sessionId: string
  source: InboundSource
  raw: string | Record<string, unknown>
  timestamp: number
}

// ─── Decision Types ──────────────────────────────────────────────
export type DecisionSeverity = 'soft' | 'hard'

export interface Decision {
  id: string
  sessionId: string
  severity: DecisionSeverity
  prompt: string
  toolName?: string
  filePath?: string
  timestamp: number
  resolved: boolean
  resolution?: string
  resolvedAt?: number
}

// ─── WS Frame Protocol ──────────────────────────────────────────
export type WSFrameType = 'req' | 'res' | 'event'

export type WSMethod = 'connect' | 'send' | 'resolve' | 'status' | 'brief' | 'setMode'

export type WSEventName =
  | 'agentEvent'
  | 'decision'
  | 'presence'
  | 'heartbeat'
  | 'memoryUpdate'
  | 'report'
  | 'autoRuleSuggestion'
  | 'peerMessage'

export interface WSFrame {
  type: WSFrameType
  id: string
  method?: WSMethod
  event?: WSEventName
  sessionId?: string
  payload?: Record<string, unknown>
  error?: string
}

// ─── Supervisor Mode ─────────────────────────────────────────────
export type SupervisorMode = 'focused' | 'away' | 'autonomous'

// ─── Persona ─────────────────────────────────────────────────────
export interface Persona {
  id: string
  name: string
  agentType: AgentType
  allowedTools?: string[]
  allowedPaths?: string[]
  systemPrompt?: string
}

// ─── Auto-Rules ─────────────────────────────────────────────────
export interface AutoRule {
  id: string
  /** Pattern to match: tool name, file glob, or prompt regex */
  pattern: string
  patternType: 'toolName' | 'filePath' | 'prompt'
  /** The resolution to apply automatically */
  resolution: string
  /** How many times this has been applied */
  hitCount: number
  createdAt: number
}

// ─── Push Notification Config ───────────────────────────────────
export interface PushConfig {
  /** Webhook URL to POST push payloads to (e.g. Cloudflare Worker → APNs) */
  webhookUrl?: string
  enabled: boolean
}

// ─── Session Metadata (supervisor) ───────────────────────────────
export interface SessionMeta {
  id: string
  name: string
  directory: string
  agentType: AgentType
  personaId?: string
  status: 'active' | 'idle' | 'done' | 'error'
}
