/**
 * Attention queue: 5-item sidebar widget showing items needing user attention.
 */
import { useQueueStore } from '../store/queue'

const PRIORITY_COLORS = {
  high: 'border-l-red-500 bg-red-900/10',
  medium: 'border-l-yellow-500 bg-yellow-900/10',
  low: 'border-l-blue-500 bg-blue-900/10',
} as const

export function AttentionQueue() {
  const items = useQueueStore((s) => s.items.slice(0, 5))
  const dismiss = useQueueStore((s) => s.dismiss)

  if (items.length === 0) return null

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Attention
        </span>
        <span className="text-[10px] text-text-secondary bg-bg-tertiary px-1.5 py-0.5 rounded">
          {items.length}
        </span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={`border-l-2 rounded-r px-2 py-1.5 ${PRIORITY_COLORS[item.priority]}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-primary truncate flex-1">
                {item.title}
              </span>
              <button
                onClick={() => dismiss(item.id)}
                className="text-text-secondary hover:text-text-primary ml-1 flex-shrink-0"
                title="Dismiss"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-text-secondary truncate">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
