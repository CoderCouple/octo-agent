/**
 * Supervisor Brain: Claude-powered reasoning engine for multi-agent orchestration.
 *
 * The brain receives user messages along with context (active sessions, memory,
 * tasks, conversation history) and returns structured responses with actions
 * the supervisor should execute: delegate, brief, create_task, monitor, etc.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SessionMeta } from '../../shared/types'
import type { TaskState } from './taskTracker'
import { readMemory } from './sessionMemory'

const client = new Anthropic()

// ─── Types ──────────────────────────────────────────────────────

export type BrainActionType =
  | 'delegate'
  | 'brief'
  | 'ask_user'
  | 'report'
  | 'create_task'
  | 'monitor'
  | 'auto_approve'

export interface BrainAction {
  type: BrainActionType
  /** Target session ID (for delegate, brief, monitor) */
  sessionId?: string
  /** Instruction text (for delegate), question (for ask_user), task description (for create_task) */
  text?: string
  /** Source session IDs (for brief) */
  sourceSessionIds?: string[]
  /** Parent task ID (for create_task subtasks) */
  parentTaskId?: string
  /** Dependencies — task IDs that must complete first */
  dependencies?: string[]
}

export interface BrainResponse {
  /** Internal reasoning (shown collapsed in UI) */
  thinking: string
  /** User-facing reply */
  reply: string
  /** Actions to execute */
  actions: BrainAction[]
}

export interface BrainContext {
  activeSessions: SessionMeta[]
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  activeTasks: TaskState[]
  supervisorMode: string
}

// ─── System Prompt ──────────────────────────────────────────────

function buildSystemPrompt(ctx: BrainContext): string {
  const sessionDescriptions = ctx.activeSessions.map((s) => {
    const memory = readMemory(s.id)
    const memorySnippet = memory ? memory.slice(0, 300) : 'No memory yet'
    return `- **${s.name}** (id: ${s.id}, agent: ${s.agentType}, dir: ${s.directory}, status: ${s.status})\n  Memory: ${memorySnippet}`
  }).join('\n')

  const taskDescriptions = ctx.activeTasks.length > 0
    ? ctx.activeTasks.map((t) => {
        const assigned = t.assignedTo.length > 0 ? `assigned to: ${t.assignedTo.join(', ')}` : 'unassigned'
        return `- [${t.status}] ${t.description} (id: ${t.id}, ${assigned})`
      }).join('\n')
    : 'No active tasks.'

  return `You are the Supervisor Brain for OctoAgent, a multi-agent orchestration system.
You coordinate multiple AI coding agents working on different repositories or tasks simultaneously.

## Your Role
- Break down user requests into tasks and delegate to the right agents
- Monitor agent progress and coordinate handoffs
- Brief agents about each other's work when relevant
- Auto-approve safe operations, escalate critical ones
- Report status and progress to the user

## Available Agents
${sessionDescriptions || 'No active sessions.'}

## Active Tasks
${taskDescriptions}

## Supervisor Mode: ${ctx.supervisorMode}

## Response Format
You MUST respond with valid JSON matching this schema:
{
  "thinking": "Your internal reasoning about what to do (shown to user as collapsed section)",
  "reply": "Your response to the user in markdown",
  "actions": [
    {
      "type": "delegate" | "brief" | "ask_user" | "report" | "create_task" | "monitor" | "auto_approve",
      "sessionId": "target session ID (for delegate, brief, monitor)",
      "text": "instruction or question or task description",
      "sourceSessionIds": ["for brief actions"],
      "parentTaskId": "for subtask creation",
      "dependencies": ["task IDs that must complete first"]
    }
  ]
}

## Action Types
- **delegate**: Send an instruction to an agent. Requires sessionId + text.
- **brief**: Brief an agent about other sessions' work. Requires sessionId + sourceSessionIds.
- **ask_user**: Ask the user a clarifying question. Requires text.
- **report**: Generate a report on current progress. No extra fields needed.
- **create_task**: Create a new task. Requires text (description). Optional: parentTaskId, dependencies.
- **monitor**: Start monitoring a session. Requires sessionId.
- **auto_approve**: Mark safe ops for auto-approval. No extra fields needed.

## Guidelines
- When the user describes a task, break it into subtasks and delegate to appropriate agents based on their directory/repo
- If no agent is available for a task, suggest the user create one
- Keep replies concise and action-oriented
- If you need more info, use ask_user action
- Always include thinking to show your reasoning
- When an agent completes, analyze results and decide next steps`
}

// ─── Core API ───────────────────────────────────────────────────

/**
 * Call Claude to reason about a user message and decide on actions.
 */
export async function think(userMessage: string, context: BrainContext): Promise<BrainResponse> {
  const systemPrompt = buildSystemPrompt(context)

  // Build messages from conversation history + new message
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...context.conversationHistory.slice(-20), // Keep last 20 turns
    { role: 'user', content: userMessage },
  ]

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = textBlock?.text ?? '{}'

    // Parse JSON response — try to extract from markdown code blocks if needed
    let parsed: BrainResponse
    try {
      const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : raw
      parsed = JSON.parse(jsonStr) as BrainResponse
    } catch {
      // Fallback: treat entire response as a plain reply
      parsed = {
        thinking: 'Failed to parse structured response',
        reply: raw,
        actions: [],
      }
    }

    // Validate and sanitize
    return {
      thinking: parsed.thinking ?? '',
      reply: parsed.reply ?? 'I encountered an issue processing your request.',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    }
  } catch (err) {
    console.error('[SupervisorBrain] Claude API error:', err)
    return {
      thinking: `API error: ${err instanceof Error ? err.message : String(err)}`,
      reply: `I'm having trouble connecting to my reasoning engine. Error: ${err instanceof Error ? err.message : String(err)}`,
      actions: [],
    }
  }
}

/**
 * Analyze an agent's completion and decide what to do next.
 */
export async function analyzeCompletion(
  sessionId: string,
  sessionMeta: SessionMeta,
  context: BrainContext,
): Promise<BrainResponse> {
  const memory = readMemory(sessionId)
  const completionMessage = [
    `Agent "${sessionMeta.name}" (${sessionId}) has completed its work.`,
    memory ? `\n## Agent Memory Summary\n${memory}` : '',
    '\nAnalyze the results and decide: mark task done? assign follow-up? brief other agents? report to user?',
  ].join('')

  return think(completionMessage, {
    ...context,
    conversationHistory: [
      ...context.conversationHistory,
      { role: 'user', content: `[SYSTEM] Agent ${sessionMeta.name} completed.` },
    ],
  })
}

/**
 * Review a peer conversation between two agents for off-track behavior.
 */
export async function reviewPeerConversation(
  recentMessages: string[],
  context: BrainContext,
): Promise<BrainResponse> {
  const reviewMessage = [
    '[SYSTEM] Review the following recent peer-to-peer conversation between agents.',
    'Determine if they are staying on track or need intervention.',
    '',
    ...recentMessages.map((m) => `> ${m}`),
    '',
    'If on track, reply briefly. If off track, suggest intervention actions.',
  ].join('\n')

  return think(reviewMessage, context)
}
