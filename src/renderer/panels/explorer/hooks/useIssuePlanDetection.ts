/**
 * Watches for the existence of a `.broomy/output/plan.md` file in a session's directory.
 */
import { useState, useEffect } from 'react'

/**
 * Watches for the existence of `.broomy/output/plan.md` in a session's directory.
 * Checks on mount and watches the parent directory for changes.
 */
export function useIssuePlanDetection(
  sessionId: string | null | undefined,
  directory: string | undefined,
): boolean {
  const [issuePlanExists, setIssuePlanExists] = useState(false)

  useEffect(() => {
    if (!sessionId || !directory) {
      setIssuePlanExists(false)
      return
    }

    const planPath = `${directory}/.broomy/output/plan.md`
    const watchDir = `${directory}/.broomy/output`
    const watcherId = `issue-plan-${sessionId}`

    // Initial check
    void window.fs.exists(planPath).then(setIssuePlanExists)

    // Watch the output directory for changes
    void window.fs.watch(watcherId, watchDir)
    const removeListener = window.fs.onChange(watcherId, (event) => {
      if (event.filename === 'plan.md' || event.filename === null) {
        void window.fs.exists(planPath).then(setIssuePlanExists)
      }
    })

    return () => {
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [sessionId, directory])

  return issuePlanExists
}
