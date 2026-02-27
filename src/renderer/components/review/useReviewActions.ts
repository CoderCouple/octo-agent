/**
 * Hook providing action handlers for review generation, comment pushing, gitignore management, and file navigation.
 */
import { useCallback } from 'react'
import type { CodeLocation, PendingComment, RequestedChange, ReviewHistory } from '../../types/review'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { buildReviewPrompt, type PrComment } from '../../utils/reviewPromptBuilder'
import { focusAgentTerminal } from '../../utils/focusHelpers'
import type { ReviewDataState } from './useReviewData'

async function fetchReviewContext(
  session: Session,
  historyFilePath: string,
): Promise<{ previousRequestedChanges: RequestedChange[]; previousHeadCommit?: string; prComments?: PrComment[]; prDescription?: string }> {
  let previousRequestedChanges: RequestedChange[] = []
  let previousHeadCommit: string | undefined

  try {
    const historyExists = await window.fs.exists(historyFilePath)
    if (historyExists) {
      const content = await window.fs.readFile(historyFilePath)
      const history = JSON.parse(content) as ReviewHistory
      if (history.reviews.length > 0) {
        previousRequestedChanges = history.reviews[0].requestedChanges
        previousHeadCommit = history.reviews[0].headCommit
      }
    }
  } catch {
    // Non-fatal
  }

  let prComments: PrComment[] | undefined
  if (session.prNumber && previousHeadCommit) {
    try {
      const ghComments = await window.gh.prComments(session.directory, session.prNumber)
      prComments = ghComments.map(c => ({
        body: c.body,
        path: c.path || undefined,
        line: c.line ?? undefined,
        author: c.author,
      }))
    } catch {
      // Non-fatal
    }
  }

  let prDescription: string | undefined
  if (session.prNumber) {
    try {
      const body = await window.gh.prDescription(session.directory, session.prNumber)
      if (body) prDescription = body
    } catch {
      // Non-fatal
    }
  }

  return { previousRequestedChanges, previousHeadCommit, prComments, prDescription }
}

async function sendAgentPrompt(
  agentPtyId: string,
  broomyDir: string,
  fileName: string,
  prompt: string,
): Promise<void> {
  await window.fs.mkdir(broomyDir)
  await window.fs.writeFile(`${broomyDir}/${fileName}`, prompt)
  await window.pty.write(agentPtyId, `Please read and follow the instructions in .broomy/${fileName}`)
  focusAgentTerminal()
}

function buildExplainPrompt(issue: { title: string; severity: string; description: string; locations: { file: string; startLine: number; endLine?: number }[] }): string {
  const locations = issue.locations.map(loc => `- ${loc.file}:${loc.startLine}${loc.endLine ? `-${loc.endLine}` : ''}`).join('\n')
  return `# Explain Review Issue

Please explain this potential issue from the code review in detail:

**Title:** ${issue.title}
**Severity:** ${issue.severity}
**Description:** ${issue.description}
${locations ? `\n**Locations:**\n${locations}` : ''}

Please cover:
1. Why this is flagged as a potential problem
2. What concrete risk or impact it could have
3. How to address it if it is indeed an issue
4. Whether this might actually be a false positive and why
`
}

function buildResponsePlanPrompt(
  reviewData: { overview: { purpose: string; approach: string }; potentialIssues: { severity: string; title: string; description: string }[] },
  prComments: { body: string; author: string; path?: string; line?: number | null }[],
): string {
  const issuesList = reviewData.potentialIssues
    .map(i => `- [${i.severity}] ${i.title}: ${i.description}`)
    .join('\n')
  const commentsList = prComments
    .map(c => `- **${c.author}**${c.path ? ` (${c.path}${c.line ? `:${c.line}` : ''})` : ''}: ${c.body.slice(0, 200)}`)
    .join('\n')
  return `# Draft Response Plan

Reviewers have left comments on this PR. Help me draft a response plan.

## Review Summary
**Purpose:** ${reviewData.overview.purpose}
**Approach:** ${reviewData.overview.approach}

## Reviewer Comments
${commentsList || 'No comments.'}

## Issues Found by AI Review
${issuesList || 'No issues found.'}

## Instructions
1. First, ask me clarifying questions about which comments I want to address and how
2. Once we've discussed the approach, write a response plan to \`.broomy/plan.md\` that includes:
   - Which reviewer comments to address and the approach for each
   - Which AI-flagged issues are also relevant to the reviewer feedback
   - Suggested order of changes
   - Any risks or considerations
`
}

