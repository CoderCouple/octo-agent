/**
 * Prompt input for the Agent SDK chat view with slash command autocomplete.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

// Commands we handle ourselves (not in the SDK)
const LOCAL_COMMANDS = [
  { name: 'login', description: 'Log in to Claude (opens browser)' },
  { name: 'status', description: 'Show session status and account info' },
]

interface CommandInfo {
  name: string
  description: string
}

interface AgentChatInputProps {
  onSubmit: (prompt: string) => void
  onQueue: (prompt: string) => void
  onStop: () => void
  isRunning: boolean
  disabled?: boolean
  sessionId: string
  availableCommands?: CommandInfo[]
}

export function AgentChatInput({ onSubmit, onQueue, onStop, isRunning, disabled, sessionId, availableCommands }: AgentChatInputProps) {
  const [value, setValue] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus on mount and session changes
  useEffect(() => {
    if (!isRunning && !disabled) {
      textareaRef.current?.focus()
    }
  }, [sessionId, isRunning, disabled])

  // Merge local + SDK commands, deduplicate by name
  const allCommands = useMemo(() => {
    const seen = new Set<string>()
    const result: CommandInfo[] = []
    for (const c of availableCommands ?? []) {
      if (!seen.has(c.name)) { seen.add(c.name); result.push(c) }
    }
    for (const c of LOCAL_COMMANDS) {
      if (!seen.has(c.name)) { seen.add(c.name); result.push(c) }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [availableCommands])

  // Autocomplete: show when typing "/" at the start
  const showAutocomplete = value.startsWith('/') && !value.includes(' ') && value.length > 0
  const filterText = value.slice(1).toLowerCase()
  const filteredCommands = showAutocomplete
    ? allCommands.filter(c => c.name.toLowerCase().startsWith(filterText))
    : []

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filterText])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    if (isRunning) {
      onQueue(trimmed)
      setValue('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }
    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, isRunning, disabled, onSubmit, onQueue])

  const selectCommand = useCallback((name: string) => {
    const cmd = `/${name}`
    onSubmit(cmd)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        selectCommand(filteredCommands[selectedIndex].name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setValue('')
        return
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit, showAutocomplete, filteredCommands, selectedIndex, selectCommand])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  return (
    <div className="border-t border-neutral-700 bg-neutral-900 px-3 py-2">
      {/* Autocomplete dropdown */}
      {showAutocomplete && filteredCommands.length > 0 && (
        <div className="mb-1 max-h-48 overflow-y-auto rounded border border-neutral-600 bg-neutral-800">
          {filteredCommands.map((cmd, i) => (
            <button
              key={`${cmd.name}-${String(i)}`}
              className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs ${
                i === selectedIndex ? 'bg-blue-600/30 text-neutral-100' : 'text-neutral-300 hover:bg-neutral-700/50'
              }`}
              onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd.name) }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="font-mono font-medium text-blue-300">/{cmd.name}</span>
              <span className="truncate text-neutral-500">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? 'Agent is working... (type your next message)' : 'Message or /command'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        {isRunning ? (
          <button
            onClick={onStop}
            className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
