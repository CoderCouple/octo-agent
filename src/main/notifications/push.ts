/**
 * Push notification module: sends decision alerts to the user's phone.
 * POSTs a JSON payload to a configurable webhook URL (e.g. Cloudflare Worker → APNs).
 * Falls back to console log if no webhook is configured.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Decision, PushConfig } from '../../shared/types'

const CONFIG_FILE = join(homedir(), '.octoagent', 'config.json')

function loadPushConfig(): PushConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as Record<string, unknown>
      const push = config.push as PushConfig | undefined
      if (push) return push
    }
  } catch {
    // Use defaults
  }
  return { enabled: false }
}

/**
 * Send a push notification for a HITL decision.
 * Returns true if the push was sent successfully.
 */
export async function sendPush(decision: Decision): Promise<boolean> {
  const config = loadPushConfig()

  if (!config.enabled || !config.webhookUrl) {
    console.log(`[Push] Push not configured, logging decision ${decision.id} (${decision.severity}): ${decision.prompt}`)
    return false
  }

  const payload = {
    title: decision.severity === 'hard' ? 'Urgent: Agent needs attention' : 'Agent waiting for input',
    body: decision.prompt.slice(0, 200),
    data: {
      decisionId: decision.id,
      sessionId: decision.sessionId,
      severity: decision.severity,
      toolName: decision.toolName,
      filePath: decision.filePath,
    },
    timestamp: Date.now(),
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.error(`[Push] Webhook returned ${response.status}: ${await response.text()}`)
      return false
    }

    console.log(`[Push] Notification sent for decision ${decision.id}`)
    return true
  } catch (err) {
    console.error('[Push] Failed to send notification:', err)
    return false
  }
}
