/**
 * Source control view for uncommitted changes with staging, committing, syncing, and conflict resolution.
 */
import { useState } from 'react'
import type { GitFileStatus, GitStatusResult } from '../../../preload/index'
import type { BranchStatus } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { StatusBadge, BranchStatusCard } from './icons'
import { statusLabel, getStatusColor } from '../../utils/explorerHelpers'
import { CommitMessageDialog } from './CommitMessageDialog'

interface SCWorkingViewProps {
  directory: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  branchStatus?: BranchStatus
  branchBaseName: string
  stagedFiles: GitFileStatus[]
  unstagedFiles: GitFileStatus[]
  isMerging: boolean
  hasConflicts: boolean
  isCommitting: boolean
  isSyncing: boolean
  onCommit: (message: string) => void
  onCommitWithAI: () => void
  onCommitMerge: () => void
  onResolveConflicts: () => void
  askedAgentToResolve: boolean
  onSync: () => void
  onSyncWithMain: () => void
  onPushNewBranch: (branchName: string) => void
  onStage: (filePath: string) => void
  onStageAll: () => void
  onUnstage: (filePath: string) => void
  onFileSelect?: (target: NavigationTarget) => void
  onOpenReview?: () => void
  // PR and push to main
  prStatus: { number: number; state: string } | null
  hasWriteAccess: boolean
  allowPushToMain: boolean
  onCreatePr: () => void
  onPushToMain: () => void
  // Behind main
  behindMainCount: number
  isFetchingBehindMain: boolean
  isSyncingWithMain: boolean
}

function SyncStatusContent({
  ahead,
  behind,
  branchStatus,
  branchBaseName,
  hasNoTracking,
  onOpenReview,
  prStatus,
  hasWriteAccess,
  allowPushToMain,
  onCreatePr,
  onPushToMain,
}: {
  ahead: number
  behind: number
  branchStatus?: BranchStatus
  branchBaseName: string
  hasNoTracking: boolean
  onOpenReview?: () => void
  prStatus: { number: number; state: string } | null
  hasWriteAccess: boolean
  allowPushToMain: boolean
  onCreatePr: () => void
  onPushToMain: () => void
}) {
  const hasRemoteChanges = ahead > 0 || behind > 0

  if (hasRemoteChanges) {
    return (
      <div className="flex flex-col items-center gap-2">
        {ahead > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span className="text-lg">&uarr;</span>
            <span className="font-medium">{ahead} commit{ahead !== 1 ? 's' : ''} to push</span>
          </div>
        )}
        {behind > 0 && (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <span className="text-lg">&darr;</span>
            <span className="font-medium">{behind} commit{behind !== 1 ? 's' : ''} to pull</span>
          </div>
        )}
      </div>
    )
  }

  if (branchStatus && branchStatus !== 'in-progress') {
    return (
      <>
        <BranchStatusCard status={branchStatus} />
        {branchStatus === 'pushed' && !prStatus && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onCreatePr}
              className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80"
            >
              Create PR
            </button>
            {hasWriteAccess && allowPushToMain && (
              <button
                onClick={onPushToMain}
                className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-primary hover:bg-bg-secondary"
              >
                {`Push to ${branchBaseName}`}
              </button>
            )}
          </div>
        )}
        {(branchStatus === 'open' || branchStatus === 'pushed') && onOpenReview && (
          <button
            onClick={onOpenReview}
            className="px-4 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 transition-colors"
          >
            Get AI Review
          </button>
        )}
      </>
    )
  }

  if (hasNoTracking) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-text-secondary">Up to date</div>
        <div className="text-xs text-yellow-400">No remote tracking branch</div>
      </div>
    )
  }

  return <div className="text-sm text-text-secondary">Up to date</div>
}

