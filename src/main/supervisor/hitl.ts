/**
 * Human-in-the-loop decision system — full 4-layer implementation.
 *
 * Layer 1: Persona-allowed check — if the tool/path is in the persona's
 *          allowedTools/allowedPaths, pass through silently.
 * Layer 2: Auto-rule match — if a saved auto-rule matches, resolve silently.
 * Layer 3: Soft interrupt — emit decision, start 60s timer. If unresolved
 *          after timeout, escalate to push notification.
 * Layer 4: Hard interrupt — emit decision + immediate push notification.
 *
 * After 3 identical resolutions for the same pattern, suggests saving as
 * an auto-rule.
 */
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Decision, DecisionSeverity, Persona, AutoRule } from '../../shared/types'

// ─── State ──────────────────────────────────────────────────────
const pendingDecisions = new Map<string, Decision>()
const decisionTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Tracks resolution frequency: key = "toolName|resolution" → count */
const resolutionFrequency = new Map<string, number>()

const SOFT_TIMEOUT_MS = 60_000
const AUTO_RULE_THRESHOLD = 3

// ─── Auto-Rules ─────────────────────────────────────────────────
const OCTOAGENT_DIR = join(homedir(), '.octoagent')
const AUTO_RULES_FILE = join(OCTOAGENT_DIR, 'auto-rules.json')

let autoRules: AutoRule[] = []

export function loadAutoRules(): void {
  try {
    if (existsSync(AUTO_RULES_FILE)) {
      autoRules = JSON.parse(readFileSync(AUTO_RULES_FILE, 'utf-8')) as AutoRule[]
    }
  } catch {
    autoRules = []
  }
}

function saveAutoRules(): void {
  try {
    if (!existsSync(OCTOAGENT_DIR)) mkdirSync(OCTOAGENT_DIR, { recursive: true })
    writeFileSync(AUTO_RULES_FILE, JSON.stringify(autoRules, null, 2))
  } catch (err) {
    console.error('[HITL] Failed to save auto-rules:', err)
  }
}

export function getAutoRules(): AutoRule[] {
  return [...autoRules]
}

export function addAutoRule(rule: Omit<AutoRule, 'id' | 'hitCount' | 'createdAt'>): AutoRule {
  const newRule: AutoRule = {
    ...rule,
    id: randomUUID(),
    hitCount: 0,
    createdAt: Date.now(),
  }
  autoRules.push(newRule)
  saveAutoRules()
  return newRule
}

export function removeAutoRule(ruleId: string): void {
  autoRules = autoRules.filter((r) => r.id !== ruleId)
  saveAutoRules()
}

/** Check if an auto-rule matches a decision request. */
function matchAutoRule(opts: {
  toolName?: string
  filePath?: string
  prompt: string
}): AutoRule | null {
  for (const rule of autoRules) {
    if (rule.patternType === 'toolName' && opts.toolName && opts.toolName === rule.pattern) {
      return rule
    }
    if (rule.patternType === 'filePath' && opts.filePath) {
      // Simple glob: supports trailing * (e.g. "src/test/*")
      if (rule.pattern.endsWith('*')) {
        const prefix = rule.pattern.slice(0, -1)
        if (opts.filePath.startsWith(prefix)) return rule
      } else if (opts.filePath === rule.pattern) {
        return rule
      }
    }
    if (rule.patternType === 'prompt') {
      try {
        if (new RegExp(rule.pattern, 'i').test(opts.prompt)) return rule
      } catch {
        // Invalid regex, skip
      }
    }
  }
  return null
}

// ─── Layer 0: Risk Assessment ───────────────────────────────────

/** Tools that are always safe to auto-approve (read-only operations). */
export const SAFE_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
  'list_peers', 'check_messages', 'TaskList', 'TaskGet',
  'LS', 'View', 'Search', 'Find', 'Cat', 'Head', 'Tail',
  'git_status', 'git_log', 'git_diff',
])

/** Patterns in command/prompt text that indicate critical/dangerous operations. */
export const CRITICAL_PATTERNS = [
  /rm\s+-rf\b/i,
  /git\s+push\s+--force\b/i,
  /git\s+push\s+-f\b/i,
  /DROP\s+TABLE\b/i,
  /DROP\s+DATABASE\b/i,
  /sudo\b/i,
  /chmod\s+777\b/i,
  /\bformat\s+[a-z]:/i,
  /git\s+reset\s+--hard\b/i,
  /truncate\s+table\b/i,
  /DELETE\s+FROM\s+\w+\s*;?\s*$/i, // DELETE without WHERE
  /npm\s+publish\b/i,
]

export type RiskLevel = 'safe' | 'moderate' | 'critical'

/**
 * Layer 0: Assess the risk level of an operation.
 * - Safe tools → auto-approve
 * - Critical patterns → force hard severity
 * - Everything else → moderate (falls through to Layer 1-4)
 */
