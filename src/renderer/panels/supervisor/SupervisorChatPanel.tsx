/**
 * Supervisor Chat Panel: global panel for talking to the supervisor brain.
 * Shows task tree, message thread, and action cards.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useGatewayStore } from '../../store/gateway'
import {
  useSupervisorChatStore,
  type SupervisorMessage,
  type TaskProgress,
  type BrainAction,
} from '../../store/supervisorChat'
import { createMarkdownComponents } from '../../shared/utils/markdownComponents'
import { randomUUID } from '../../shared/utils/ids'

const markdownComponents = createMarkdownComponents('compact')

// ─── Task Tree ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  assigned: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-accent/20 text-accent',
  done: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  blocked: 'bg-gray-500/20 text-gray-400',
}

function TaskBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] ?? 'bg-gray-500/20 text-gray-400'}`}>
      {status}
    </span>
  )
}

function TaskTree({ tasks }: { tasks: TaskProgress[] }) {
  const [expanded, setExpanded] = useState(true)
  const rootTasks = useMemo(
    () => tasks.filter((t) => !t.parentTaskId),
    [tasks],
  )

  if (tasks.length === 0) return null

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-text-secondary hover:bg-bg-secondary/50"
      >
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z" />
            <path d="M6 9.01V9" />
          </svg>
          Tasks ({tasks.length})
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {rootTasks.map((task) => (
            <TaskItem key={task.id} task={task} allTasks={tasks} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskItem({ task, allTasks, depth }: { task: TaskProgress; allTasks: TaskProgress[]; depth: number }) {
  const subtasks = useMemo(
    () => allTasks.filter((t) => t.parentTaskId === task.id),
    [allTasks, task.id],
  )

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div className="flex items-center gap-2 py-0.5">
        <TaskBadge status={task.status} />
        <span className="text-xs text-text-primary truncate flex-1">{task.description}</span>
      </div>
      {subtasks.map((sub) => (
        <TaskItem key={sub.id} task={sub} allTasks={allTasks} depth={depth + 1} />
      ))}
    </div>
  )
}

// ─── Action Card ────────────────────────────────────────────────

function ActionCard({ action }: { action: BrainAction }) {
  const actionLabels: Record<string, string> = {
    delegate: 'Delegated',
    brief: 'Briefed',
    create_task: 'Created task',
    monitor: 'Monitoring',
    report: 'Report',
    ask_user: 'Question',
    auto_approve: 'Auto-approved',
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-accent/10 text-accent text-[11px]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <span className="font-medium">{actionLabels[action.type] ?? action.type}</span>
      {action.sessionId && <span className="text-text-secondary">→ {action.sessionId.substring(0, 8)}</span>}
      {action.text && <span className="text-text-secondary truncate max-w-[150px]">{action.text}</span>}
    </div>
  )
}

// ─── Message Bubble ─────────────────────────────────────────────

function MessageBubble({ msg }: { msg: SupervisorMessage }) {
  const [showThinking, setShowThinking] = useState(false)
  const isUser = msg.type === 'user'
  const isAction = msg.type === 'action'

  if (isAction) {
    return (
      <div className="flex justify-center mb-2">
        <div className="text-[11px] text-text-secondary/60 italic px-3 py-1">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? '' : ''}`}>
        {/* Thinking disclosure */}
        {msg.thinking && !isUser && (
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="text-[10px] text-text-secondary/50 hover:text-text-secondary mb-1 flex items-center gap-1"
          >
            <svg
              width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${showThinking ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            thinking
          </button>
        )}
        {showThinking && msg.thinking && (
          <div className="text-[11px] text-text-secondary/50 bg-bg-tertiary/50 rounded px-2 py-1.5 mb-1 italic">
            {msg.thinking}
          </div>
        )}

        {/* Message content */}
        <div
          className={`px-3 py-2 rounded-lg text-sm ${
            isUser
              ? 'bg-accent text-white rounded-br-none'
              : msg.type === 'system'
                ? 'bg-bg-tertiary/50 text-text-secondary border border-border/50'
                : 'bg-bg-secondary text-text-primary rounded-bl-none'
          }`}
        >
          <div className="prose prose-invert prose-sm max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {msg.content}
            </ReactMarkdown>
          </div>
          <div className={`text-[10px] mt-1 ${isUser ? 'text-white/50' : 'text-text-secondary/40'}`}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Action cards */}
        {msg.actions && msg.actions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {msg.actions.map((action, i) => (
              <ActionCard key={i} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Thinking Indicator ─────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-bg-secondary rounded-lg px-3 py-2 rounded-bl-none">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────────────

export default function SupervisorChatPanel() {
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messages = useSupervisorChatStore((s) => s.messages)
  const tasks = useSupervisorChatStore((s) => s.tasks)
  const isThinking = useSupervisorChatStore((s) => s.isThinking)
  const addMessage = useSupervisorChatStore((s) => s.addMessage)
  const setTasks = useSupervisorChatStore((s) => s.setTasks)
  const setThinking = useSupervisorChatStore((s) => s.setThinking)
  const gatewayOn = useGatewayStore((s) => s.on)
  const gatewaySend = useGatewayStore((s) => s.send)

  // Subscribe to gateway events
  useEffect(() => {
    const unsubChat = gatewayOn('supervisorChat', (frame) => {
      const payload = frame.payload
      if (!payload) return
      addMessage({
        id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: (payload.type as SupervisorMessage['type']) ?? 'system',
        content: (payload.content as string) ?? '',
        timestamp: (payload.timestamp as number) ?? Date.now(),
        actions: payload.actions as BrainAction[] | undefined,
        thinking: payload.thinking as string | undefined,
      })
    })

    const unsubTasks = gatewayOn('taskUpdate', (frame) => {
      const payload = frame.payload
      if (payload?.tasks) {
        setTasks(payload.tasks as TaskProgress[])
      }
    })

    return () => {
      unsubChat()
      unsubTasks()
    }
  }, [gatewayOn, addMessage, setTasks])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isThinking])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text) return

    // Add user message locally
    addMessage({
      id: randomUUID(),
      type: 'user',
      content: text,
      timestamp: Date.now(),
    })

    // Show thinking
    setThinking(true)

    // Send via gateway
    gatewaySend({
      id: randomUUID(),
      method: 'supervisorSend',
      payload: { text },
    })

    setInputText('')
  }, [inputText, addMessage, setThinking, gatewaySend])

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
            <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20h6v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8Z" />
            <path d="M10 20v2h4v-2" />
            <path d="M9 10h.01" />
            <path d="M15 10h.01" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">Supervisor</h3>
          <span className="text-[10px] text-text-secondary">AI Orchestrator</span>
        </div>
      </div>

      {/* Task tree */}
      <TaskTree tasks={tasks} />

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20h6v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8Z" />
                <path d="M10 20v2h4v-2" />
              </svg>
            </div>
            <p className="text-sm text-text-secondary mb-1">Talk to the Supervisor</p>
            <p className="text-xs text-text-secondary/60">
              Describe tasks, and the supervisor will break them down, delegate to agents, and coordinate their work.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isThinking && <ThinkingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-border">
        <div className="flex items-center gap-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Tell the supervisor what to do..."
            rows={1}
            className="flex-1 bg-bg-secondary text-text-primary text-sm rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-purple-500/50 placeholder-text-secondary/50 border border-border"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isThinking}
            className="px-3 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-500/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
