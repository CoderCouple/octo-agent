#!/usr/bin/env node
/**
 * Stdio MCP server providing peer discovery and messaging tools to agents.
 * Each agent session spawns one instance. Communicates with the Peers Adapter
 * HTTP endpoint for actual peer operations.
 *
 * Environment variables:
 *   PEERS_ADAPTER_PORT - Port of the peers adapter HTTP server
 *   PEER_ID            - This agent's peer ID
 *
 * MCP Protocol: JSON-RPC 2.0 over stdio (one JSON object per line).
 */
import * as http from 'http'

const PEERS_PORT = parseInt(process.env.PEERS_ADAPTER_PORT || '0', 10)
const PEER_ID = process.env.PEER_ID || 'unknown'

// ─── HTTP helpers ───────────────────────────────────────────────

function httpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PEERS_PORT,
        path,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : undefined,
      },
      (res) => {
        let buf = ''
        res.on('data', (chunk: Buffer) => { buf += chunk.toString() })
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf))
          } catch {
            resolve(buf)
          }
        })
      },
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// ─── Tool definitions ───────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_peers',
    description:
      'List all active AI agent peers in this OctoAgent session. Returns each peer\'s ID, working directory, branch, and a summary of what they\'re working on.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'send_message',
    description:
      'Send a message to another AI agent peer. Use this to coordinate work, ask questions, or share information with other agents.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'The peer ID of the agent to send the message to' },
        text: { type: 'string', description: 'The message text to send' },
      },
      required: ['to', 'text'],
    },
  },
  {
    name: 'check_messages',
    description:
      'Check for new messages from other AI agent peers. Returns and clears any pending messages addressed to you.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'set_summary',
    description:
      'Set a short summary of what you are currently working on. Other agents can see this when they list peers, helping them understand your current focus.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: 'A brief summary of your current work (1-2 sentences)' },
      },
      required: ['summary'],
    },
  },
]

// ─── Tool execution ─────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'list_peers': {
      const result = (await httpRequest('GET', '/peers/list')) as { peers: Array<Record<string, unknown>> }
      const peersList = (result.peers || [])
        .filter((p) => p.peerId !== PEER_ID) // exclude self
        .map((p) => `- ${p.peerId}: dir=${p.directory}, branch=${p.branch}${p.summary ? `, summary: ${p.summary}` : ''}`)
      if (peersList.length === 0) return 'No other peers are currently active.'
      return `Active peers:\n${peersList.join('\n')}`
    }

    case 'send_message': {
      const result = await httpRequest('POST', '/peers/send', {
        from: PEER_ID,
        to: args.to,
        text: args.text,
      })
      const res = result as { ok?: boolean; error?: string }
      if (res.error) return `Failed to send: ${res.error}`
      return `Message sent to ${args.to}.`
    }

    case 'check_messages': {
      const result = (await httpRequest('GET', `/peers/messages/${PEER_ID}`)) as {
        messages: Array<{ from: string; text: string; timestamp: number }>
      }
      const msgs = result.messages || []
      if (msgs.length === 0) return 'No new messages.'
      return msgs
        .map((m) => `[From ${m.from}]: ${m.text}`)
        .join('\n')
    }

    case 'set_summary': {
      await httpRequest('POST', '/peers/summary', {
        peerId: PEER_ID,
        summary: args.summary,
      })
      return 'Summary updated.'
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ─── MCP JSON-RPC stdio protocol ────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

function sendResponse(id: number | string | null, result: unknown): void {
  const response = { jsonrpc: '2.0', id, result }
  process.stdout.write(JSON.stringify(response) + '\n')
}

function sendError(id: number | string | null, code: number, message: string): void {
  const response = { jsonrpc: '2.0', id, error: { code, message } }
  process.stdout.write(JSON.stringify(response) + '\n')
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  switch (req.method) {
    case 'initialize':
      sendResponse(req.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'octoagent-peers', version: '1.0.0' },
      })
      break

    case 'notifications/initialized':
      // No response needed for notifications
      break

    case 'tools/list':
      sendResponse(req.id, { tools: TOOLS })
      break

    case 'tools/call': {
      const params = req.params || {}
      const toolName = params.name as string
      const toolArgs = (params.arguments || {}) as Record<string, unknown>
      try {
        const text = await executeTool(toolName, toolArgs)
        sendResponse(req.id, {
          content: [{ type: 'text', text }],
        })
      } catch (err) {
        sendResponse(req.id, {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        })
      }
      break
    }

    default:
      sendError(req.id, -32601, `Method not found: ${req.method}`)
  }
}

// ─── Stdio line reader ──────────────────────────────────────────

let buffer = ''

process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || '' // keep incomplete line in buffer
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const req = JSON.parse(trimmed) as JsonRpcRequest
      void handleRequest(req)
    } catch {
      sendError(null, -32700, 'Parse error')
    }
  }
})

process.stdin.on('end', () => {
  process.exit(0)
})

// Prevent unhandled rejection crashes
process.on('unhandledRejection', (err) => {
  process.stderr.write(`[peers-mcp] Unhandled rejection: ${err}\n`)
})
