/**
 * Individual session card with status indicator, branch name, and action buttons.
 *
 * Each card subscribes to its own session slice from the store via a shallow-equality
 * selector, so it only re-renders when its own display fields change — not when
 * unrelated sessions update their agent monitor state.
 */
import { memo, useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessions'
import { useShallow } from 'zustand/react/shallow'
import type { SessionStatus, BranchStatus } from '../../store/sessions'
import { formatElapsedTime } from '../../shared/utils/formatTime'
import { useElapsedSeconds } from '../../shared/hooks/useElapsedSeconds'
import { getCharacterById } from '../../data/narutoCharacters'

const statusLabels: Record<SessionStatus, string> = {
  working: 'Working',
  idle: 'Idle',
  error: 'Error',
  initializing: 'Setting up...',
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function StatusIndicator({ status, isUnread }: { status: SessionStatus; isUnread: boolean }) {
  if (status === 'initializing') {
    return <Spinner className="text-accent" />
  }

  if (status === 'working') {
    return <Spinner className="text-status-working" />
  }

  if (status === 'error') {
    return <span className="w-2 h-2 rounded-full bg-status-error" />
  }

  // idle
  if (isUnread) {
    return (
      <span className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_6px_1px_rgba(74,222,128,0.5)]" />
    )
  }
  return <span className="w-2 h-2 rounded-full bg-status-idle" />
}

function BranchStatusChip({ status }: { status: BranchStatus }) {
  if (status === 'in-progress') return null

  const config: Record<string, { label: string; classes: string }> = {
    pushed: { label: 'PUSHED', classes: 'bg-blue-500/20 text-blue-400' },
    empty: { label: 'EMPTY', classes: 'bg-gray-500/20 text-gray-400' },
    open: { label: 'PR OPEN', classes: 'bg-green-500/20 text-green-400' },
    merged: { label: 'MERGED', classes: 'bg-purple-500/20 text-purple-400' },
    closed: { label: 'CLOSED', classes: 'bg-red-500/20 text-red-400' },
  }

  const { label, classes } = config[status]
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${classes}`}>
      {label}
    </span>
  )
}

export default memo(function SessionCard({
  sessionId,
  onSelect,
  onDelete,
  onArchive,
}: {
  sessionId: string
  onSelect: (sessionId: string) => void
  onDelete: (e: React.MouseEvent | React.KeyboardEvent, sessionId: string) => void
  onArchive?: (e: React.MouseEvent, sessionId: string) => void
}) {
  // Subscribe to only the fields this card renders, with shallow equality.
  // This prevents re-renders when unrelated session fields (or other sessions) change.
  const session = useSessionStore(
    useShallow((s) => {
      const sess = s.sessions.find(x => x.id === sessionId)
      if (!sess) return null
      return {
        status: sess.status,
        isUnread: sess.isUnread,
        branch: sess.branch,
        name: sess.name,
        directory: sess.directory,
        lastMessage: sess.lastMessage,
        branchStatus: sess.branchStatus,
        prNumber: sess.prNumber,
        isArchived: sess.isArchived,
        sessionType: sess.sessionType,
        reviewStatus: sess.reviewStatus,
        initError: sess.initError,
        characterId: sess.characterId,
        memberSessionIds: sess.memberSessionIds,
      }
    }),
  )
  // For group sessions, resolve member characters
  const memberCharacters = useSessionStore(
    useShallow((s) => {
      const sess = s.sessions.find(x => x.id === sessionId)
      if (!sess?.memberSessionIds) return []
      return sess.memberSessionIds
        .map((id) => s.sessions.find((x) => x.id === id))
        .filter(Boolean)
        .map((ms) => ({
          id: ms!.id,
          characterId: ms!.characterId,
        }))
    }),
  )
  const isActive = useSessionStore((s) => s.activeSessionId === sessionId)

  // Debounce working status: only show spinner after 1.5s of continuous working.
  // The activity detector sets idle after 1s of silence, so brief terminal output
  // (prompt redraws, SIGWINCH responses) cycles working→idle in ~1.3s and never
  // reaches this threshold. Genuine agent work produces sustained output.
  const [showWorking, setShowWorking] = useState(false)
  useEffect(() => {
    if (session?.status === 'working') {
      const timer = setTimeout(() => setShowWorking(true), 1500)
      return () => clearTimeout(timer)
    } else {
      setShowWorking(false)
    }
  }, [session?.status])

  const elapsedSeconds = useElapsedSeconds(sessionId)

  if (!session) return null

  const displayStatus: SessionStatus = session.status === 'initializing' ? 'initializing'
    : showWorking ? 'working' : (session.status === 'error' ? 'error' : 'idle')
  const isUnread = session.isUnread
  const character = session.characterId ? getCharacterById(session.characterId) : undefined
  const statusDot = displayStatus === 'working' ? 'green' as const
    : displayStatus === 'error' ? 'red' as const
    : 'gray' as const

  return (
    <div
      tabIndex={0}
      onClick={() => onSelect(sessionId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSelect(sessionId)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          const next = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement | null
          if (next && next.tabIndex >= 0) next.focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const prev = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null
          if (prev && prev.tabIndex >= 0) prev.focus()
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          onDelete(e, sessionId)
        }
      }}
      className={`group relative w-full text-left p-2.5 rounded-lg mb-1 transition-all cursor-pointer outline-none focus:ring-1 focus:ring-accent/50 ${
        isActive ? 'bg-accent/15' : 'hover:bg-bg-tertiary/50'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar — group sessions show stacked circles, regular sessions show square */}
        {session.sessionType === 'group' ? (
          <div className="flex -space-x-3 flex-shrink-0 items-center h-20">
            {memberCharacters.slice(0, 3).map((mc, i) => {
              const mChar = mc.characterId ? getCharacterById(mc.characterId) : undefined
              return (
                <div
                  key={mc.id}
                  className="w-10 h-10 rounded-full border-2 border-bg-primary flex items-center justify-center"
                  style={{ backgroundColor: mChar?.color ?? '#666', zIndex: 3 - i }}
                  title={mChar?.shortName ?? '?'}
                >
                  <span className="text-xs font-bold text-white">{mChar?.initials ?? '?'}</span>
                </div>
              )
            })}
            {memberCharacters.length > 3 && (
              <div
                className="w-10 h-10 rounded-full border-2 border-bg-primary bg-bg-tertiary flex items-center justify-center"
                style={{ zIndex: 0 }}
              >
                <span className="text-xs font-medium text-text-secondary">+{memberCharacters.length - 3}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-20 h-20 flex-shrink-0 relative">
            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
              style={{ backgroundColor: character?.color ?? 'var(--color-bg-tertiary)' }}
              title={character?.name}
            >
              <span className="text-base font-bold text-white drop-shadow-sm">
                {character?.initials ?? '?'}
              </span>
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-primary ${
              statusDot === 'green' ? 'bg-green-500' : statusDot === 'red' ? 'bg-red-500' : 'bg-gray-500'
            }`} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Character name + time/status */}
          <div className="flex items-center justify-between mb-0.5">
            <span className={`text-sm truncate text-text-primary ${
              isUnread ? 'font-bold' : 'font-medium'
            }`}>
              {session.sessionType === 'group' ? session.name : (character?.shortName ?? session.name)}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0 ml-1">
              {session.sessionType === 'group' ? (
                null
              ) : session.sessionType === 'review' ? (
                session.reviewStatus === 'reviewed' ? (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-500/20 text-green-400">
                    Reviewed
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-cyan-500/20 text-cyan-400">
                    Review
                  </span>
                )
              ) : (
                <BranchStatusChip status={session.branchStatus} />
              )}
            </div>
          </div>

          {session.sessionType === 'group' ? (
            <>
              {/* Row 2: Member count */}
              <div className="flex items-center gap-1 text-xs text-text-secondary mb-0.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="truncate">{memberCharacters.length} agents</span>
              </div>
            </>
          ) : (
            <>
              {/* Row 2: Folder name */}
              <div className="flex items-center gap-1 text-xs text-text-secondary mb-0.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="truncate">{session.directory.split('/').pop()}</span>
              </div>

              {/* Row 3: Branch + PR */}
              <div className="flex items-center gap-1 text-xs text-text-secondary/60 mb-0.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <span className="truncate">{session.branch}</span>
                {session.prNumber && (
                  <span className="text-purple-400 flex-shrink-0">#{session.prNumber}</span>
                )}
              </div>
            </>
          )}

          {/* Row 4: Last message or status */}
          {session.initError ? (
            <div className="text-xs truncate text-status-error">
              {session.initError}
            </div>
          ) : session.lastMessage ? (
            <div className={`text-xs flex items-center gap-1.5 ${
              isUnread ? 'text-text-secondary' : 'text-text-secondary/60'
            }`}>
              <span className="truncate">{session.lastMessage}</span>
              {showWorking && elapsedSeconds > 0 && (
                <span className="flex-shrink-0 text-text-secondary/40">{formatElapsedTime(elapsedSeconds)}</span>
              )}
            </div>
          ) : (
            <div className="text-xs text-text-secondary/60 flex items-center gap-1.5">
              <span className="truncate">{statusLabels[displayStatus]}</span>
              {showWorking && elapsedSeconds > 0 && (
                <span className="flex-shrink-0 text-text-secondary/40">{formatElapsedTime(elapsedSeconds)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Session type tag — bottom-right of card */}
      <div className="absolute bottom-1.5 right-2">
        {session.sessionType === 'group' ? (
          <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-indigo-500/20 text-indigo-400">
            Group
          </span>
        ) : (
          <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-emerald-500/20 text-emerald-400">
            Agent
          </span>
        )}
      </div>

      {/* Hover action buttons */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
        {onArchive && (
          <button
            onClick={(e) => onArchive(e, sessionId)}
            className="text-text-secondary hover:text-text-primary p-1"
            title={session.isArchived ? 'Unarchive session' : 'Archive session'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="5" rx="1" />
              <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
              <path d="M10 12h4" />
            </svg>
          </button>
        )}
        <button
          onClick={(e) => onDelete(e, sessionId)}
          className="text-text-secondary hover:text-status-error p-1"
          title="Delete session"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
})