function SyncView({
  syncStatus,
  branchStatus,
  branchBaseName,
  isSyncing,
  onSync,
  onSyncWithMain,
  onPushNewBranch,
  onOpenReview,
  prStatus,
  hasWriteAccess,
  allowPushToMain,
  onCreatePr,
  onPushToMain,
  behindMainCount,
  isFetchingBehindMain,
  isSyncingWithMain,
}: Pick<SCWorkingViewProps, 'syncStatus' | 'branchStatus' | 'branchBaseName' | 'isSyncing' | 'onSync' | 'onSyncWithMain' | 'onPushNewBranch' | 'onOpenReview' | 'prStatus' | 'hasWriteAccess' | 'allowPushToMain' | 'onCreatePr' | 'onPushToMain' | 'behindMainCount' | 'isFetchingBehindMain' | 'isSyncingWithMain'>) {
  const ahead = syncStatus?.ahead ?? 0
  const behind = syncStatus?.behind ?? 0
  const hasRemoteChanges = ahead > 0 || behind > 0
  const currentBranch = syncStatus?.current ?? ''
  const isOnMainBranch = currentBranch === 'main' || currentBranch === 'master'
  const hasNoTracking = !syncStatus?.tracking && !isOnMainBranch && !!currentBranch

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
      {syncStatus?.tracking && (
        <div className="text-xs text-text-secondary text-center">
          {syncStatus.current} &rarr; {syncStatus.tracking}
        </div>
      )}

      <SyncStatusContent
        ahead={ahead}
        behind={behind}
        branchStatus={branchStatus}
        branchBaseName={branchBaseName}
        hasNoTracking={hasNoTracking}
        onOpenReview={onOpenReview}
        prStatus={prStatus}
        hasWriteAccess={hasWriteAccess}
        allowPushToMain={allowPushToMain}
        onCreatePr={onCreatePr}
        onPushToMain={onPushToMain}
      />

      {syncStatus?.tracking && branchStatus !== 'merged' && (
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={`px-4 py-1.5 text-xs rounded text-white disabled:opacity-50 ${
            hasRemoteChanges
              ? 'bg-accent hover:bg-accent/80'
              : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
          }`}
        >
          {isSyncing ? 'Syncing...' : 'Sync Changes'}
        </button>
      )}

      {hasNoTracking && (
        <button
          onClick={() => onPushNewBranch(currentBranch)}
          disabled={isSyncing}
          className="px-4 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50"
        >
          {isSyncing ? 'Pushing...' : 'Push Branch to Remote'}
        </button>
      )}

      <BehindMainBanner
        branchStatus={branchStatus}
        branchBaseName={branchBaseName}
        behindMainCount={behindMainCount}
        isFetchingBehindMain={isFetchingBehindMain}
        isSyncingWithMain={isSyncingWithMain}
        onSyncWithMain={onSyncWithMain}
      />
    </div>
  )
}

function BehindMainBanner({ branchStatus, branchBaseName, behindMainCount, isFetchingBehindMain, isSyncingWithMain, onSyncWithMain }: {
  branchStatus?: BranchStatus
  branchBaseName: string
  behindMainCount: number
  isFetchingBehindMain: boolean
  isSyncingWithMain: boolean
  onSyncWithMain: () => void
}) {
  if (isFetchingBehindMain || behindMainCount === 0) return null
  if (branchStatus !== 'pushed' && branchStatus !== 'empty' && branchStatus !== 'open') return null

  return (
    <div className="flex flex-col items-center gap-2 mt-2">
      <div className="text-xs text-text-secondary">
        {branchBaseName} has {behindMainCount} new commit{behindMainCount !== 1 ? 's' : ''}
      </div>
      <button
        onClick={onSyncWithMain}
        disabled={isSyncingWithMain}
        className="px-4 py-1.5 text-xs rounded bg-bg-tertiary text-text-primary hover:bg-bg-secondary disabled:opacity-50"
      >
        {isSyncingWithMain ? 'Syncing...' : `Get latest from ${branchBaseName}`}
      </button>
    </div>
  )
}

