/**
 * Routes incoming WS requests to the correct session handler.
 * Manages which clients are subscribed to which sessions.
 */
import type { WSFrame } from '../../shared/types'
import { subscribeClient, sendTo } from './broadcaster'

export type RequestHandler = (clientId: string, frame: WSFrame) => void

let onSend: RequestHandler = () => {}
let onResolve: RequestHandler = () => {}
let onBrief: RequestHandler = () => {}
let onSetMode: RequestHandler = () => {}
let onStatus: RequestHandler = () => {}

export function setHandlers(handlers: {
  onSend?: RequestHandler
  onResolve?: RequestHandler
  onBrief?: RequestHandler
  onSetMode?: RequestHandler
  onStatus?: RequestHandler
}): void {
  if (handlers.onSend) onSend = handlers.onSend
  if (handlers.onResolve) onResolve = handlers.onResolve
  if (handlers.onBrief) onBrief = handlers.onBrief
  if (handlers.onSetMode) onSetMode = handlers.onSetMode
  if (handlers.onStatus) onStatus = handlers.onStatus
}

export function routeRequest(clientId: string, frame: WSFrame): void {
  switch (frame.method) {
    case 'connect':
      // Subscribe client to the session
      if (frame.sessionId) {
        subscribeClient(clientId, frame.sessionId)
      }
      sendTo(clientId, {
        type: 'res',
        id: frame.id,
        method: 'connect',
        payload: { ok: true },
      })
      break
    case 'send':
      onSend(clientId, frame)
      break
    case 'resolve':
      onResolve(clientId, frame)
      break
    case 'brief':
      onBrief(clientId, frame)
      break
    case 'setMode':
      onSetMode(clientId, frame)
      break
    case 'status':
      onStatus(clientId, frame)
      break
    default:
      sendTo(clientId, {
        type: 'res',
        id: frame.id,
        error: `Unknown method: ${frame.method}`,
      })
  }
}
