/**
 * Zustand store for the WebSocket gateway connection.
 * Manages connect/disconnect, send frames, and event listeners.
 */
import { create } from 'zustand'
import type { WSFrame, WSEventName } from '../../shared/types'

type EventCallback = (frame: WSFrame) => void

interface GatewayStore {
  connected: boolean
  port: number | null
  ws: WebSocket | null
  listeners: Map<WSEventName, Set<EventCallback>>

  connect: (port: number) => void
  disconnect: () => void
  send: (frame: Omit<WSFrame, 'type'>) => void
  on: (event: WSEventName, callback: EventCallback) => () => void
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export const useGatewayStore = create<GatewayStore>((set, get) => ({
  connected: false,
  port: null,
  ws: null,
  listeners: new Map(),

  connect: (port: number) => {
    const existing = get().ws
    if (existing && existing.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`ws://localhost:${port}`)

    ws.onopen = () => {
      console.log(`[Gateway] Connected on port ${port}`)
      set({ connected: true, port, ws })
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data as string) as WSFrame
        if (frame.type === 'event' && frame.event) {
          const listeners = get().listeners.get(frame.event)
          if (listeners) {
            for (const cb of listeners) {
              try { cb(frame) } catch (e) { console.error('[Gateway] Listener error:', e) }
            }
          }
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      console.log('[Gateway] Disconnected')
      set({ connected: false, ws: null })
      // Auto-reconnect after 2 seconds
      reconnectTimer = setTimeout(() => {
        const { port: savedPort } = get()
        if (savedPort) get().connect(savedPort)
      }, 2000)
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  },

  disconnect: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const ws = get().ws
    if (ws) ws.close()
    set({ connected: false, ws: null })
  },

  send: (frame) => {
    const ws = get().ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'req', ...frame }))
    }
  },

  on: (event, callback) => {
    const { listeners } = get()
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }
    listeners.get(event)!.add(callback)
    set({ listeners: new Map(listeners) })

    // Return unsubscribe function
    return () => {
      const current = get().listeners
      const set_ = current.get(event)
      if (set_) {
        set_.delete(callback)
        if (set_.size === 0) current.delete(event)
        set({ listeners: new Map(current) })
      }
    }
  },
}))
