/**
 * Top-level source control container that composes the PR banner, view toggle, and sub-views.
 */
import { useState, useEffect, useCallback } from 'react'
import type { GitFileStatus, GitStatusResult } from '../../../preload/index'
import type { BranchStatus, PrState } from '../../store/sessions'
import type { NavigationTarget } from '../../utils/fileNavigation'
import { useSourceControlData } from './useSourceControlData'
import { useSourceControlActions } from './useSourceControlActions'
import { SCViewToggle } from './SCViewToggle'
import { SCPrBanner } from './SCPrBanner'
import { SCCommitsView } from './SCCommitsView'
import { SCBranchView } from './SCBranchView'
import { SCWorkingView } from './SCWorkingView'
import { SkillBanner } from './SkillBanner'
import { SkillsDialog } from './SkillsDialog'
import { isSkillBannerDismissed, dismissSkillBanner } from '../../utils/skillBannerState'
import type { SkillAwarePromptResult } from '../../utils/skillAwarePrompt'

interface SourceControlProps {
  directory?: string
  gitStatus: GitFileStatus[]
  syncStatus?: GitStatusResult | null
  onFileSelect?: (target: NavigationTarget) => void
  onGitStatusRefresh?: () => void
  branchStatus?: BranchStatus
  repoId?: string
  agentPtyId?: string
  agentId?: string | null
  onUpdatePrState?: (prState: PrState, prNumber?: number, prUrl?: string) => void
  issueNumber?: number
  issueTitle?: string
  issueUrl?: string
  pushedToMainAt?: number
  pushedToMainCommit?: string
  onRecordPushToMain?: (commitHash: string) => void
  onClearPushToMain?: () => void
  onOpenReview?: () => void
}

export function SourceControl({
  directory,
  gitStatus,
  syncStatus,
  onFileSelect,
  onGitStatusRefresh,
  branchStatus,
  repoId,
  agentPtyId,
  agentId,
  onUpdatePrState,
  issueNumber,
  issueTitle,
  issueUrl,
  pushedToMainAt,
  pushedToMainCommit,
  onRecordPushToMain,
  onClearPushToMain,
  onOpenReview,
}: SourceControlProps) {
  const [scView, setScView] = useState<'working' | 'branch' | 'commits'>('working')
  const [showSkillBanner, setShowSkillBanner] = useState(false)
  const [showSkillsDialog, setShowSkillsDialog] = useState(false)

  // Reset view when directory (session) changes
  useEffect(() => {
    setScView('working')
    setShowSkillBanner(false)
  }, [directory])

  const handleSkillCheck = useCallback((result: SkillAwarePromptResult) => {
    if (result.isClaudeCode && !result.skillExists && directory && !isSkillBannerDismissed(directory)) {
      setShowSkillBanner(true)
    }
  }, [directory])

  const handleDismissBanner = useCallback(() => {
    if (directory) dismissSkillBanner(directory)
    setShowSkillBanner(false)
  }, [directory])

  const data = useSourceControlData({
    directory, gitStatus, syncStatus, branchStatus, onUpdatePrState,
    pushedToMainAt, pushedToMainCommit, onClearPushToMain,
    repoId, scView,
  })

  const actions = useSourceControlActions({
    directory, onGitStatusRefresh, agentPtyId, agentId, onRecordPushToMain, onSkillCheck: handleSkillCheck, data,
  })

  if (!directory) return null

  const viewToggle = (
    <SCViewToggle scView={scView} setScView={setScView} />
  )

  const skillsDialog = showSkillsDialog && directory && (
    <SkillsDialog
      directory={directory}
      onClose={() => setShowSkillsDialog(false)}
      onInstalled={() => setShowSkillBanner(false)}
    />
  )

  const banners = (
    <>
    {showSkillBanner && (
      <SkillBanner
        onOpenDialog={() => setShowSkillsDialog(true)}
        onDismiss={handleDismissBanner}
      />
    )}
    <SCPrBanner
      prStatus={data.prStatus}
      isPrLoading={data.isPrLoading}
      branchStatus={branchStatus}
      branchBaseName={data.branchBaseName}
      gitStatus={gitStatus}
      syncStatus={syncStatus}
      isSyncingWithMain={data.isSyncingWithMain}
      onSyncWithMain={actions.handleSyncWithMain}
      gitOpError={data.gitOpError}
      onDismissError={() => data.setGitOpError(null)}
      agentMergeMessage={data.agentMergeMessage}
      onDismissAgentMerge={() => data.setAgentMergeMessage(null)}
      issueNumber={issueNumber}
      issueTitle={issueTitle}
      issueUrl={issueUrl}
    />
    </>
  )

  if (scView === 'commits') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {banners}
        {skillsDialog}
        <SCCommitsView
          directory={directory}
          branchCommits={data.branchCommits}
          isCommitsLoading={data.isCommitsLoading}
          branchBaseName={data.branchBaseName}
          expandedCommits={data.expandedCommits}
          commitFilesByHash={data.commitFilesByHash}
          loadingCommitFiles={data.loadingCommitFiles}
          onToggleCommit={actions.handleToggleCommit}
          onFileSelect={onFileSelect}
        />
      </div>
    )
  }

  if (scView === 'branch') {
    return (
      <div className="flex flex-col h-full">
        {viewToggle}
        {banners}
        {skillsDialog}
        <SCBranchView
          directory={directory}
          branchChanges={data.branchChanges}
          isBranchLoading={data.isBranchLoading}
          branchBaseName={data.branchBaseName}
          branchMergeBase={data.branchMergeBase}
          onFileSelect={onFileSelect}
        />
      </div>
    )
  }

  // Working changes view
  return (
    <div className="flex flex-col h-full">
      {viewToggle}
      {banners}
      {skillsDialog}
      <SCWorkingView
        directory={directory}
        gitStatus={gitStatus}
        syncStatus={syncStatus}
        branchStatus={branchStatus}
        branchBaseName={data.branchBaseName}
        stagedFiles={data.stagedFiles}
        unstagedFiles={data.unstagedFiles}
        isMerging={syncStatus?.isMerging ?? false}
        hasConflicts={syncStatus?.hasConflicts ?? false}
        isCommitting={data.isCommitting}
        isSyncing={data.isSyncing}
        onCommit={actions.handleCommit}
        onCommitWithAI={actions.handleCommitWithAI}
        onCommitMerge={actions.handleCommitMerge}
        onResolveConflicts={actions.handleResolveConflicts}
        askedAgentToResolve={data.askedAgentToResolve}
        onSync={actions.handleSync}
        onSyncWithMain={actions.handleSyncWithMain}
        onPushNewBranch={actions.handlePushNewBranch}
        onStage={actions.handleStage}
        onStageAll={actions.handleStageAll}
        onUnstage={actions.handleUnstage}
        onFileSelect={onFileSelect}
        onOpenReview={onOpenReview}
        prStatus={data.prStatus}
        hasWriteAccess={data.hasWriteAccess}
        allowPushToMain={data.currentRepo?.allowPushToMain ?? true}
        onCreatePr={actions.handleCreatePr}
        onPushToMain={actions.handlePushToMain}
        behindMainCount={data.behindMainCount}
        isFetchingBehindMain={data.isFetchingBehindMain}
        isSyncingWithMain={data.isSyncingWithMain}
      />
    </div>
  )
}
