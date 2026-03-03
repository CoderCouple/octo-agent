/**
 * Hook providing git action handlers for committing, syncing, pushing, and PR operations.
 */
import type { SourceControlData } from './useSourceControlData'
import { sendSkillAwarePrompt, type SkillAwarePromptResult } from '../../utils/skillAwarePrompt'
import { withGitProgress } from '../../utils/gitOperationProgress'
import { useSessionStore } from '../../store/sessions'
import { buildCreatePrPrompt } from '../../utils/prPromptBuilder'
import { buildMergePrompt } from '../../utils/mergePromptBuilder'

export interface SourceControlActionsProps {
  directory?: string
  onGitStatusRefresh?: () => void
  agentPtyId?: string
  agentId?: string | null
  onRecordPushToMain?: (commitHash: string) => void
  onSkillCheck?: (result: SkillAwarePromptResult) => void
  data: SourceControlData
}

interface GitActionsConfig {
  directory: string | undefined
  onGitStatusRefresh: (() => void) | undefined
  agentPtyId: string | undefined
  agentId: string | null | undefined
  onRecordPushToMain: ((commitHash: string) => void) | undefined
  onSkillCheck: ((result: SkillAwarePromptResult) => void) | undefined
  data: SourceControlData
  sessionId: string | null
}

