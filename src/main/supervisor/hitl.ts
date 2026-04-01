/**
 * Human-in-the-loop decision system (minimal Phase 3 stub).
 * Full 4-layer system in Phase 6: persona check, auto-rules, timers, push.
 */
import { randomUUID } from 'crypto'
import type { Decision, DecisionSeverity } from '../../shared/types'

const pendingDecisions = new Map<string, Decision>()

/** Create a new pending decision. */
export function createDecision(opts: {
  sessionId: string
  severity: DecisionSeverity
  prompt: string
  toolName?: string
  filePath?: string
}): Decision {
  const decision: Decision = {
    id: randomUUID(),
    sessionId: opts.sessionId,
    severity: opts.severity,
    prompt: opts.prompt,
    toolName: opts.toolName,
    filePath: opts.filePath,
    timestamp: Date.now(),
    resolved: false,
  }
  pendingDecisions.set(decision.id, decision)
  return decision
}

/** Resolve a pending decision. Returns the updated decision or null. */
export function resolveDecision(decisionId: string, resolution: string): Decision | null {
  const decision = pendingDecisions.get(decisionId)
  if (!decision) return null
  decision.resolved = true
  decision.resolution = resolution
  decision.resolvedAt = Date.now()
  pendingDecisions.delete(decisionId)
  return decision
}

/** Get all pending decisions for a session. */
export function getPendingDecisions(sessionId: string): Decision[] {
  return [...pendingDecisions.values()].filter((d) => d.sessionId === sessionId)
}

/** Get a specific pending decision. */
export function getDecision(decisionId: string): Decision | undefined {
  return pendingDecisions.get(decisionId)
}

/** Clear all pending decisions for a session. */
export function clearSessionDecisions(sessionId: string): void {
  for (const [id, d] of pendingDecisions) {
    if (d.sessionId === sessionId) pendingDecisions.delete(id)
  }
}
