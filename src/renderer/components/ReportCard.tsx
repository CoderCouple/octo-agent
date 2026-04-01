/**
 * Report card: displays markdown report in chat.
 */
import type { ChatMessage } from '../store/chat'

export function ReportCard({ message }: { message: ChatMessage }) {
  return (
    <div className="mb-2">
      <div className="rounded-lg border border-purple-500/30 bg-purple-900/10 px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            REPORT
          </span>
          <span className="text-xs text-text-secondary">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="text-sm text-text-primary whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    </div>
  )
}
