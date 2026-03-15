/**
 * Inline find bar for file viewer panels.
 * Shows a text input with match count, prev/next navigation, and close button.
 */

interface FindBarProps {
  inputRef?: React.Ref<HTMLInputElement>
  query: string
  onQueryChange: (query: string) => void
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
  matchInfo?: { active: number; total: number } | null
}

export default function FindBar({ inputRef, query, onQueryChange, onNext, onPrevious, onClose, matchInfo }: FindBarProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-bg-secondary border-b border-border flex-shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose()
          } else if (e.key === 'Enter') {
            if (e.shiftKey) { onPrevious() } else { onNext() }
          }
        }}
        placeholder="Find in page..."
        className="flex-1 px-2 py-0.5 text-xs rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
        autoFocus
      />
      {matchInfo && (
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {matchInfo.total > 0 ? `${matchInfo.active}/${matchInfo.total}` : 'No results'}
        </span>
      )}
      <button
        onClick={onPrevious}
        disabled={!query}
        className="p-0.5 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
        title="Previous match (Shift+Enter)"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button
        onClick={onNext}
        disabled={!query}
        className="p-0.5 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
        title="Next match (Enter)"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <button
        onClick={onClose}
        className="p-0.5 rounded text-text-secondary hover:text-text-primary transition-colors"
        title="Close (Esc)"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
