/**
 * Hook adapter: HTTP server that receives Claude Code hook POST requests.
 * Injects hook config into ~/.claude/settings.json.
 */
import { createServer, type Server } from 'http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { InboundMessage } from '../../../shared/types'

type HookCallback = (message: InboundMessage) => void

let server: Server | null = null
let hookPort = 0

/**
 * Start the hook HTTP server on a random available port.
 * Returns the port number.
 */
export async function startHookServer(onHook: HookCallback): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      if (req.method !== 'POST' || !req.url?.startsWith('/hook')) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      // Extract sessionId from URL: /hook/:sessionId
      const parts = req.url.split('/')
      const sessionId = parts[2] || 'unknown'

      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const hookData = JSON.parse(body) as Record<string, unknown>
          onHook({
            sessionId,
            source: 'hook',
            raw: hookData,
            timestamp: Date.now(),
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end('Invalid JSON')
        }
      })
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      hookPort = typeof addr === 'object' && addr ? addr.port : 0
      console.log(`[HookAdapter] HTTP server listening on port ${hookPort}`)
      resolve(hookPort)
    })

    server.on('error', reject)
  })
}

/**
 * Inject OctoAgent hook config into Claude Code's settings.
 * Adds PostToolUse and Stop hooks that POST to our HTTP server.
 */
export function injectHookConfig(sessionId: string): void {
  if (!hookPort) {
    console.warn('[HookAdapter] Hook server not started, cannot inject config')
    return
  }

  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')

  mkdirSync(claudeDir, { recursive: true })

  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Start fresh if corrupt
    }
  }

  const hookUrl = `http://127.0.0.1:${hookPort}/hook/${sessionId}`

  // Add hooks array if not present
  const hooks = (settings.hooks ?? []) as Array<Record<string, unknown>>

  // Check if our hooks already exist for this session
  const octoHookMarker = `octoagent:${sessionId}`
  const hasOurHooks = hooks.some((h) => h._octoagent === octoHookMarker)

  if (!hasOurHooks) {
    hooks.push(
      {
        _octoagent: octoHookMarker,
        event: 'PostToolUse',
        command: `curl -s -X POST ${hookUrl} -H 'Content-Type: application/json' -d '{"hook_type":"PostToolUse","tool_name":"$TOOL_NAME"}'`,
      },
      {
        _octoagent: octoHookMarker,
        event: 'Stop',
        command: `curl -s -X POST ${hookUrl} -H 'Content-Type: application/json' -d '{"hook_type":"Stop","event":"stop"}'`,
      },
    )
    settings.hooks = hooks
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    console.log(`[HookAdapter] Injected hook config for session ${sessionId}`)
  }
}

/** Remove OctoAgent hooks for a session from Claude Code settings. */
export function removeHookConfig(sessionId: string): void {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  if (!existsSync(settingsPath)) return

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const hooks = (settings.hooks ?? []) as Array<Record<string, unknown>>
    const octoHookMarker = `octoagent:${sessionId}`
    settings.hooks = hooks.filter((h) => h._octoagent !== octoHookMarker)
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch {
    // Ignore errors
  }
}

export function getHookPort(): number {
  return hookPort
}

export async function stopHookServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve())
    } else {
      resolve()
    }
  })
}