export function assessRisk(opts: { toolName?: string; prompt: string }): RiskLevel {
  // Check if tool is in the safe list
  if (opts.toolName && SAFE_TOOLS.has(opts.toolName)) {
    return 'safe'
  }

  // Check for critical patterns in the prompt text
  const textToCheck = opts.prompt ?? ''
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return 'critical'
    }
  }

  return 'moderate'
}

// ─── Callbacks ──────────────────────────────────────────────────
type PushCallback = (decision: Decision) => void
type AutoRuleSuggestionCallback = (suggestion: {
  sessionId: string
  pattern: string
  patternType: AutoRule['patternType']
  resolution: string
  count: number
}) => void

let onPush: PushCallback | null = null
let onAutoRuleSuggestion: AutoRuleSuggestionCallback | null = null

export function setOnPush(cb: PushCallback): void {
  onPush = cb
}

export function setOnAutoRuleSuggestion(cb: AutoRuleSuggestionCallback): void {
  onAutoRuleSuggestion = cb
}

// ─── Layer 1: Persona Check ─────────────────────────────────────

/** Returns true if the persona allows this action (no decision needed). */
function personaAllows(persona: Persona | undefined, toolName?: string, filePath?: string): boolean {
  if (!persona) return false

  // Check allowed tools
  if (toolName && persona.allowedTools?.length) {
    if (persona.allowedTools.includes(toolName) || persona.allowedTools.includes('*')) {
      // If also has path restrictions, check those too
      if (persona.allowedPaths?.length && filePath) {
        return persona.allowedPaths.some((p) =>
          p.endsWith('*') ? filePath.startsWith(p.slice(0, -1)) : filePath === p,
        )
      }
      return true
    }
  }

  return false
}

// ─── Core API ───────────────────────────────────────────────────

export interface CreateDecisionOpts {
  sessionId: string
  severity: DecisionSeverity
  prompt: string
  toolName?: string
  filePath?: string
  persona?: Persona
}

export interface CreateDecisionResult {
  /** null if auto-resolved (persona or rule) */
  decision: Decision | null
  /** If auto-resolved, the resolution string */
  autoResolution?: string
  /** The auto-rule that matched, if any */
  matchedRule?: AutoRule
}

/**
 * Run the 4-layer HITL check. Returns a decision if human input is needed,
 * or null + autoResolution if it was auto-resolved.
 */
export function createDecision(opts: CreateDecisionOpts): CreateDecisionResult {
  // Layer 1: Persona-allowed check
  if (personaAllows(opts.persona, opts.toolName, opts.filePath)) {
    return { decision: null, autoResolution: 'yes' }
  }

  // Layer 2: Auto-rule match
  const rule = matchAutoRule({
    toolName: opts.toolName,
    filePath: opts.filePath,
    prompt: opts.prompt,
  })
  if (rule) {
    rule.hitCount++
    saveAutoRules()
    return { decision: null, autoResolution: rule.resolution, matchedRule: rule }
  }

  // Layers 3 & 4: Create a pending decision
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

  // Layer 3: Soft interrupt — start 60s timer then push
  if (opts.severity === 'soft') {
    const timer = setTimeout(() => {
      decisionTimers.delete(decision.id)
      // If still unresolved, escalate to push
      if (pendingDecisions.has(decision.id) && onPush) {
        console.log(`[HITL] Soft timeout for decision ${decision.id}, sending push`)
        onPush(decision)
      }
    }, SOFT_TIMEOUT_MS)
    decisionTimers.set(decision.id, timer)
  }

  // Layer 4: Hard interrupt — immediate push
  if (opts.severity === 'hard' && onPush) {
    console.log(`[HITL] Hard interrupt for decision ${decision.id}, sending push immediately`)
    onPush(decision)
  }

  return { decision }
}

/** Resolve a pending decision. Returns the updated decision or null. */
export function resolveDecision(decisionId: string, resolution: string): Decision | null {
  const decision = pendingDecisions.get(decisionId)
  if (!decision) return null

  decision.resolved = true
  decision.resolution = resolution
  decision.resolvedAt = Date.now()
  pendingDecisions.delete(decisionId)

  // Clear any pending timer
  const timer = decisionTimers.get(decisionId)
  if (timer) {
    clearTimeout(timer)
    decisionTimers.delete(decisionId)
  }

  // Track resolution frequency for auto-rule suggestion
  const patternKey = decision.toolName ?? decision.prompt.slice(0, 50)
  const freqKey = `${patternKey}|${resolution}`
  const count = (resolutionFrequency.get(freqKey) ?? 0) + 1
  resolutionFrequency.set(freqKey, count)

  // After threshold identical resolutions, suggest auto-rule
  if (count === AUTO_RULE_THRESHOLD && onAutoRuleSuggestion) {
    onAutoRuleSuggestion({
      sessionId: decision.sessionId,
      pattern: decision.toolName ?? decision.prompt.slice(0, 50),
      patternType: decision.toolName ? 'toolName' : 'prompt',
      resolution,
      count,
    })
  }

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
    if (d.sessionId === sessionId) {
      const timer = decisionTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        decisionTimers.delete(id)
      }
      pendingDecisions.delete(id)
    }
  }
}
