/**
 * React hook: get gateway port via IPC, connect WebSocket, dispatch events.
 * Call once in App.tsx on mount.
 */
import { useEffect } from 'react'
import { useGatewayStore } from '../store/gateway'

export function useGateway(): void {
  const connect = useGatewayStore((s) => s.connect)
  const connected = useGatewayStore((s) => s.connected)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // Get the gateway port from the main process via IPC
        const port = await window.octoagent.getGatewayPort()
        if (cancelled) return
        connect(port)
      } catch (err) {
        console.error('[useGateway] Failed to get gateway port:', err)
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [connect])

  // Log connection status changes
  useEffect(() => {
    if (connected) {
      console.log('[useGateway] Gateway connected')
    }
  }, [connected])
}
