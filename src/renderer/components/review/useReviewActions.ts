/**
 * Hook providing action handlers for review generation and gitignore management.
 */
import { useCallback } from 'react'
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'
import { buildMarkdownReviewPrompt } from '../../utils/reviewPromptBuilder'
import { ensureOutputGitignore } from '../../utils/commandsConfig'
import type { ReviewDataState } from './useReviewData'

export interface ReviewActions {
  handleWritePrompt: (builder: string, outputPath: string) => Promise<void>
  handleOpenPrUrl: () => void
}

export function useReviewActions(
  session: Session,
  repo: ManagedRepo | undefined,
  _onSelectFile: (filePath: string, openInDiffMode: boolean, scrollToLine?: number, diffBaseRef?: string) => void,
  state: ReviewDataState,
): ReviewActions {
  const {
    broomyDir, outputDir, promptFilePath,
    setFetching, setWaitingForAgent, setFetchingStatus,
    setError,
  } = state

  const handleWritePrompt = useCallback(async (builder: string, outputPath: string) => {
    if (builder !== 'review') return

    setFetching(true)
    setError(null)

    try {
      // Ensure .broomy/output is gitignored
      await ensureOutputGitignore(session.directory)

      // Fetch the base branch so origin/<base> is up-to-date for the diff
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

      // Create .broomy/output directory
      await window.fs.mkdir(broomyDir)
      await window.fs.mkdir(outputDir)

      // Fetch previous head commit for re-review detection
      let previousHeadCommit: string | undefined
      try {
        const historyFilePath = `${broomyDir}/review-history.json`
        const historyExists = await window.fs.exists(historyFilePath)
        if (historyExists) {
          const content = await window.fs.readFile(historyFilePath)
          const history = JSON.parse(content) as { reviews: { headCommit: string }[] }
          if (history.reviews.length > 0) {
            previousHeadCommit = history.reviews[0].headCommit
          }
        }
      } catch {
        // Non-fatal
      }

      // Fetch PR description if available
      let prDescription: string | undefined
      if (session.prNumber) {
        try {
          const body = await window.gh.prDescription(session.directory, session.prNumber)
          if (body) prDescription = body
        } catch {
          // Non-fatal
        }
      }

      // Build the markdown review prompt
      const reviewInstructions = repo?.reviewInstructions || ''
      const prompt = buildMarkdownReviewPrompt(session, reviewInstructions, {
        previousHeadCommit,
        prDescription,
      })

      // Write the prompt file
      await window.fs.writeFile(outputPath || promptFilePath, prompt)

      // Write context for the skill
      await window.fs.writeFile(`${outputDir}/context.json`, JSON.stringify({
        prNumber: session.prNumber,
        prBaseBranch: session.prBaseBranch || 'main',
        prUrl: session.prUrl,
      }, null, 2))

      setFetchingStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFetching(false)
      setWaitingForAgent(false)
      setFetchingStatus(null)
    }
  }, [session, repo?.reviewInstructions, broomyDir, outputDir, promptFilePath])

  const handleOpenPrUrl = useCallback(() => { if (session.prUrl) _onSelectFile(session.prUrl, false) }, [session.prUrl, _onSelectFile])

  return {
    handleWritePrompt,
    handleOpenPrUrl,
  }
}
