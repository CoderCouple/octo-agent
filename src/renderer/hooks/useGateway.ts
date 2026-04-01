/**
 * React hook: get gateway port via IPC, connect WebSocket, dispatch events
 * to chat store, queue store, etc.
 * Call once in App.tsx on mount.
 */
import { useEffect } from 'react'
import { useGatewayStore } from '../store/gateway'
import { useChatStore } from '../store/chat'
import { useQueueStore } from '../store/queue'
import { randomUUID } from '../shared/utils/ids'
import type { WSFrame } from '../../shared/types'

export function useGateway(): void {
  const connect = useGatewayStore((s) => s.connect)
  const connected = useGatewayStore((s) => s.connected)
  const on = useGatewayStore((s) => s.on)
  const addMessage = useChatStore((s) => s.addMessage)
  const addAttention = useQueueStore((s) => s.add)

  // Connect on mount
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const port = await window.octoagent.getGatewayPort()
        if (cancelled) return
        connect(port)
      } catch (err) {
        console.error('[useGateway] Failed to get gateway port:', err)
      }
    }
    void init()
    return () => { cancelled = true }
  }, [connect])

  // Subscribe to gateway events and dispatch to stores
  useEffect(() => {
    const unsubs: Array<() => void> = []

    // Agent events → chat messages
    unsubs.push(
      on('agentEvent', (frame: WSFrame) => {
        const payload = frame.payload as Record<string, unknown> | undefined
        if (!payload || !frame.sessionId) return

        const eventType = payload.type as string
        let text = ''

        switch (eventType) {
          case 'working':
            text = `Agent working: ${(payload.data as Record<string, unknown>)?.activity || 'processing...'}`
            break
          case 'fileChanged':
            text = `File changed: ${(payload.data as Record<string, unknown>)?.filePath || 'unknown'}`
            break
          case 'done':
            text = `Agent done: ${(payload.data as Record<string, unknown>)?.reason || 'completed'}`
            break
          case 'error':
            text = `Error: ${(payload.data as Record<string, unknown>)?.message || 'unknown error'}`
            break
          case 'toolUse':
            text = `Tool: ${(payload.data as Record<string, unknown>)?.toolName || 'unknown'}`
            break
          case 'message':
            text = String((payload.data as Record<string, unknown>)?.text || '')
            break
          case 'conflict':
            text = `Conflict: ${(payload.data as Record<string, unknown>)?.filePath || 'unknown file'}`
            break
          default:
            text = `${eventType}: ${JSON.stringify(payload.data || {}).slice(0, 100)}`
        }

        addMessage({
          id: payload.id as string || randomUUID(),
          sessionId: frame.sessionId,
          type: eventType === 'message' && (payload.data as Record<string, unknown>)?.from === 'user' ? 'user' : 'agent',
          timestamp: (payload.timestamp as number) || Date.now(),
          text,
          data: { eventType, ...(payload.data as Record<string, unknown> || {}) },
        })
      }),
    )

    // Decision events → chat + queue
    unsubs.push(
      on('decision', (frame: WSFrame) => {
        const payload = frame.payload as Record<string, unknown> | undefined
        if (!payload || !frame.sessionId) return

        addMessage({
          id: randomUUID(),
          sessionId: frame.sessionId,
          type: 'decision',
          timestamp: (payload.timestamp as number) || Date.now(),
          text: (payload.prompt as string) || 'Permission needed',
          data: payload,
        })

        // Add to attention queue if not resolved
        if (!payload.resolved) {
          addAttention({
            id: payload.id as string || randomUUID(),
            sessionId: frame.sessionId,
            priority: payload.severity === 'hard' ? 'high' : 'medium',
            title: (payload.toolName as string) || 'Decision needed',
            description: (payload.prompt as string) || '',
            timestamp: Date.now(),
            decisionId: payload.id as string,
          })
        }
      }),
    )

    // Memory update events → chat
    unsubs.push(
      on('memoryUpdate', (frame: WSFrame) => {
        if (!frame.sessionId) return
        addMessage({
          id: randomUUID(),
          sessionId: frame.sessionId,
          type: 'memory',
          timestamp: Date.now(),
          text: `Memory updated: ${(frame.payload?.summary as string) || 'session summary saved'}`,
        })
      }),
    )

    // Report events → chat
    unsubs.push(
      on('report', (frame: WSFrame) => {
        if (!frame.sessionId) return
        addMessage({
          id: randomUUID(),
          sessionId: frame.sessionId,
          type: 'report',
          timestamp: Date.now(),
          text: (frame.payload?.content as string) || 'Report generated',
          data: frame.payload,
        })
      }),
    )

    return () => { unsubs.forEach((u) => u()) }
  }, [on, addMessage, addAttention])

  // Log connection status
  useEffect(() => {
    if (connected) console.log('[useGateway] Gateway connected')
  }, [connected])
}
