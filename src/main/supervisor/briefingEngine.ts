/**
 * Briefing engine: generates persona-aware briefings for agent sessions.
 * Uses Claude API to create a briefing from session memory summaries.
 */
import Anthropic from '@anthropic-ai/sdk'
import { readMemory, getRecentEvents } from './sessionMemory'
import type { Persona } from '../../shared/types'

const client = new Anthropic()

/**
 * Generate a briefing for a target session based on source session summaries.
 * Used for agent-to-agent handoff or context sharing.
 */
export async function generateBriefing(opts: {
  targetSessionId: string
  sourceSessionIds: string[]
  persona?: Persona
  additionalContext?: string
}): Promise<string> {
  const { sourceSessionIds, persona, additionalContext } = opts

  // Gather memory summaries from source sessions
  const summaries: string[] = []
  for (const srcId of sourceSessionIds) {
    const memory = readMemory(srcId)
    if (memory) {
      summaries.push(`## Session ${srcId}\n${memory}`)
    } else {
      // Fall back to recent events if no memory.md exists
      const events = getRecentEvents(srcId, 20)
      if (events.length > 0) {
        const eventSummary = events
          .map((e) => `- [${e.type}] ${JSON.stringify(e.data).slice(0, 120)}`)
          .join('\n')
        summaries.push(`## Session ${srcId} (recent events)\n${eventSummary}`)
      }
    }
  }

  if (summaries.length === 0) {
    return 'No context available from source sessions.'
  }

  const systemPrompt = [
    'You are a briefing assistant for an AI coding agent team.',
    'Generate a concise briefing that helps the target agent understand the current state of work.',
    'Focus on: what was done, what files were changed, any issues or blockers, and suggested next steps.',
    persona ? `The target agent persona is: ${persona.name} (${persona.agentType})` : '',
    persona?.systemPrompt ? `Persona context: ${persona.systemPrompt}` : '',
    'Keep the briefing under 500 words. Use bullet points for clarity.',
  ]
    .filter(Boolean)
    .join('\n')

  const userContent = [
    '# Source Session Summaries\n',
    summaries.join('\n\n'),
    additionalContext ? `\n# Additional Context\n${additionalContext}` : '',
    '\nGenerate a briefing for the target agent.',
  ].join('\n')

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock?.text ?? 'Failed to generate briefing.'
  } catch (err) {
    console.error('[BriefingEngine] Claude API error:', err)
    return `Briefing generation failed: ${err instanceof Error ? err.message : String(err)}`
  }
}
