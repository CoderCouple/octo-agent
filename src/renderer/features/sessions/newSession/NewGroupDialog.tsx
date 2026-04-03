/**
 * Dialog to create a group session by selecting 2+ existing sessions.
 */
import { useState, useMemo } from 'react'
import { useSessionStore } from '../../../store/sessions'
import { getCharacterById } from '../../../data/narutoCharacters'

interface NewGroupDialogProps {
  onClose: () => void
}

export default function NewGroupDialog({ onClose }: NewGroupDialogProps) {
  const [groupName, setGroupName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const sessions = useSessionStore((s) => s.sessions)
  const addGroupSession = useSessionStore((s) => s.addGroupSession)

  // Only show non-archived, non-group sessions
  const eligibleSessions = useMemo(
    () => sessions.filter((s) => !s.isArchived && s.sessionType !== 'group'),
    [sessions],
  )

  const toggleSession = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canCreate = groupName.trim().length > 0 && selectedIds.size >= 2

  const handleCreate = () => {
    if (!canCreate) return
    addGroupSession(groupName.trim(), [...selectedIds])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary rounded-xl shadow-xl w-[420px] max-h-[80vh] flex flex-col border border-border">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Create Group Session</h2>
          <p className="text-xs text-text-secondary mt-1">
            Select 2 or more sessions to form a group. Agents in the group can communicate with each other.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Group name */}
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Group Name</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. Frontend Team"
            className="w-full px-3 py-2 text-sm rounded-lg bg-bg-primary border border-border text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent/50 mb-4"
            autoFocus
          />

          {/* Sessions list */}
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Select Sessions ({selectedIds.size} selected)
          </label>
          <div className="space-y-1">
            {eligibleSessions.length === 0 && (
              <p className="text-xs text-text-secondary py-4 text-center">
                No sessions available. Create at least 2 sessions first.
              </p>
            )}
            {eligibleSessions.map((s) => {
              const char = s.characterId ? getCharacterById(s.characterId) : undefined
              const isSelected = selectedIds.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSession(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left ${
                    isSelected
                      ? 'bg-accent/15 border border-accent/30'
                      : 'bg-bg-primary border border-transparent hover:bg-bg-tertiary/50'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-accent border-accent' : 'border-border'
                  }`}>
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  {/* Avatar */}
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: char?.color ?? '#666' }}
                  >
                    <span className="text-[9px] font-bold text-white">{char?.initials ?? '?'}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {char?.shortName ?? s.name}
                    </div>
                    <div className="text-[11px] text-text-secondary truncate">
                      {s.directory.split('/').pop()} / {s.branch}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-tertiary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  )
}
