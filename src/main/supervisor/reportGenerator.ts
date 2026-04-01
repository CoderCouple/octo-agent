/**
 * Report generator: produces structured end-of-run reports using Claude API.
 * Generates a markdown report from the last N events across all sessions.
 */
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { getRecentEvents, getSessionDir, readMemory } from './sessionMemory'

const client = new Anthropic()

/**
 * Generate a report for one or more sessions.
 * Writes report.md to the primary session's directory and returns the content.
 */
export async function generateReport(opts: {
  sessionIds: string[]
  maxEventsPerSession?: number
}): Promise<string> {
  const { sessionIds, maxEventsPerSession = 100 } = opts

  const sections: string[] = []

  for (const sessionId of sessionIds) {
    const memory = readMemory(sessionId)
    const events = getRecentEvents(sessionId, maxEventsPerSession)

    const eventSummary = events.length > 0
      ? events
          .map((e) => `- **${e.type}** (${new Date(e.timestamp).toLocaleTimeString()}): ${JSON.stringify(e.data).slice(0, 150)}`)
          .join('\n')
      : 'No events recorded.'

    sections.push([
      `## Session: ${sessionId}`,
      '',
      memory ? `### Memory Summary\n${memory}` : '',
      '',
      `### Event Log (last ${events.length} events)`,
      eventSummary,
    ].filter(Boolean).join('\n'))
  }

  const systemPrompt = [
    'You are a reporting assistant for an AI coding agent team.',
    'Generate a structured markdown report summarizing the work completed.',
    'Include sections for: Overview, Files Changed, Issues Encountered, and Recommendations.',
    'Be concise but thorough. Use markdown formatting.',
  ].join('\n')

  const userContent = [
    '# Session Data\n',
    sections.join('\n\n---\n\n'),
    '\nGenerate a structured report summarizing all sessions above.',
  ].join('\n')

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const report = textBlock?.text ?? 'Failed to generate report.'

    // Write report.md to the first session's directory
    if (sessionIds.length > 0) {
      const dir = getSessionDir(sessionIds[0])
      writeFileSync(join(dir, 'report.md'), report, 'utf-8')
    }

    return report
  } catch (err) {
    console.error('[ReportGenerator] Claude API error:', err)
    const fallback = `# Report Generation Failed\n\nError: ${err instanceof Error ? err.message : String(err)}\n\n${sections.join('\n\n')}`
    // Still write the fallback
    if (sessionIds.length > 0) {
      const dir = getSessionDir(sessionIds[0])
      writeFileSync(join(dir, 'report.md'), fallback, 'utf-8')
    }
    return fallback
  }
}
