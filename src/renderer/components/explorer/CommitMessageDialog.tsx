/**
 * Simple modal dialog for entering a commit message for manual (non-AI) commits.
 */
import { useState, useRef, useEffect } from 'react'

interface CommitMessageDialogProps {
  onCommit: (message: string) => void
  onClose: () => void
}

export function CommitMessageDialog({ onCommit, onClose }: CommitMessageDialogProps) {
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const trimmed = message.trim()
    if (trimmed) {
      onCommit(trimmed)
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-md mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-text-primary mb-2">Commit Message</h3>
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter commit message..."
          className="w-full px-2 py-1.5 text-sm rounded bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:border-accent"
          rows={3}
        />
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!message.trim()}
            className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  )
}
