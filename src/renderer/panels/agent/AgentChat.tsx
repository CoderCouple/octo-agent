/**
 * Chat-based agent panel for API-mode (Agent SDK) sessions.
 *
 * Replaces the xterm Terminal for Claude sessions using the Agent SDK,
 * rendering structured messages instead of terminal output.
 */
import { useRef, useEffect, useCallback, memo } from 'react'
import { useAgentChatStore } from '../../store/agentChat'
import { useSessionStore } from '../../store/sessions'
import { AgentChatMessage, ToolGroupBlock } from './AgentChatMessage'
import type { AgentSdkMessage } from '../../../shared/agentSdkTypes'
import { AgentChatInput } from './AgentChatInput'
import { PermissionRequest } from './AgentPermissionRequest'

import { useAgentSdk } from './hooks/useAgentSdk'

interface AgentChatProps {
  sessionId: string
  cwd: string
  sdkSessionId?: string
  skipApproval: boolean
  env?: Record<string, string>
  isRestored?: boolean
}

function AgentChatInner({ sessionId, cwd, sdkSessionId, skipApproval, env }: AgentChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Track whether to auto-scroll. We check the position BEFORE new content
  // renders, not after — otherwise scrollIntoView triggers onScroll which
  // sets it back to true, defeating the purpose.
  const shouldAutoScrollRef = useRef(true)
  const prevMessageCountRef = useRef(0)

  const chatSession = useAgentChatStore((s) => s.getSession(sessionId))
  const { messages, state, pendingPermission } = chatSession
  const hasSdkSession = useSessionStore((s) => {
    const sess = s.sessions.find(ss => ss.id === sessionId)
    return !!(sess?.sdkSessionId && sess.sdkSessionId.length > 0)
  }) || !!(sdkSessionId && sdkSessionId.length > 0)

  const selectFile = useSessionStore((s) => s.selectFile)
  const handleOpenFile = useCallback((filePath: string) => {
    selectFile(sessionId, filePath)
  }, [sessionId, selectFile])

  const { sendPrompt, stopAgent, respondToPermission, availableCommands, historyMeta, loadFullHistory } = useAgentSdk({
    sessionId,
    cwd,
    sdkSessionId,
    skipApproval,
    env,
  })

  // Before new messages render, snapshot whether we're at the bottom
  const messageCount = messages.length
  if (messageCount !== prevMessageCountRef.current) {
    const el = scrollContainerRef.current
    if (el) {
      shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    prevMessageCountRef.current = messageCount
  }

  // After render, scroll if we were at bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView()
    }
  }, [messageCount])

  // Capture plan file path when ExitPlanMode is detected
  useEffect(() => {
    if (messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.type === 'tool_use' && lastMsg.toolName === 'ExitPlanMode') {
      const input = lastMsg.toolInput
      if (input && typeof input.planFilePath === 'string') {
        useSessionStore.getState().setPlanFile(sessionId, input.planFilePath)
      }
    }
  }, [messageCount, sessionId])

  // Classify user vs assistant messages for styling
  // User messages are text messages that appear right before a system or assistant message
  const isUserMessage = useCallback((index: number) => {
    const id = messages[index]?.id ?? ''
    return id.startsWith('user-') || id.startsWith('history-user-')
  }, [messages])

  const isRunning = state === 'running' || state === 'awaiting_permission'

  return (
    <div className="flex h-full flex-col bg-[#1a1a1a]">
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && !isRunning && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-neutral-500">
              <p className="text-sm">
                {hasSdkSession
                  ? 'Previous session will be resumed. Send a message to continue.'
                  : 'Send a message to start working with Claude.'}
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                Enter to send, Shift+Enter for newline
              </p>
            </div>
          </div>
        )}

        {/* Load earlier messages button */}
        {historyMeta && (
          <button
            onClick={loadFullHistory}
            className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800/50 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-300"
          >
            Load {historyMeta.total - historyMeta.loaded} earlier messages
          </button>
        )}

        {(() => {
          // Tools that should always stand alone (not grouped)
          const STANDALONE = new Set(['ExitPlanMode', 'EnterPlanMode', 'AskUserQuestion', 'TodoWrite'])
          const EDITS = new Set(['Edit', 'FileEdit', 'Write', 'FileWrite'])

          const elements: React.ReactNode[] = []
          let i = 0
          while (i < messages.length) {
            const msg = messages[i]

            // Skip tool_result — rendered inside tool_use blocks
            if (msg.type === 'tool_result') { i++; continue }

            const canGroup = (n: string) => !STANDALONE.has(n) && !EDITS.has(n)
            const isGroupable = msg.type === 'tool_use' && canGroup(msg.toolName ?? '')

            if (isGroupable) {
              const group = []
              while (i < messages.length) {
                const m = messages[i]
                if (m.type === 'tool_result') { i++; continue }
                if (m.type === 'tool_use' && canGroup(m.toolName ?? '')) {
                  const result = m.toolUseId
                    ? messages.find(r => r.type === 'tool_result' && r.toolUseId === m.toolUseId)
                    : undefined
                  group.push({ msg: m, toolResult: result })
                  i++
                } else {
                  break
                }
              }
              if (group.length > 1) {
                elements.push(
                  <ToolGroupBlock key={group[0].msg.id} items={group} />
                )
              } else {
                elements.push(
                  <AgentChatMessage
                    key={group[0].msg.id} msg={group[0].msg}
                    toolResult={group[0].toolResult}
                    cwd={cwd} onOpenFile={handleOpenFile}
                  />
                )
              }
              continue
            }

            // Regular message (text, system, result, edit tools, standalone tools)
            const toolResult = msg.type === 'tool_use' && msg.toolUseId
              ? messages.find(m => m.type === 'tool_result' && m.toolUseId === msg.toolUseId)
              : undefined
            elements.push(
              <AgentChatMessage
                key={msg.id} msg={msg}
                isUserMessage={isUserMessage(i)} toolResult={toolResult}
                cwd={cwd} onOpenFile={handleOpenFile}
              />
            )
            i++
          }

          // Find the last ExitPlanMode and add approve action to it
          // (only if the agent isn't currently running)
          if (state !== 'running') {
            for (let j = elements.length - 1; j >= 0; j--) {
              const el = elements[j]
              if (el && typeof el === 'object' && 'props' in el) {
                const props = (el as React.ReactElement).props as Record<string, unknown>
                const elMsg = props.msg as AgentSdkMessage | undefined
                if (elMsg?.type === 'tool_use' && elMsg.toolName === 'ExitPlanMode') {
                  elements[j] = (
                    <AgentChatMessage
                      key={elMsg.id} msg={elMsg}
                      toolResult={props.toolResult as AgentSdkMessage | undefined}
                      isLast
                      onApprovePlan={() => sendPrompt('Approved. Proceed with implementation.')}
                      cwd={cwd} onOpenFile={handleOpenFile}
                    />
                  )
                  break
                }
                // Stop looking if we hit a user message (plan was already responded to)
                if (elMsg && isUserMessage(messages.indexOf(elMsg))) break
              }
            }
          }

          return elements
        })()}

        {/* Loading indicator */}
        {state === 'running' && (
          <div className="my-2 flex items-center gap-2 text-xs text-neutral-400">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            Working...
          </div>
        )}

        {/* Permission / interaction request */}
        {pendingPermission && (
          <PermissionRequest
            permission={pendingPermission}
            onRespond={respondToPermission}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <AgentChatInput
        onSubmit={sendPrompt}
        onStop={stopAgent}
        isRunning={state === 'running'}
        disabled={state === 'awaiting_permission'}
        sessionId={sessionId}
        availableCommands={availableCommands}
      />
    </div>
  )
}

export const AgentChat = memo(AgentChatInner)
