/**
 * Group session chat view: shows interleaved messages from all member sessions
 * with character avatars, and provides input to broadcast to all members.
 *
 * SDK agent responses arrive via IPC (agentSdk:message:<memberId>), not via
 * the gateway WebSocket. This component subscribes to each member's SDK
 * messages and bridges them into useChatStore so they appear in the chat.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useSessionStore, type Session } from '../../store/sessions'
import { useChatStore, type ChatMessage } from '../../store/chat'
import { useGatewayStore } from '../../store/gateway'
import { useAgentStore } from '../../store/agents'
import { getCharacterById } from '../../data/narutoCharacters'
import { randomUUID } from '../../shared/utils/ids'

interface GroupChatViewProps {
  session: Session
}

export default function GroupChatView({ session }: GroupChatViewProps) {
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const send = useGatewayStore((s) => s.send)
  const agents = useAgentStore((s) => s.agents)

  const memberSessionIds = session.memberSessionIds || []
  const sessions = useSessionStore((s) => s.sessions)
  const memberSessions = useMemo(
    () => sessions.filter((s) => memberSessionIds.includes(s.id)),
    [sessions, memberSessionIds],
  )

  // Subscribe to SDK agent messages for each member session and bridge into chat store.
  // This is the critical piece: SDK responses go via IPC, not gateway WS, so we must
  // explicitly listen and forward them.
  useEffect(() => {
    if (memberSessionIds.length === 0) return

    const cleanups: (() => void)[] = []

    for (const memberId of memberSessionIds) {
      // Listen for SDK text/result messages from each member agent
      const unsub = window.agentSdk.onMessage(memberId, (sdkMsg) => {
        // Only bridge text responses (not tool_use, tool_result, system, etc.)
        if (sdkMsg.type === 'text' && sdkMsg.text) {
          console.log(`[GroupChat] SDK response from ${memberId}: "${sdkMsg.text.substring(0, 80)}"`)
          useChatStore.getState().addMessage({
            id: randomUUID(),
            sessionId: memberId,
            type: 'agent',
            timestamp: sdkMsg.timestamp ?? Date.now(),
            text: sdkMsg.text,
          })
        } else if (sdkMsg.type === 'result') {
          console.log(`[GroupChat] SDK turn complete for ${memberId}`)
        }
      })
      cleanups.push(unsub)

      // Listen for errors
      const unsubErr = window.agentSdk.onError(memberId, (error) => {
        console.error(`[GroupChat] SDK error from ${memberId}:`, error)
        useChatStore.getState().addMessage({
          id: randomUUID(),
          sessionId: memberId,
          type: 'system',
          timestamp: Date.now(),
          text: `Agent error: ${error}`,
        })
      })
      cleanups.push(unsubErr)
    }

    console.log(`[GroupChat] Subscribed to SDK messages for ${memberSessionIds.length} members:`, memberSessionIds)

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [memberSessionIds]) // eslint-disable-line react-hooks/exhaustive-deps -- memberSessionIds identity changes rarely

  // Collect messages from all member sessions
  const allMessages = useChatStore((s) => s.messages)
  const mergedMessages = useMemo(() => {
    const msgs: (ChatMessage & { memberSession?: Session })[] = []
    for (const memberId of memberSessionIds) {
      const sessionMsgs = allMessages[memberId] || []
      const memberSession = memberSessions.find((s) => s.id === memberId)
      for (const msg of sessionMsgs) {
        msgs.push({ ...msg, memberSession })
      }
    }
    // Also include messages addressed to the group session itself (e.g. peer messages)
    const groupMsgs = allMessages[session.id] || []
    for (const msg of groupMsgs) {
      msgs.push({ ...msg })
    }
    // Sort by timestamp
    msgs.sort((a, b) => a.timestamp - b.timestamp)
    return msgs
  }, [allMessages, memberSessionIds, memberSessions, session.id])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mergedMessages.length])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text) return

    console.log(`[GroupChat] Sending to ${memberSessions.length} members:`, memberSessionIds)

    // Notify supervisor for logging/transcript
    send({
      id: randomUUID(),
      method: 'send',
      sessionId: session.id,
      payload: { text, memberSessionIds },
    })

    // Directly deliver to each member agent via their connection mode
    for (const member of memberSessions) {
      if (!member.agentId) {
        console.warn(`[GroupChat] Member ${member.id} (${member.name}) has no agentId, skipping`)
        continue
      }
      const agent = agents.find((a) => a.id === member.agentId)
      if (!agent) {
        console.warn(`[GroupChat] Agent ${member.agentId} not found for member ${member.name}`)
        continue
      }

      console.log(`[GroupChat] Delivering to ${member.name} (${member.id}), mode=${agent.connectionMode}, dir=${member.directory}`)

      if (agent.connectionMode === 'api') {
        // API mode: send via Agent SDK (auto-starts session if needed)
        void window.agentSdk.send(member.id, text, {
          sdkSessionId: member.sdkSessionId,
          cwd: member.directory,
          env: agent.env,
          model: agent.model,
          effort: agent.effort,
        })
      } else if (member.agentPtyId) {
        // Terminal mode: write to PTY
        void window.pty.write(member.agentPtyId, `${text}\r`)
      } else {
        console.warn(`[GroupChat] Member ${member.name} has no PTY ID (terminal mode without PTY)`)
      }
    }

    // Add as a user message in the group chat
    useChatStore.getState().addMessage({
      id: randomUUID(),
      sessionId: session.id,
      type: 'user',
      timestamp: Date.now(),
      text,
    })

    setInputText('')
  }, [inputText, memberSessionIds, memberSessions, session.id, agents, send])

  const handleBriefAll = useCallback(() => {
    // Brief each member about what others are doing
    for (const memberId of memberSessionIds) {
      const otherIds = memberSessionIds.filter((id) => id !== memberId)
      if (otherIds.length > 0) {
        send({
          id: randomUUID(),
          method: 'brief',
          sessionId: memberId,
          payload: { sourceSessionIds: otherIds },
        })
      }
    }
  }, [memberSessionIds, send])

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {/* Stacked avatars */}
          <div className="flex -space-x-2">
            {memberSessions.slice(0, 4).map((ms, i) => {
              const char = ms.characterId ? getCharacterById(ms.characterId) : undefined
              return (
                <div
                  key={ms.id}
                  className="w-7 h-7 rounded-full border-2 border-bg-primary flex items-center justify-center"
                  style={{ backgroundColor: char?.color ?? '#666', zIndex: 4 - i }}
                  title={char?.shortName ?? ms.name}
                >
                  <span className="text-[10px] font-bold text-white">{char?.initials ?? '?'}</span>
                </div>
              )
            })}
            {memberSessions.length > 4 && (
              <div
                className="w-7 h-7 rounded-full border-2 border-bg-primary bg-bg-tertiary flex items-center justify-center"
                style={{ zIndex: 0 }}
              >
                <span className="text-[10px] font-medium text-text-secondary">
                  +{memberSessions.length - 4}
                </span>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{session.name}</h2>
            <span className="text-xs text-text-secondary">{memberSessions.length} agents</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleBriefAll}
            className="px-3 py-1.5 text-xs font-medium rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            Brief All
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {mergedMessages.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-12">
            No messages yet. Agents in this group can communicate with each other
            using their peer tools, and messages will appear here.
          </div>
        )}
        {mergedMessages.map((msg) => {
          const memberSession = msg.memberSession
          const char = memberSession?.characterId
            ? getCharacterById(memberSession.characterId)
            : undefined
          const isUser = msg.type === 'user'

          return (
            <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              {!isUser && (
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: char?.color ?? '#666' }}
                  title={char?.shortName ?? memberSession?.name ?? 'Unknown'}
                >
                  <span className="text-[10px] font-bold text-white">
                    {char?.initials ?? '?'}
                  </span>
                </div>
              )}
              {/* Message bubble */}
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 ${
                  isUser
                    ? 'bg-accent text-white'
                    : 'bg-bg-secondary text-text-primary'
                }`}
              >
                {!isUser && char && (
                  <div className="text-[10px] font-medium mb-0.5 opacity-70">
                    {char.shortName}
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap break-words">{msg.text}</div>
                <div className={`text-[10px] mt-1 ${isUser ? 'text-white/60' : 'text-text-secondary/60'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Send a message to all agents..."
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg-secondary border border-border text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent/50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
