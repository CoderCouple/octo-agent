/**
 * Gateway: WebSocket server on port 18789.
 * Single control plane — receives all input, broadcasts all output.
 * Never processes business logic (that's the supervisor's job).
 */
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { parseFrame } from './frameValidator'
import { addClient, removeClient, broadcastAll, broadcastToSession, getClientCount } from './broadcaster'
import { routeRequest, setHandlers, type RequestHandler } from './sessionRouter'
import type { WSFrame, AgentEvent } from '../../shared/types'

const DEFAULT_PORT = 18789
const HEARTBEAT_INTERVAL = 30_000

export class Gateway {
  private wss: WebSocketServer | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private port = DEFAULT_PORT

  /** Start the WebSocket server. Returns the actual port. */
  async start(preferredPort?: number): Promise<number> {
    this.port = preferredPort ?? DEFAULT_PORT

    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        console.log(`[Gateway] WebSocket server listening on port ${this.port}`)
        this.startHeartbeat()
        resolve(this.port)
      })

      this.wss.on('error', (err) => {
        // If port is in use, try next port
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          console.warn(`[Gateway] Port ${this.port} in use, trying ${this.port + 1}`)
          this.port += 1
          this.wss = new WebSocketServer({ port: this.port }, () => {
            console.log(`[Gateway] WebSocket server listening on port ${this.port}`)
            this.startHeartbeat()
            resolve(this.port)
          })
        } else {
          reject(err)
        }
      })

      this.wss.on('connection', (ws: WebSocket) => {
        const clientId = randomUUID()
        addClient(clientId, ws)
        console.log(`[Gateway] Client connected: ${clientId} (total: ${getClientCount()})`)

        ws.on('message', (raw: Buffer | string) => {
          const data = typeof raw === 'string' ? raw : raw.toString('utf-8')
          const frame = parseFrame(data)
          if (!frame) {
            ws.send(JSON.stringify({ type: 'res', id: 'error', error: 'Invalid frame' }))
            return
          }

          if (frame.type === 'req') {
            routeRequest(clientId, frame)
          }
        })

        ws.on('close', () => {
          removeClient(clientId)
          console.log(`[Gateway] Client disconnected: ${clientId} (total: ${getClientCount()})`)
        })

        ws.on('error', (err) => {
          console.error(`[Gateway] Client error (${clientId}):`, err.message)
          removeClient(clientId)
        })
      })
    })
  }

  /** Register route handlers (wired by main process to supervisor). */
  setRouteHandlers(handlers: {
    onSend?: RequestHandler
    onResolve?: RequestHandler
    onBrief?: RequestHandler
    onSetMode?: RequestHandler
    onStatus?: RequestHandler
    onSupervisorSend?: RequestHandler
  }): void {
    setHandlers(handlers)
  }

  /** Broadcast an agent event to all clients subscribed to that session. */
  emitAgentEvent(event: AgentEvent): void {
    const frame: WSFrame = {
      type: 'event',
      id: randomUUID(),
      event: 'agentEvent',
      sessionId: event.sessionId,
      payload: event as unknown as Record<string, unknown>,
    }
    broadcastToSession(event.sessionId, frame)
  }

  /** Broadcast a typed event to a session's subscribers. */
  emitSessionEvent(sessionId: string, eventName: WSFrame['event'], payload: Record<string, unknown>): void {
    const frame: WSFrame = {
      type: 'event',
      id: randomUUID(),
      event: eventName,
      sessionId,
      payload,
    }
    broadcastToSession(sessionId, frame)
  }

  /** Broadcast to ALL connected clients. */
  emitGlobalEvent(eventName: WSFrame['event'], payload: Record<string, unknown>): void {
    const frame: WSFrame = {
      type: 'event',
      id: randomUUID(),
      event: eventName,
      payload,
    }
    broadcastAll(frame)
  }

  getPort(): number {
    return this.port
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      broadcastAll({
        type: 'event',
        id: randomUUID(),
        event: 'heartbeat',
        payload: { timestamp: Date.now(), clients: getClientCount() },
      })
    }, HEARTBEAT_INTERVAL)
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log('[Gateway] WebSocket server stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}
