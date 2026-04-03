/**
 * Client map iteration and broadcast to open WebSocket connections.
 */
import type { WebSocket } from 'ws'
import type { WSFrame } from '../../shared/types'

/** Map of clientId → WebSocket */
const clients = new Map<string, WebSocket>()

/** Map of clientId → Set of subscribed sessionIds */
const subscriptions = new Map<string, Set<string>>()

export function addClient(id: string, ws: WebSocket): void {
  clients.set(id, ws)
  subscriptions.set(id, new Set())
}

export function removeClient(id: string): void {
  clients.delete(id)
  subscriptions.delete(id)
}

export function subscribeClient(clientId: string, sessionId: string): void {
  const subs = subscriptions.get(clientId)
  if (subs) subs.add(sessionId)
}

export function getClientCount(): number {
  return clients.size
}

/** Send a frame to a specific client. */
export function sendTo(clientId: string, frame: WSFrame): void {
  const ws = clients.get(clientId)
  if (ws && ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(frame))
    } catch {
      // Socket closed mid-send (EPIPE) — remove the dead client
      removeClient(clientId)
    }
  }
}

/** Broadcast an event frame to all clients subscribed to a session. */
export function broadcastToSession(sessionId: string, frame: WSFrame): void {
  for (const [clientId, subs] of subscriptions) {
    if (subs.has(sessionId)) {
      sendTo(clientId, frame)
    }
  }
}

/** Broadcast a frame to ALL connected clients (e.g. heartbeat). */
export function broadcastAll(frame: WSFrame): void {
  const data = JSON.stringify(frame)
  for (const [clientId, ws] of clients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(data)
      } catch {
        removeClient(clientId)
      }
    }
  }
}
