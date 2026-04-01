/**
 * Decision card: Yes/No/Auto buttons for HITL decisions.
 * Shows resolved state after user responds.
 */
import { useCallback } from 'react'
import { useGatewayStore } from '../store/gateway'
import { useChatStore, type ChatMessage } from '../store/chat'
import { randomUUID } from '../shared/utils/ids'

export function DecisionCard({ message }: { message: ChatMessage }) {
  const send = useGatewayStore((s) => s.send)
  const addMessage = useChatStore((s) => s.addMessage)

  const decisionId = message.data?.decisionId as string | undefined
  const severity = message.data?.severity as string | undefined
  const resolved = message.data?.resolved as boolean | undefined
  const resolution = message.data?.resolution as string | undefined

  const handleResolve = useCallback(
    (answer: string) => {
      if (!decisionId) return
      send({
        id: randomUUID(),
        method: 'resolve',
        sessionId: message.sessionId,
        payload: { decisionId, resolution: answer },
      })

      // Update local chat with resolution
      addMessage({
        id: randomUUID(),
        sessionId: message.sessionId,
        type: 'system',
        timestamp: Date.now(),
        text: `Decision resolved: ${answer}`,
        data: { decisionId, resolution: answer },
      })
    },
    [decisionId, message.sessionId, send, addMessage],
  )

  const isHard = severity === 'hard'

  return (
    <div className="mb-2">
      <div
        className={`rounded-lg border px-3 py-2 ${
          isHard
            ? 'border-red-500/40 bg-red-900/10'
            : 'border-yellow-500/40 bg-yellow-900/10'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
              isHard ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {isHard ? 'HARD' : 'SOFT'}
          </span>
          {message.data?.toolName && (
            <span className="text-xs text-text-secondary font-mono">
              {String(message.data.toolName)}
            </span>
          )}
        </div>

        <p className="text-sm text-text-primary mb-2">{message.text}</p>

        {resolved ? (
          <div className="text-xs text-text-secondary italic">
            Resolved: <span className="font-medium text-accent">{resolution}</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => handleResolve('yes')}
              className="px-3 py-1 text-xs rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => handleResolve('no')}
              className="px-3 py-1 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            >
              No
            </button>
            <button
              onClick={() => handleResolve('auto')}
              className="px-3 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
            >
              Auto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
