/**
 * Session memory: append-only transcript + curated memory summary.
 * Invariant #3: Flush before discard — memory.md always written before session context cleared.
 * Invariant #4: Every action logged — every AgentEvent appended to transcript.jsonl.
 */
import { mkdirSync, appendFileSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import Anthropic from '@anthropic-ai/sdk'
import type { AgentEvent } from '../../shared/types'

const BASE_DIR = join(homedir(), '.octoagent', 'sessions')
const client = new Anthropic()

function sessionDir(sessionId: string): string {
  const dir = join(BASE_DIR, sessionId)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Append an event to the session transcript (invariant #4). */
export function appendTranscript(event: AgentEvent): void {
  const dir = sessionDir(event.sessionId)
  const line = JSON.stringify({ ...event, _logged: Date.now() }) + '\n'
  appendFileSync(join(dir, 'transcript.jsonl'), line, 'utf-8')
}

/** Read all events from a session transcript for recovery (invariant #5). */
export function readTranscript(sessionId: string): AgentEvent[] {
  const filePath = join(sessionDir(sessionId), 'transcript.jsonl')
  if (!existsSync(filePath)) return []
  const content = readFileSync(filePath, 'utf-8')
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) as AgentEvent }
      catch { return null }
    })
    .filter((e): e is AgentEvent => e !== null)
}

/** Get the last N events from a session transcript. */
export function getRecentEvents(sessionId: string, count: number): AgentEvent[] {
  const all = readTranscript(sessionId)
  return all.slice(-count)
}

/** Read the curated memory summary. */
export function readMemory(sessionId: string): string | null {
  const filePath = join(sessionDir(sessionId), 'memory.md')
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, 'utf-8')
}

/**
 * Flush session memory — write memory.md curated summary via Claude API.
 * Falls back to a structured event-count summary if the API call fails.
 * Invariant #3: Always call flush() before clearing session context.
 */
export async function flush(sessionId: string): Promise<void> {
  const events = readTranscript(sessionId)
  if (events.length === 0) return

  const dir = sessionDir(sessionId)

  // Build event digest for Claude (last 200 events, trimmed)
  const recentEvents = events.slice(-200)
  const eventDigest = recentEvents
    .map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.type}: ${JSON.stringify(e.data).slice(0, 200)}`)
    .join('\n')

  const eventCounts = Object.entries(
    events.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1
      return acc
    }, {})
  ).map(([type, count]) => `- ${type}: ${count}`)

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: [
        'You are a memory curator for an AI coding agent session.',
        'Summarize the session transcript into a concise memory document.',
        'Focus on: what task was being done, which files were changed, key decisions made,',
        'any errors or blockers encountered, and the final state (done/in-progress/error).',
        'Use markdown. Keep under 400 words.',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: [
          `# Session ${sessionId}`,
          `Total events: ${events.length}`,
          `Time range: ${new Date(events[0].timestamp).toISOString()} to ${new Date(events[events.length - 1].timestamp).toISOString()}`,
          '',
          '## Event Counts',
          ...eventCounts,
          '',
          '## Recent Event Log',
          eventDigest,
          '',
          'Generate a curated memory summary for this session.',
        ].join('\n'),
      }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (textBlock?.text) {
      writeFileSync(join(dir, 'memory.md'), textBlock.text, 'utf-8')
      return
    }
  } catch (err) {
    console.error('[SessionMemory] Claude API error, writing fallback summary:', err)
  }

  // Fallback: structured summary without Claude
  const fallback = [
    `# Session Memory: ${sessionId}`,
    '',
    `**Events:** ${events.length}`,
    `**First event:** ${new Date(events[0].timestamp).toISOString()}`,
    `**Last event:** ${new Date(events[events.length - 1].timestamp).toISOString()}`,
    '',
    '## Event Summary',
    ...eventCounts,
    '',
  ].join('\n')

  writeFileSync(join(dir, 'memory.md'), fallback, 'utf-8')
}

/** Get the session directory path. */
export function getSessionDir(sessionId: string): string {
  return sessionDir(sessionId)
}