function CommitArea({ isMerging, hasConflicts, isCommitting, onCommit, onCommitWithAI, onCommitMerge, onResolveConflicts, askedAgentToResolve }: Pick<SCWorkingViewProps, 'isMerging' | 'hasConflicts' | 'isCommitting' | 'onCommit' | 'onCommitWithAI' | 'onCommitMerge' | 'onResolveConflicts' | 'askedAgentToResolve'>) {
  const [showCommitDialog, setShowCommitDialog] = useState(false)

  return (
    <div className="px-3 py-2 border-b border-border">
      {isMerging ? (
        <div className="flex flex-col gap-1.5">
          <div className={`text-xs font-medium ${hasConflicts ? 'text-yellow-400' : 'text-green-400'}`}>
            {hasConflicts ? 'Merge in progress' : 'Merge conflicts resolved'}
          </div>
          {hasConflicts ? (
            <button
              onClick={askedAgentToResolve ? undefined : onResolveConflicts}
              disabled={askedAgentToResolve}
              className="w-full px-2 py-1.5 text-xs rounded bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {askedAgentToResolve ? 'Resolving Conflicts...' : 'Resolve Conflicts'}
            </button>
          ) : (
            <button
              onClick={onCommitMerge}
              disabled={isCommitting}
              className="w-full px-2 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCommitting ? 'Committing...' : 'Commit Merge'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setShowCommitDialog(true)}
            disabled={isCommitting}
            className="flex-1 px-2 py-1.5 text-xs rounded border border-border text-text-primary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCommitting ? 'Committing...' : 'Commit'}
          </button>
          <button
            onClick={onCommitWithAI}
            className="flex-1 px-2 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80"
          >
            Commit with AI
          </button>
        </div>
      )}
      {showCommitDialog && (
        <CommitMessageDialog
          onCommit={onCommit}
          onClose={() => setShowCommitDialog(false)}
        />
      )}
    </div>
  )
}

export function SCWorkingView({
  directory,
  gitStatus,
  syncStatus,
  branchStatus,
  branchBaseName,
  stagedFiles,
  unstagedFiles,
  isMerging,
  hasConflicts,
  isCommitting,
  isSyncing,
  onCommit,
  onCommitWithAI,
  onCommitMerge,
  onResolveConflicts,
  askedAgentToResolve,
  onSync,
  onSyncWithMain,
  onPushNewBranch,
  onStage,
  onStageAll,
  onUnstage,
  onFileSelect,
  onOpenReview,
  prStatus,
  hasWriteAccess,
  allowPushToMain,
  onCreatePr,
  onPushToMain,
  behindMainCount,
  isFetchingBehindMain,
  isSyncingWithMain,
}: SCWorkingViewProps) {
  if (gitStatus.length === 0) {
    return (
      <SyncView
        syncStatus={syncStatus}
        branchStatus={branchStatus}
        branchBaseName={branchBaseName}
        isSyncing={isSyncing}
        onSync={onSync}
        onSyncWithMain={onSyncWithMain}
        onPushNewBranch={onPushNewBranch}
        onOpenReview={onOpenReview}
        prStatus={prStatus}
        hasWriteAccess={hasWriteAccess}
        allowPushToMain={allowPushToMain}
        onCreatePr={onCreatePr}
        onPushToMain={onPushToMain}
        behindMainCount={behindMainCount}
        isFetchingBehindMain={isFetchingBehindMain}
        isSyncingWithMain={isSyncingWithMain}
      />
    )
  }

  // Has changes: show commit view
  return (
    <>
      <CommitArea
        isMerging={isMerging}
        hasConflicts={hasConflicts}
        isCommitting={isCommitting}
        onCommit={onCommit}
        onCommitWithAI={onCommitWithAI}
        onCommitMerge={onCommitMerge}
        onResolveConflicts={onResolveConflicts}
        askedAgentToResolve={askedAgentToResolve}
      />

      <div className="flex-1 overflow-y-auto text-sm">
        {/* Staged Changes */}
        <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary">
          Staged Changes ({stagedFiles.length})
        </div>
        {stagedFiles.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-secondary">No staged changes</div>
        ) : (
          stagedFiles.map((file) => (
            <div
              key={`staged-${file.path}`}
              className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
              title={`${file.path} — ${statusLabel(file.status)} (staged)`}
              onClick={() => {
                if (onFileSelect) {
                  onFileSelect({ filePath: `${directory}/${file.path}`, openInDiffMode: true })
                }
              }}
            >
              <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                {file.path}
              </span>
              <StatusBadge status={file.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUnstage(file.path)
                }}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                title="Unstage"
              >
                -
              </button>
            </div>
          ))
        )}

        {/* Changes */}
        <div
          className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary mt-1 cursor-default"
          onContextMenu={async (e) => {
            e.preventDefault()
            if (unstagedFiles.length === 0) return
            const action = await window.menu.popup([
              { id: 'stage-all', label: 'Stage All Changes' },
            ])
            if (action === 'stage-all') onStageAll()
          }}
        >
          Changes ({unstagedFiles.length})
        </div>
        {unstagedFiles.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-secondary">No changes</div>
        ) : (
          unstagedFiles.map((file) => (
            <div
              key={`unstaged-${file.path}`}
              className="flex items-center gap-2 px-3 py-1 hover:bg-bg-tertiary cursor-pointer group"
              title={`${file.path} — ${statusLabel(file.status)}`}
              onClick={() => {
                if (onFileSelect) {
                  onFileSelect({ filePath: `${directory}/${file.path}`, openInDiffMode: true })
                }
              }}
            >
              <span className={`truncate flex-1 text-xs ${getStatusColor(file.status)}`}>
                {file.path}
              </span>
              <StatusBadge status={file.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStage(file.path)
                }}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary text-xs px-1"
                title="Stage"
              >
                +
              </button>
            </div>
          ))
        )}
      </div>
    </>
  )
}