async function checkGitignore(directory: string): Promise<boolean> {
  try {
    const gitignorePath = `${directory}/.gitignore`
    const exists = await window.fs.exists(gitignorePath)
    if (!exists) return false

    const content = await window.fs.readFile(gitignorePath)
    const lines = content.split(/\r?\n/).map((l: string) => l.trim())
    return lines.some((line: string) => line === '.broomy' || line === '.broomy/' || line === '/.broomy' || line === '/.broomy/')
  } catch {
    return false
  }
}

async function addToGitignore(directory: string): Promise<void> {
  const gitignorePath = `${directory}/.gitignore`
  const exists = await window.fs.exists(gitignorePath)
  if (exists) {
    await window.fs.appendFile(gitignorePath, '\n# Broomy review data\n.broomy/\n')
  } else {
    await window.fs.writeFile(gitignorePath, '# Broomy review data\n.broomy/\n')
  }
}

export interface ReviewActions {
  handleGenerateReview: () => Promise<void>
  handlePushComments: () => Promise<void>
  handleDeleteComment: (commentId: string) => Promise<void>
  handleOpenPrUrl: () => void
  handleClickLocation: (location: CodeLocation) => void
  handleExplainIssue: (issueId: string) => Promise<void>
  handleAddComment: (file: string, line: number, body: string) => Promise<void>
  handleDraftResponsePlan: () => Promise<void>
  handleGitignoreAdd: () => Promise<void>
  handleGitignoreContinue: () => Promise<void>
  handleGitignoreCancel: () => void
}

