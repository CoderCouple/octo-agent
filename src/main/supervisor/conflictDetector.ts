/**
 * Conflict detector: tracks file ownership per session.
 * Emits conflict events when two sessions edit the same file.
 * Records file change history for audit trail.
 */

interface FileOwnership {
  sessionId: string
  firstSeen: number
  lastSeen: number
  changeCount: number
}

/** Map of filePath -> FileOwnership */
const fileOwners = new Map<string, FileOwnership>()

/** Map of sessionId -> Set<filePath> for quick session lookup */
const sessionFiles = new Map<string, Set<string>>()

/** History of detected conflicts */
const conflictHistory: Array<{
  filePath: string
  sessionA: string
  sessionB: string
  timestamp: number
}> = []

/**
 * Record a file being edited by a session.
 * Returns conflicting sessionIds if the file is owned by another session.
 */
export function record(sessionId: string, filePath: string): string[] {
  const owner = fileOwners.get(filePath)

  if (owner && owner.sessionId !== sessionId) {
    // Conflict detected
    conflictHistory.push({
      filePath,
      sessionA: owner.sessionId,
      sessionB: sessionId,
      timestamp: Date.now(),
    })
    return [owner.sessionId]
  }

  // Update or create ownership
  if (owner && owner.sessionId === sessionId) {
    owner.lastSeen = Date.now()
    owner.changeCount++
  } else {
    fileOwners.set(filePath, {
      sessionId,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      changeCount: 1,
    })
  }

  // Track in session -> files map
  let files = sessionFiles.get(sessionId)
  if (!files) {
    files = new Set()
    sessionFiles.set(sessionId, files)
  }
  files.add(filePath)

  return []
}

/** Clear all file ownership for a session (e.g. on session close). */
export function clearSession(sessionId: string): void {
  const files = sessionFiles.get(sessionId)
  if (files) {
    for (const path of files) {
      const owner = fileOwners.get(path)
      if (owner?.sessionId === sessionId) {
        fileOwners.delete(path)
      }
    }
    sessionFiles.delete(sessionId)
  }
}

/** Get all files owned by a session. */
export function getSessionFiles(sessionId: string): string[] {
  return [...(sessionFiles.get(sessionId) ?? [])]
}

/** Get ownership info for a file. */
export function getFileOwner(filePath: string): FileOwnership | undefined {
  return fileOwners.get(filePath)
}

/** Get all files with active ownership. */
export function getAllOwnedFiles(): Map<string, FileOwnership> {
  return new Map(fileOwners)
}

/** Check if a file would conflict with any active session. */
export function wouldConflict(sessionId: string, filePath: string): string | null {
  const owner = fileOwners.get(filePath)
  if (owner && owner.sessionId !== sessionId) {
    return owner.sessionId
  }
  return null
}

/** Get conflict history. */
export function getConflictHistory(): typeof conflictHistory {
  return [...conflictHistory]
}

/** Get conflicts for a specific session. */
export function getSessionConflicts(sessionId: string): typeof conflictHistory {
  return conflictHistory.filter(
    (c) => c.sessionA === sessionId || c.sessionB === sessionId,
  )
}
