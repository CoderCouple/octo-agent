/**
 * Peers Adapter: HTTP server for inter-agent peer discovery and messaging.
 * Provides endpoints for MCP servers to register peers, list peers,
 * send messages, poll messages, and set summaries.
 */
import { createServer, type Server } from 'http'

export interface PeerInfo {
  peerId: string
  sessionId: string
  directory: string
  branch: string
  agentType?: string
  summary?: string
  registeredAt: number
}

export interface PeerMessage {
  id: string
  from: string
  fromName?: string
  to: string
  text: string
  timestamp: number
}

type PeerMessageCallback = (message: PeerMessage) => void

/** All registered peers. */
const peers = new Map<string, PeerInfo>()
/** Pending messages per peer (returned and cleared on poll). */
const pendingMessages = new Map<string, PeerMessage[]>()

let server: Server | null = null
let peersPort = 0
let onPeerMessage: PeerMessageCallback | null = null

function parseJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>)
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function jsonResponse(res: import('http').ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

/**
 * Start the peers HTTP server on a random available port.
 * Returns the port number.
 */
export async function startPeersServer(onMessage: PeerMessageCallback): Promise<number> {
  onPeerMessage = onMessage

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }

      const url = req.url || ''

      // POST /peers/register
      if (req.method === 'POST' && url === '/peers/register') {
        void handleRegister(req, res)
        return
      }

      // GET /peers/list
      if (req.method === 'GET' && url === '/peers/list') {
        handleList(res)
        return
      }

      // POST /peers/send
      if (req.method === 'POST' && url === '/peers/send') {
        void handleSend(req, res)
        return
      }

      // GET /peers/messages/:peerId
      if (req.method === 'GET' && url.startsWith('/peers/messages/')) {
        const peerId = url.split('/peers/messages/')[1]
        if (peerId) {
          handlePollMessages(peerId, res)
          return
        }
      }

      // POST /peers/summary
      if (req.method === 'POST' && url === '/peers/summary') {
        void handleSetSummary(req, res)
        return
      }

      // POST /peers/unregister
      if (req.method === 'POST' && url === '/peers/unregister') {
        void handleUnregister(req, res)
        return
      }

      res.writeHead(404)
      res.end('Not Found')
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      peersPort = typeof addr === 'object' && addr ? addr.port : 0
      console.log(`[PeersAdapter] HTTP server listening on port ${peersPort}`)
      resolve(peersPort)
    })

    server.on('error', reject)
  })
}

async function handleRegister(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
  try {
    const body = await parseJsonBody(req)
    const peerId = body.peerId as string
    const sessionId = body.sessionId as string
    if (!peerId || !sessionId) {
      jsonResponse(res, 400, { error: 'peerId and sessionId required' })
      return
    }
    const peer: PeerInfo = {
      peerId,
      sessionId,
      directory: (body.directory as string) || '',
      branch: (body.branch as string) || '',
      agentType: body.agentType as string | undefined,
      summary: body.summary as string | undefined,
      registeredAt: Date.now(),
    }
    peers.set(peerId, peer)
    if (!pendingMessages.has(peerId)) {
      pendingMessages.set(peerId, [])
    }
    console.log(`[PeersAdapter] Registered peer: ${peerId} (session: ${sessionId})`)
    jsonResponse(res, 200, { ok: true, peerId })
  } catch {
    jsonResponse(res, 400, { error: 'Invalid request body' })
  }
}

function handleList(res: import('http').ServerResponse): void {
  const list = [...peers.values()].map((p) => ({
    peerId: p.peerId,
    sessionId: p.sessionId,
    directory: p.directory,
    branch: p.branch,
    agentType: p.agentType,
    summary: p.summary,
  }))
  jsonResponse(res, 200, { peers: list })
}

async function handleSend(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
  try {
    const body = await parseJsonBody(req)
    const from = body.from as string
    const to = body.to as string
    const text = body.text as string
    if (!from || !to || !text) {
      jsonResponse(res, 400, { error: 'from, to, and text required' })
      return
    }

    const fromPeer = peers.get(from)
    const toPeer = peers.get(to)
    if (!toPeer) {
      jsonResponse(res, 404, { error: `Peer ${to} not found` })
      return
    }

    const message: PeerMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      from,
      fromName: fromPeer?.peerId,
      to,
      text,
      timestamp: Date.now(),
    }

    // Queue for polling
    const queue = pendingMessages.get(to) || []
    queue.push(message)
    pendingMessages.set(to, queue)

    // Notify supervisor
    if (onPeerMessage) {
      onPeerMessage(message)
    }

    jsonResponse(res, 200, { ok: true, messageId: message.id })
  } catch {
    jsonResponse(res, 400, { error: 'Invalid request body' })
  }
}

function handlePollMessages(peerId: string, res: import('http').ServerResponse): void {
  const queue = pendingMessages.get(peerId) || []
  // Return and clear
  pendingMessages.set(peerId, [])
  jsonResponse(res, 200, { messages: queue })
}

async function handleSetSummary(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
  try {
    const body = await parseJsonBody(req)
    const peerId = body.peerId as string
    const summary = body.summary as string
    if (!peerId || !summary) {
      jsonResponse(res, 400, { error: 'peerId and summary required' })
      return
    }
    const peer = peers.get(peerId)
    if (!peer) {
      jsonResponse(res, 404, { error: `Peer ${peerId} not found` })
      return
    }
    peer.summary = summary
    jsonResponse(res, 200, { ok: true })
  } catch {
    jsonResponse(res, 400, { error: 'Invalid request body' })
  }
}

async function handleUnregister(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
  try {
    const body = await parseJsonBody(req)
    const peerId = body.peerId as string
    if (!peerId) {
      jsonResponse(res, 400, { error: 'peerId required' })
      return
    }
    peers.delete(peerId)
    pendingMessages.delete(peerId)
    console.log(`[PeersAdapter] Unregistered peer: ${peerId}`)
    jsonResponse(res, 200, { ok: true })
  } catch {
    jsonResponse(res, 400, { error: 'Invalid request body' })
  }
}

/** Register a peer programmatically (from main process). */
export function registerPeer(info: PeerInfo): void {
  peers.set(info.peerId, info)
  if (!pendingMessages.has(info.peerId)) {
    pendingMessages.set(info.peerId, [])
  }
}

/** Unregister a peer programmatically. */
export function unregisterPeer(peerId: string): void {
  peers.delete(peerId)
  pendingMessages.delete(peerId)
}

/** Get all registered peers. */
export function getPeers(): PeerInfo[] {
  return [...peers.values()]
}

/** Queue a message for a peer (used by supervisor for group sends). */
export function queueMessageForPeer(message: PeerMessage): void {
  const queue = pendingMessages.get(message.to) || []
  queue.push(message)
  pendingMessages.set(message.to, queue)
}

export function getPeersPort(): number {
  return peersPort
}

export async function stopPeersServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve())
    } else {
      resolve()
    }
  })
}