function createGitActions(config: GitActionsConfig) {
  const { directory, onGitStatusRefresh, agentPtyId, agentId, onSkillCheck, data, sessionId } = config
  const {
    setIsSyncing, setIsSyncingWithMain, setGitOpError,
    branchBaseName, gitStatus,
    setAgentMergeMessage,
  } = data
  const refreshBranches = () => { void useSessionStore.getState().refreshAllBranches() }

  const handleSync = async () => {
    if (!directory) return
    setIsSyncing(true)
    setGitOpError(null)
    try {
      await withGitProgress(sessionId, async () => {
        const pullResult = await window.git.pull(directory)
        if (!pullResult.success) {
          setGitOpError({ operation: 'Pull', message: pullResult.error || 'Pull failed' })
          return
        }
        const pushResult = await window.git.push(directory)
        if (!pushResult.success) {
          setGitOpError({ operation: 'Push', message: pushResult.error || 'Push failed' })
          return
        }
        onGitStatusRefresh?.()
        refreshBranches()
      })
    } catch (err) {
      setGitOpError({ operation: 'Sync', message: String(err) })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSyncWithMain = async () => {
    if (!directory) return

    if (gitStatus.length > 0) {
      setGitOpError({ operation: 'Sync with main', message: 'Commit or stash changes before syncing with main' })
      return
    }

    setIsSyncingWithMain(true)
    setGitOpError(null)
    setAgentMergeMessage(null)
    try {
      await withGitProgress(sessionId, async () => {
        const result = await window.git.pullOriginMain(directory)
        if (result.success) {
          onGitStatusRefresh?.()
        } else if (result.hasConflicts) {
          onGitStatusRefresh?.()
        } else {
          setGitOpError({ operation: 'Sync with main', message: result.error || 'Sync failed' })
        }
      })
    } catch (err) {
      setGitOpError({ operation: 'Sync with main', message: String(err) })
    } finally {
      setIsSyncingWithMain(false)
    }
  }

  const handlePushToMain = async () => {
    if (!agentPtyId || !directory) return
    const fallback = `Push this branch to ${branchBaseName} safely. Follow these steps in order:\n1. Pull the latest from ${branchBaseName} and merge it into this branch, resolving any merge conflicts\n2. Run the project's validation checks to make sure everything still passes, and fix any failures\n3. Push this branch to its remote tracking branch\n4. If the push fails, resolve the error and retry\n5. Once the branch is pushed, run: git push origin HEAD:${branchBaseName}\n\nIMPORTANT: Do NOT ask for permission or confirmation before running "git push origin HEAD:${branchBaseName}". This command is safe — it will fail if there are remote commits we don't have locally. The user has explicitly requested this action, so execute it without prompting.`
    const result = await sendSkillAwarePrompt({
      action: 'push-to-main',
      agentPtyId,
      directory,
      agentId: agentId ?? null,
      fallbackPrompt: fallback,
      context: { targetBranch: branchBaseName },
    })
    onSkillCheck?.(result)
  }

  const handleCreatePr = async () => {
    if (!directory || !agentPtyId) return

    const broomyDir = `${directory}/.broomy`
    const promptPath = `${broomyDir}/create-pr-prompt.md`
    const prResultPath = `${broomyDir}/pr-result.json`
    const baseBranch = branchBaseName || 'main'

    // Ensure .broomy directory exists
    await window.fs.mkdir(broomyDir)

    // Remove stale pr-result.json so the watcher doesn't trigger on old data
    await window.fs.rm(prResultPath)

    // Write the prompt file
    const prompt = buildCreatePrPrompt(baseBranch)
    await window.fs.writeFile(promptPath, prompt)

    // Send instruction to agent (skill-aware)
    const fallback = 'Please read and follow the instructions in .broomy/create-pr-prompt.md'
    const result = await sendSkillAwarePrompt({
      action: 'create-pr',
      agentPtyId,
      directory,
      agentId: agentId ?? null,
      fallbackPrompt: fallback,
    })
    onSkillCheck?.(result)
  }

  const handlePushNewBranch = async (branchName: string) => {
    if (!directory) return
    setIsSyncing(true)
    setGitOpError(null)
    try {
      await withGitProgress(sessionId, async () => {
        const result = await window.git.pushNewBranch(directory, branchName)
        if (!result.success) {
          setGitOpError({ operation: 'Push branch', message: result.error || 'Failed to push branch' })
          return
        }
        onGitStatusRefresh?.()
        refreshBranches()
      })
    } catch (err) {
      setGitOpError({ operation: 'Push branch', message: String(err) })
    } finally {
      setIsSyncing(false)
    }
  }

  return { handleSync, handleSyncWithMain, handlePushToMain, handleCreatePr, handlePushNewBranch }
}

export function useSourceControlActions({
  directory,
  onGitStatusRefresh,
  agentPtyId,
  agentId,
  onRecordPushToMain,
  onSkillCheck,
  data,
}: SourceControlActionsProps) {
  const {
    setIsCommitting, setCommitError,
    setGitOpError, setAgentMergeMessage, setAskedAgentToResolve,
    expandedCommits, setExpandedCommits,
    commitFilesByHash, setCommitFilesByHash,
    setLoadingCommitFiles,
  } = data

  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const gitActions = createGitActions({ directory, onGitStatusRefresh, agentPtyId, agentId, onRecordPushToMain, onSkillCheck, data, sessionId: activeSessionId })

  const handleCommitMerge = async () => {
    if (!directory) return
    setIsCommitting(true)
    setCommitError(null)
    setGitOpError(null)
    setAgentMergeMessage(null)
    try {
      await withGitProgress(activeSessionId, async () => {
        // Stage all files (including resolved conflict files) before committing
        await window.git.stageAll(directory)
        const result = await window.git.commitMerge(directory)
        if (result.success) {
          onGitStatusRefresh?.()
        } else {
          const errorMsg = result.error || 'Merge commit failed'
          setCommitError(errorMsg)
          setGitOpError({ operation: 'Merge commit', message: errorMsg })
        }
      })
    } catch (err) {
      const errorMsg = String(err)
      setCommitError(errorMsg)
      setGitOpError({ operation: 'Merge commit', message: errorMsg })
    } finally {
      setIsCommitting(false)
    }
  }

  const handleResolveConflicts = async () => {
    if (!directory || !agentPtyId) return

    const broomyDir = `${directory}/.broomy`
    const promptPath = `${broomyDir}/merge-prompt.md`
    const baseBranch = data.branchBaseName || 'main'

    // Ensure .broomy directory exists
    await window.fs.mkdir(broomyDir)

    // Write the prompt file
    const prompt = buildMergePrompt(baseBranch)
    await window.fs.writeFile(promptPath, prompt)

    // Send instruction to agent (skill-aware)
    const fallback = 'Please read and follow the instructions in .broomy/merge-prompt.md'
    const result = await sendSkillAwarePrompt({
      action: 'resolve-conflicts',
      agentPtyId,
      directory,
      agentId: agentId ?? null,
      fallbackPrompt: fallback,
    })
    onSkillCheck?.(result)
    setAskedAgentToResolve(true)
    setAgentMergeMessage('Asked agent to resolve merge conflicts. Wait for the agent to finish.')
  }

  const handleRevertFile = async (filePath: string) => {
    if (!directory) return
    if (!window.confirm(`Revert changes to "${filePath}"? This cannot be undone.`)) return
    try {
      await window.git.checkoutFile(directory, filePath)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Revert', message: String(err) })
    }
  }

  const handleStage = async (filePath: string) => {
    if (!directory) return
    try {
      await window.git.stage(directory, filePath)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Stage', message: String(err) })
    }
  }

  const handleStageAll = async () => {
    if (!directory) return
    try {
      await window.git.stageAll(directory)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Stage', message: String(err) })
    }
  }

  const handleUnstage = async (filePath: string) => {
    if (!directory) return
    try {
      await window.git.unstage(directory, filePath)
      onGitStatusRefresh?.()
    } catch (err) {
      setGitOpError({ operation: 'Unstage', message: String(err) })
    }
  }

  const handleCommit = async (message: string) => {
    if (!directory) return
    setIsCommitting(true)
    setGitOpError(null)
    try {
      await withGitProgress(activeSessionId, async () => {
        const result = await window.git.commit(directory, message)
        if (result.success) {
          onGitStatusRefresh?.()
        } else {
          setGitOpError({ operation: 'Commit', message: result.error || 'Commit failed' })
        }
      })
    } catch (err) {
      setGitOpError({ operation: 'Commit', message: String(err) })
    } finally {
      setIsCommitting(false)
    }
  }

  const handleCommitWithAI = async () => {
    if (!agentPtyId || !directory) return
    const fallback = 'Look at the current git diff and make a commit. Stage all relevant files, write a clear commit message that describes what changed and why, and commit. Do not commit any files that contain secrets or credentials.'
    const result = await sendSkillAwarePrompt({
      action: 'commit',
      agentPtyId,
      directory,
      agentId: agentId ?? null,
      fallbackPrompt: fallback,
    })
    onSkillCheck?.(result)
  }

  const handleToggleCommit = async (commitHash: string) => {
    const newExpanded = new Set(expandedCommits)
    if (newExpanded.has(commitHash)) {
      newExpanded.delete(commitHash)
    } else {
      newExpanded.add(commitHash)
      if (!commitFilesByHash[commitHash] && directory) {
        setLoadingCommitFiles(prev => new Set(prev).add(commitHash))
        try {
          const files = await window.git.commitFiles(directory, commitHash)
          setCommitFilesByHash(prev => ({ ...prev, [commitHash]: files }))
        } catch {
          setCommitFilesByHash(prev => ({ ...prev, [commitHash]: [] }))
        }
        setLoadingCommitFiles(prev => {
          const next = new Set(prev)
          next.delete(commitHash)
          return next
        })
      }
    }
    setExpandedCommits(newExpanded)
  }

  return {
    handleRevertFile,
    handleStage,
    handleStageAll,
    handleUnstage,
    handleCommit,
    handleCommitWithAI,
    handleCommitMerge,
    handleResolveConflicts,
    handleToggleCommit,
    ...gitActions,
  }
}
