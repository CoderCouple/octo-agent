/**
 * Watches the git directory for HEAD changes in each non-archived session to
 * detect branch switches without polling.
 *
 * Handles both regular repos (.git is a directory) and worktrees (.git is a
 * file pointing to the real git dir). Silently skips sessions where the git
 * directory can't be determined or watched.
 */
import { useEffect, useMemo } from 'react'
import type { Session } from '../store/sessions'

interface UseGitBranchWatcherArgs {
  sessions: Session[]
  updateSessionBranch: (id: string, branch: string) => void
}

/**
 * Resolve the actual git directory to watch.
 * - Regular repo: .git is a directory → watch it directly
 * - Worktree: .git is a file containing "gitdir: <path>" → watch that path
 * - Missing: returns null
 */
async function resolveGitDir(sessionDir: string): Promise<string | null> {
  const dotGit = `${sessionDir}/.git`

  // Check if .git exists at all
  const exists = await window.fs.exists(dotGit)
  if (!exists) return null

  // Try reading .git as a file (worktree case)
  try {
    const content = await window.fs.readFile(dotGit)
    // Worktree .git files contain: "gitdir: /absolute/path/to/.git/worktrees/name"
    const match = /^gitdir:\s*(.+)$/.exec(content.trim())
    if (match?.[1]) {
      const gitDir = match[1]
      const gitDirExists = await window.fs.exists(gitDir)
      return gitDirExists ? gitDir : null
    }
  } catch {
    // readFile failed → .git is a directory (normal repo), use it directly
  }

  return dotGit
}

export function useGitBranchWatcher({ sessions, updateSessionBranch }: UseGitBranchWatcherArgs) {
  // Stable key: only re-run when session IDs/directories/archived status change
  const watchKey = useMemo(
    () => sessions.filter(s => !s.isArchived).map(s => `${s.id}:${s.directory}`).join(','),
    [sessions],
  )

  useEffect(() => {
    const activeSessions = sessions.filter(s => !s.isArchived)
    if (activeSessions.length === 0) return

    const cleanups: (() => void)[] = []
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
    let cancelled = false

    const setupWatchers = async () => {
      for (const session of activeSessions) {
        if (cancelled) return

        const gitDir = await resolveGitDir(session.directory)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled may change during async iteration
        if (!gitDir || cancelled) continue

        const watcherId = `git-head-${session.id}`

        // Register listener before watching (synchronous)
        const removeListener = window.fs.onChange(watcherId, (event) => {
          if (event.filename && event.filename !== 'HEAD') return

          const existing = debounceTimers.get(session.id)
          if (existing) clearTimeout(existing)
          debounceTimers.set(session.id, setTimeout(() => {
            void (async () => {
              try {
                const branch = await window.git.getBranch(session.directory)
                if (branch !== session.branch) {
                  updateSessionBranch(session.id, branch)
                }
              } catch {
                // Ignore errors (e.g. directory deleted)
              }
            })()
          }, 300))
        })

        const result = await window.fs.watch(watcherId, gitDir)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled may change during async iteration
        if (cancelled) {
          removeListener()
          if (result.success) void window.fs.unwatch(watcherId)
          return
        }

        if (!result.success) {
          removeListener()
          continue
        }

        cleanups.push(() => {
          removeListener()
          void window.fs.unwatch(watcherId)
          const timer = debounceTimers.get(session.id)
          if (timer) clearTimeout(timer)
        })
      }
    }

    void setupWatchers()

    return () => {
      cancelled = true
      for (const cleanup of cleanups) cleanup()
    }
  }, [watchKey, sessions, updateSessionBranch])
}