export function useReviewActions(
  session: Session,
  repo: ManagedRepo | undefined,
  onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void,
  state: ReviewDataState,
): ReviewActions {
  const {
    comments, mergeBase, broomyDir, commentsFilePath, historyFilePath, promptFilePath,
    setFetching, setWaitingForAgent, setFetchingStatus,
    setPushing, setPushResult, setError, setShowGitignoreModal, setPendingGenerate, setComments,
  } = state

  const proceedWithGeneration = async () => {
    setShowGitignoreModal(false)
    setPendingGenerate(false)
    setFetching(true)
    setError(null)

    try {
      // Fetch the base branch so origin/<base> is up-to-date for the diff.
      // Without this, a stale origin/main causes the review to include
      // unrelated commits that were merged to main since we last fetched.
      try {
        const baseBranch = session.prBaseBranch || 'main'
        await window.git.fetchBranch(session.directory, baseBranch)
      } catch {
        // Non-fatal - might not have network
      }

      // Pull latest changes from the PR branch before reviewing
      if (session.prNumber) {
        try {
          const branch = await window.git.getBranch(session.directory)
          await window.git.syncReviewBranch(session.directory, branch, session.prNumber)
        } catch {
          // Non-fatal - might not have network
        }
      }

      setFetching(false)
      setWaitingForAgent(true)

      // Create .broomy directory
      await window.fs.mkdir(broomyDir)

      // Fetch review context (history, PR comments, PR description)
      const { previousRequestedChanges, ...promptOptions } = await fetchReviewContext(session, historyFilePath)

      // Build the review prompt
      const reviewInstructions = repo?.reviewInstructions || ''
      const prompt = buildReviewPrompt(session, reviewInstructions, previousRequestedChanges, promptOptions)

      // Write the prompt file
      await window.fs.writeFile(promptFilePath, prompt)

      // Send command to agent terminal (user must press enter to confirm)
      await window.pty.write(session.agentPtyId!, 'Please read and follow the instructions in .broomy/review-prompt.md')
      setFetchingStatus('pasted')
      focusAgentTerminal()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFetching(false)
      setWaitingForAgent(false)
      setFetchingStatus(null)
    }
  }

  const handleGenerateReview = useCallback(async () => {
    if (!session.agentPtyId) {
      setError('No agent terminal found. Wait for the agent to start.')
      return
    }

    // Check gitignore first
    const inGitignore = await checkGitignore(session.directory)
    if (!inGitignore) {
      setPendingGenerate(true)
      setShowGitignoreModal(true)
      return
    }

    await proceedWithGeneration()
  }, [session])

  const handleGitignoreAdd = async () => {
    try {
      await addToGitignore(session.directory)
    } catch (err) {
      setError(`Failed to update .gitignore: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    await proceedWithGeneration()
  }

  const handleGitignoreContinue = async () => {
    await proceedWithGeneration()
  }

  const handleGitignoreCancel = () => {
    setShowGitignoreModal(false)
    setPendingGenerate(false)
  }

  const handlePushComments = useCallback(async () => {
    if (!session.prNumber || comments.length === 0) return

    const unpushedComments = comments.filter(c => !c.pushed)
    if (unpushedComments.length === 0) {
      setPushResult('All comments already pushed')
      setTimeout(() => setPushResult(null), 3000)
      return
    }

    setPushing(true)
    setPushResult(null)

    try {
      const relativePath = (file: string) => file.replace(`${session.directory  }/`, '')

      const result = await window.gh.submitDraftReview(
        session.directory,
        session.prNumber,
        unpushedComments.map(c => ({
          path: relativePath(c.file),
          line: c.line,
          body: c.body,
        }))
      )

      if (result.success) {
        // Mark comments as pushed
        const updatedComments = comments.map(c =>
          unpushedComments.find(u => u.id === c.id) ? { ...c, pushed: true } : c
        )
        setComments(updatedComments)
        await window.fs.writeFile(commentsFilePath, JSON.stringify(updatedComments, null, 2))
        setPushResult(`Pushed ${unpushedComments.length} comment${unpushedComments.length !== 1 ? 's' : ''} as draft review`)
      } else {
        setPushResult(`Failed: ${result.error}`)
      }
    } catch (err) {
      setPushResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPushing(false)
      setTimeout(() => setPushResult(null), 5000)
    }
  }, [session, comments, commentsFilePath])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const updatedComments = comments.filter(c => c.id !== commentId)
    setComments(updatedComments)
    await window.fs.writeFile(commentsFilePath, JSON.stringify(updatedComments, null, 2))
  }, [comments, commentsFilePath])

  const handleOpenPrUrl = useCallback(() => {
    if (session.prUrl) {
      window.open(session.prUrl, '_blank')
    }
  }, [session.prUrl])

  const handleExplainIssue = useCallback(async (issueId: string) => {
    if (!session.agentPtyId) {
      setError('No agent terminal found. Wait for the agent to start.')
      return
    }
    const issue = state.reviewData?.potentialIssues.find(i => i.id === issueId)
    if (!issue) return
    try {
      await sendAgentPrompt(session.agentPtyId, broomyDir, 'explain-prompt.md', buildExplainPrompt(issue))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [session, state.reviewData, broomyDir, setError])

  const handleAddComment = useCallback(async (file: string, line: number, body: string) => {
    const newComment: PendingComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      file,
      line,
      body,
      createdAt: new Date().toISOString(),
    }

    try {
      let allComments: PendingComment[] = []
      try {
        const exists = await window.fs.exists(commentsFilePath)
        if (exists) {
          const data = await window.fs.readFile(commentsFilePath)
          allComments = JSON.parse(data)
        }
      } catch {
        // Start fresh
      }

      allComments.push(newComment)
      await window.fs.mkdir(broomyDir)
      await window.fs.writeFile(commentsFilePath, JSON.stringify(allComments, null, 2))
      setComments(allComments)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [commentsFilePath, broomyDir, setComments, setError])

  const handleDraftResponsePlan = useCallback(async () => {
    if (!session.agentPtyId) {
      setError('No agent terminal found. Wait for the agent to start.')
      return
    }
    if (!state.reviewData) return
    try {
      const prComments = state.prGitHubComments.map(c => ({ body: c.body, author: c.author, path: c.path, line: c.line }))
      await sendAgentPrompt(session.agentPtyId, broomyDir, 'response-plan-prompt.md', buildResponsePlanPrompt(state.reviewData, prComments))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [session, state.reviewData, broomyDir, setError])

  const handleClickLocation = useCallback((location: CodeLocation) => {
    const fullPath = location.file.startsWith('/')
      ? location.file
      : `${session.directory}/${location.file}`
    // Use merge-base SHA for correct PR diffs (matches what GitHub shows)
    const diffRef = mergeBase || `origin/${session.prBaseBranch || 'main'}`
    onSelectFile(fullPath, true, location.startLine, diffRef)
  }, [session.directory, session.prBaseBranch, mergeBase, onSelectFile])

  return {
    handleGenerateReview,
    handlePushComments,
    handleDeleteComment,
    handleOpenPrUrl,
    handleClickLocation,
    handleExplainIssue,
    handleAddComment,
    handleDraftResponsePlan,
    handleGitignoreAdd,
    handleGitignoreContinue,
    handleGitignoreCancel,
  }
}
