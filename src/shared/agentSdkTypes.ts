/**
 * Shared types for the Agent SDK integration, used by both main and renderer processes.
 */

export type AgentSdkMessageType = 'text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error'

export interface AgentSdkMessage {
  id: string
  type: AgentSdkMessageType
  timestamp: number
  // For text messages
  text?: string
  // For tool_use
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  // For tool_result
  toolResult?: string
  isError?: boolean
  // For result
  result?: string
  costUsd?: number
  durationMs?: number
  numTurns?: number
  // For subagents
  parentToolUseId?: string | null
}

export interface AgentSdkPermissionRequest {
  id: string
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId: string
  decisionReason?: string
}

export type AgentSdkSessionState = 'idle' | 'running' | 'awaiting_permission' | 'error'
