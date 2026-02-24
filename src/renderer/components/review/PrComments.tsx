import { useState, useRef, useEffect } from 'react'
import type { CodeLocation } from '../../types/review'
import type { NormalizedComment } from './useReviewData'
import type { GitHubReaction } from '../../../preload/apis/types'
import { CollapsibleSection } from './CollapsibleSection'

const REACTION_EMOJI: Record<string, string> = {
  '+1': '\u{1F44D}',
  '-1': '\u{1F44E}',
  laugh: '\u{1F604}',
  hooray: '\u{1F389}',
  confused: '\u{1F615}',
  heart: '\u{2764}\u{FE0F}',
  rocket: '\u{1F680}',
  eyes: '\u{1F440}',
}

const REACTION_OPTIONS = Object.entries(REACTION_EMOJI)

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

function ReactionBadges({
  reactions,
  commentId,
  commentType,
  repoDir,
  onReacted,
}: {
  reactions?: GitHubReaction[]
  commentId: number
  commentType: 'review' | 'issue'
  repoDir: string
  onReacted: () => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [adding, setAdding] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const handleReaction = async (content: string) => {
    setAdding(true)
    setShowPicker(false)
    await window.gh.addReaction(repoDir, commentId, content, commentType)
    setAdding(false)
    onReacted()
  }

  const activeReactions = reactions?.filter(r => r.count > 0) ?? []

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {activeReactions.map(r => (
        <span
          key={r.content}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-bg-tertiary text-xs text-text-secondary"
        >
          {REACTION_EMOJI[r.content] || r.content} {r.count}
        </span>
      ))}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(!showPicker)}
          disabled={adding}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors text-xs"
          title="Add reaction"
        >
          +
        </button>
        {showPicker && (
          <div className="absolute bottom-6 left-0 z-50 bg-bg-secondary border border-border rounded-lg shadow-lg p-1.5 flex gap-1">
            {REACTION_OPTIONS.map(([key, emoji]) => (
              <button
                key={key}
                onClick={() => void handleReaction(key)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg-tertiary transition-colors text-sm"
                title={key}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CommentReplyBox({
  repoDir,
  prNumber,
  commentId,
  onReplied,
}: {
  repoDir: string
  prNumber: number
  commentId: number
  onReplied: () => void
}) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    const result = await window.gh.replyToComment(repoDir, prNumber, commentId, body.trim())
    setSubmitting(false)
    if (result.success) {
      setBody('')
      onReplied()
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply..."
        className="w-full bg-bg-primary border border-border rounded p-2 text-sm text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:border-accent"
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            void handleSubmit()
          }
        }}
      />
      <div className="flex items-center gap-2 justify-end">
        <span className="text-[10px] text-text-secondary">{'\u2318'}+Enter to submit</span>
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || !body.trim()}
          className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Sending...' : 'Reply'}
        </button>
      </div>
    </div>
  )
}

function CommentThread({
  comment,
  threadReplies,
  isExpanded,
  replyingTo,
  onToggle,
  onClickLocation,
  onSetReplyingTo,
  repoDir,
  prNumber,
  onRefreshComments,
}: {
  comment: NormalizedComment
  threadReplies?: NormalizedComment[]
  isExpanded: boolean
  replyingTo: number | null
  onToggle: () => void
  onClickLocation: (location: CodeLocation) => void
  onSetReplyingTo: (id: number | null) => void
  repoDir: string
  prNumber: number
  onRefreshComments: () => void
}) {
  const filePart = comment.path?.split('/').pop()
  const lineSuffix = comment.line ? `:${comment.line}` : ''

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left rounded border border-border bg-bg-primary p-2 hover:border-border/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-text-secondary transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="text-xs font-medium text-text-primary">{comment.author}</span>
          <span className="text-[10px] text-text-secondary">{formatRelativeTime(comment.createdAt)}</span>
          {comment.type === 'review' && comment.line === null && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">outdated</span>
          )}
          {threadReplies && threadReplies.length > 0 && (
            <span className="text-[10px] text-text-secondary">
              {threadReplies.length} {threadReplies.length === 1 ? 'reply' : 'replies'}
            </span>
          )}
          {comment.type === 'review' && comment.path && (
            <span
              onClick={(e) => {
                e.stopPropagation()
                onClickLocation({ file: comment.path!, startLine: comment.line || 1 })
              }}
              className="text-[10px] text-accent hover:text-accent/80 font-mono truncate transition-colors ml-auto cursor-pointer"
            >
              {`${filePart}${lineSuffix}`}
            </span>
          )}
        </div>
        {!isExpanded && (
          <div className="text-xs text-text-secondary mt-1 ml-5 truncate">
            {truncateBody(comment.body)}
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="ml-3 border-l-2 border-border pl-2 mt-1">
          <div className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{comment.body}</div>
          <ReactionBadges
            reactions={comment.reactions}
            commentId={comment.id}
            commentType={comment.type}
            repoDir={repoDir}
            onReacted={onRefreshComments}
          />

          {threadReplies?.map(reply => (
            <div key={reply.id} className="mt-2 rounded border border-border/50 bg-bg-primary/50 p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-text-primary">{reply.author}</span>
                <span className="text-[10px] text-text-secondary">{formatRelativeTime(reply.createdAt)}</span>
              </div>
              <div className="text-sm text-text-primary whitespace-pre-wrap">{reply.body}</div>
              <ReactionBadges
                reactions={reply.reactions}
                commentId={reply.id}
                commentType="review"
                repoDir={repoDir}
                onReacted={onRefreshComments}
              />
            </div>
          ))}

          {comment.type === 'review' && (
            <>
              {replyingTo === comment.id ? (
                <CommentReplyBox
                  repoDir={repoDir}
                  prNumber={prNumber}
                  commentId={comment.id}
                  onReplied={() => {
                    onSetReplyingTo(null)
                    onRefreshComments()
                  }}
                />
              ) : (
                <button
                  onClick={() => onSetReplyingTo(comment.id)}
                  className="mt-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  Reply
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function truncateBody(text: string, max = 80) {
  const firstLine = text.split('\n')[0]
  return firstLine.length > max ? `${firstLine.slice(0, max)}...` : firstLine
}

export function PrCommentsSection({
  prGitHubComments,
  prCommentsLoading,
  prCommentsHasMore,
  onLoadOlderComments,
  onClickLocation,
  repoDir,
  prNumber,
  onRefreshComments,
}: {
  prGitHubComments: NormalizedComment[]
  prCommentsLoading: boolean
  prCommentsHasMore: boolean
  onLoadOlderComments: () => void
  onClickLocation: (location: CodeLocation) => void
  repoDir: string
  prNumber: number
  onRefreshComments: () => void
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [replyingTo, setReplyingTo] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'active'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

  const topLevel = prGitHubComments.filter(c => c.type === 'issue' || !c.inReplyToId)
  const replies = prGitHubComments.filter(c => c.type === 'review' && c.inReplyToId)
  const replyMap = new Map<number, NormalizedComment[]>()
  for (const reply of replies) {
    const existing = replyMap.get(reply.inReplyToId!) || []
    existing.push(reply)
    replyMap.set(reply.inReplyToId!, existing)
  }

  let filtered = topLevel
  if (filter === 'active') {
    filtered = topLevel.filter(c => c.type === 'issue' || c.line !== null)
  }

  const sorted = [...filtered].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    return sortOrder === 'newest' ? bTime - aTime : aTime - bTime
  })

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (replyingTo === id) setReplyingTo(null)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <CollapsibleSection title="PR Comments" count={prGitHubComments.length} defaultOpen={true}>
      <div className="flex items-center gap-2 mb-2 text-xs">
        <div className="flex rounded border border-border overflow-hidden">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 transition-colors ${filter === 'all' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-2 py-0.5 transition-colors ${filter === 'active' ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Active
          </button>
        </div>
        <button
          onClick={() => setSortOrder(s => s === 'newest' ? 'oldest' : 'newest')}
          className="text-text-secondary hover:text-text-primary transition-colors ml-auto"
          title={`Sort: ${sortOrder} first`}
        >
          {sortOrder === 'newest' ? '\u2193 Newest' : '\u2191 Oldest'}
        </button>
      </div>

      <div className="space-y-1.5">
        {sorted.map(comment => (
          <CommentThread
            key={comment.id}
            comment={comment}
            threadReplies={replyMap.get(comment.id)}
            isExpanded={expandedIds.has(comment.id)}
            replyingTo={replyingTo}
            onToggle={() => toggleExpanded(comment.id)}
            onClickLocation={onClickLocation}
            onSetReplyingTo={setReplyingTo}
            repoDir={repoDir}
            prNumber={prNumber}
            onRefreshComments={onRefreshComments}
          />
        ))}

        {prCommentsLoading && (
          <div className="flex items-center justify-center py-2">
            <svg className="animate-spin w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {prCommentsHasMore && !prCommentsLoading && (
          <button
            onClick={onLoadOlderComments}
            className="w-full py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Show older comments
          </button>
        )}
      </div>
    </CollapsibleSection>
  )
}
