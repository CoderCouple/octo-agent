/**
 * WhatsApp-style chat panel: message thread, input, auto-scroll.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore, type ChatMessage } from '../store/chat'
import { useGatewayStore } from '../store/gateway'
import { DecisionCard } from './DecisionCard'
import { ReportCard } from './ReportCard'
import { randomUUID } from '../shared/utils/ids'

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.type === 'decision') {
    return <DecisionCard message={msg} />
  }
  if (msg.type === 'report') {
    return <ReportCard message={msg} />
  }

  const isUser = msg.type === 'user'
  const isSystem = msg.type === 'system' || msg.type === 'memory'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
          isUser
            ? 'bg-accent text-white rounded-br-none'
            : isSystem
              ? 'bg-bg-tertiary text-text-secondary italic text-xs'
              : 'bg-bg-tertiary text-text-primary rounded-bl-none'
        }`}
      >
        {msg.type === 'agent' && msg.data?.eventType && (
          <span className="text-xs text-text-secondary block mb-1">
            {String(msg.data.eventType)}
          </span>
        )}
        <span className="whitespace-pre-wrap break-words">{msg.text}</span>
        <div className="text-[10px] text-text-secondary/60 mt-1">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const messages = useChatStore((s) => s.messages[sessionId] || [])
  const addMessage = useChatStore((s) => s.addMessage)
  const send = useGatewayStore((s) => s.send)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return

    // Add to local chat
    addMessage({
      id: randomUUID(),
      sessionId,
      type: 'user',
      timestamp: Date.now(),
      text,
    })

    // Send via gateway
    send({
      id: randomUUID(),
      method: 'send',
      sessionId,
      payload: { text },
    })

    setInput('')
  }, [input, sessionId, addMessage, send])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Chat</span>
        <span className="text-xs text-text-secondary">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Agent events will appear here
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message agent..."
            rows={1}
            className="flex-1 bg-bg-tertiary text-text-primary text-sm rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-accent placeholder-text-secondary"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-3 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
