/**
 * Hook that connects the AgentChat UI to the Agent SDK IPC bridge.
 *
 * Each user message starts a new SDK query(). Multi-turn context is maintained
 * via the SDK's session resume (passing the previous session ID).
 */
import { useEffect, useCallback, useRef, useState } from 'react'
import { useAgentChatStore } from '../../../store/agentChat'
import { useSessionStore } from '../../../store/sessions'
import type { AgentSdkMessage } from '../../../../shared/agentSdkTypes'

interface UseAgentSdkOptions {
  sessionId: string
  cwd: string
  sdkSessionId?: string
  skipApproval: boolean
  env?: Record<string, string>
}

interface CommandInfo {
  name: string
  description: string
}

interface HistoryMeta {
  total: number
  loaded: number
}

interface UseAgentSdkReturn {
  sendPrompt: (prompt: string) => void
  stopAgent: () => void
  respondToPermission: (toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => void
  availableCommands: CommandInfo[]
  historyMeta: HistoryMeta | null
  loadFullHistory: () => void
}

export function useAgentSdk(options: UseAgentSdkOptions): UseAgentSdkReturn {
  const { sessionId, cwd, sdkSessionId, skipApproval, env } = options
  const isRunningRef = useRef(false)
  const hasActiveSessionRef = useRef(false)
  const [availableCommands, setAvailableCommands] = useState<CommandInfo[]>([])
  const [historyMeta, setHistoryMeta] = useState<HistoryMeta | null>(null)

  // Fetch available slash commands on mount
  useEffect(() => {
    void window.agentSdk.commands(env).then(setAvailableCommands)
  }, [env])

  // Load message history from the SDK transcript on mount.
  // Always reload — the in-memory store only has messages from the current
  // app session, not the full transcript. Clear and reload to show the
  // most recent messages from the persistent SDK session.
  const historyLoadedRef = useRef<string | null>(null)
  useEffect(() => {
    const stored = useSessionStore.getState().sessions.find(s => s.id === sessionId)
    const currentSdkId = stored?.sdkSessionId ?? sdkSessionId
    if (!currentSdkId || currentSdkId.length === 0) return
    // Skip if already loaded for this exact session+sdkId combo
    const key = `${sessionId}:${currentSdkId}`
    if (historyLoadedRef.current === key) return
    historyLoadedRef.current = key
    useAgentChatStore.getState().clearSession(sessionId)
    void window.agentSdk.loadHistory(currentSdkId, sessionId, env)
  }, [sessionId, sdkSessionId, env])

  // Subscribe to IPC events
  useEffect(() => {
    const cleanups: (() => void)[] = []

    const unsubMessage = window.agentSdk.onMessage(sessionId, (msg: AgentSdkMessage) => {
      useAgentChatStore.getState().addMessage(sessionId, msg)

      // Don't update activity status for history messages (loaded on mount)
      const isHistory = msg.id.startsWith('history-')
      if (!isHistory && (msg.type === 'text' || msg.type === 'tool_use')) {
        useSessionStore.getState().updateAgentMonitor(sessionId, {
          status: 'working',
          lastMessage: msg.text ?? msg.toolName ?? undefined,
        })
      }
    })
    cleanups.push(unsubMessage)

    const unsubDone = window.agentSdk.onDone(sessionId, (returnedSdkSessionId: string) => {
      isRunningRef.current = false
      useAgentChatStore.getState().setState(sessionId, 'idle')
      useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })
      if (returnedSdkSessionId && returnedSdkSessionId.length > 0) {
        useSessionStore.getState().setSdkSessionId(sessionId, returnedSdkSessionId)
      }
    })
    cleanups.push(unsubDone)

    const unsubError = window.agentSdk.onError(sessionId, (error: string) => {
      isRunningRef.current = false
      hasActiveSessionRef.current = false
      // Clear stale SDK session ID so next attempt starts fresh
      useSessionStore.getState().setSdkSessionId(sessionId, '')
      useAgentChatStore.getState().setError(sessionId, error)
      useAgentChatStore.getState().addMessage(sessionId, {
        id: `error-${String(Date.now())}`,
        type: 'error',
        timestamp: Date.now(),
        text: error,
      })
      useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })
    })
    cleanups.push(unsubError)

    const unsubPermission = window.agentSdk.onPermissionRequest(sessionId, (req) => {
      useAgentChatStore.getState().setPendingPermission(sessionId, req)
    })
    cleanups.push(unsubPermission)

    const unsubHistoryMeta = window.agentSdk.onHistoryMeta(sessionId, (meta) => {
      setHistoryMeta(meta)
    })
    cleanups.push(unsubHistoryMeta)

    return () => {
      cleanups.forEach((fn) => fn())
    }
  }, [sessionId])

  const sendPrompt = useCallback((prompt: string) => {
    if (isRunningRef.current) return

    const trimmed = prompt.trim()

    // Intercept commands the SDK doesn't support
    if (trimmed === '/login') {
      useAgentChatStore.getState().addMessage(sessionId, {
        id: `user-${String(Date.now())}`, type: 'text', timestamp: Date.now(), text: trimmed,
      })
      isRunningRef.current = true
      useAgentChatStore.getState().setState(sessionId, 'running')
      void window.agentSdk.login(sessionId)
      return
    }
    if (trimmed === '/status') {
      useAgentChatStore.getState().addMessage(sessionId, {
        id: `user-${String(Date.now())}`, type: 'text', timestamp: Date.now(), text: trimmed,
      })
      void window.agentSdk.status(sessionId, env)
      return
    }

    isRunningRef.current = true
    useAgentChatStore.getState().setState(sessionId, 'running')
    useAgentChatStore.getState().setError(sessionId, null)
    useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'working' })

    useAgentChatStore.getState().addMessage(sessionId, {
      id: `user-${String(Date.now())}`,
      type: 'text',
      timestamp: Date.now(),
      text: prompt,
    })

    if (hasActiveSessionRef.current) {
      // Session is alive — push message into the queue (no new process).
      // Pass cwd/env/skipApproval so if the main process lost the session
      // (e.g. after hot reload), it can start a new one with correct params.
      void window.agentSdk.send(sessionId, prompt, { cwd, skipApproval, env,
        sdkSessionId: useSessionStore.getState().sessions.find(s => s.id === sessionId)?.sdkSessionId })
    } else {
      // First message — start a new persistent session
      const storedId = useSessionStore.getState().sessions.find(s => s.id === sessionId)?.sdkSessionId
      const resumeId = storedId && storedId.length > 0 ? storedId : (sdkSessionId && sdkSessionId.length > 0 ? sdkSessionId : undefined)
      hasActiveSessionRef.current = true
      void window.agentSdk.start({
        id: sessionId,
        prompt,
        cwd,
        sdkSessionId: resumeId,
        skipApproval,
        env,
      })
    }
  }, [sessionId, cwd, sdkSessionId, skipApproval, env])

  const stopAgent = useCallback(() => {
    void window.agentSdk.stop(sessionId)
    isRunningRef.current = false
    hasActiveSessionRef.current = false
    useAgentChatStore.getState().setState(sessionId, 'idle')
    useSessionStore.getState().updateAgentMonitor(sessionId, { status: 'idle' })
  }, [sessionId])

  const respondToPermission = useCallback((toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => {
    void window.agentSdk.respondToPermission(sessionId, toolUseId, allowed, updatedInput)
    useAgentChatStore.getState().setPendingPermission(sessionId, null)
    if (allowed) {
      useAgentChatStore.getState().setState(sessionId, 'running')
    }
  }, [sessionId])

  const loadFullHistory = useCallback(() => {
    const stored = useSessionStore.getState().sessions.find(s => s.id === sessionId)
    const sdkId = stored?.sdkSessionId
    if (sdkId && sdkId.length > 0) {
      useAgentChatStore.getState().clearSession(sessionId)
      setHistoryMeta(null)
      void window.agentSdk.loadHistory(sdkId, sessionId, env, 9999)
    }
  }, [sessionId, env])

  return { sendPrompt, stopAgent, respondToPermission, availableCommands, historyMeta, loadFullHistory }
}
