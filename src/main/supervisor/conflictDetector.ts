/**
 * Conflict detector stub — tracks file ownership per session.
 * Full implementation in Phase 5.
 */

/** Map of filePath → sessionId that "owns" it. */
const fileOwners = new Map<string, string>()

/**
 * Record a file being edited by a session.
 * Returns conflicting sessionIds if the file is owned by another session.
 */
export function record(sessionId: string, filePath: string): string[] {
  const owner = fileOwners.get(filePath)
  if (owner && owner !== sessionId) {
    return [owner]
  }
  fileOwners.set(filePath, sessionId)
  return []
}

/** Clear all file ownership for a session (e.g. on session close). */
export function clearSession(sessionId: string): void {
  for (const [path, owner] of fileOwners) {
    if (owner === sessionId) fileOwners.delete(path)
  }
}

/** Get all files owned by a session. */
export function getSessionFiles(sessionId: string): string[] {
  const files: string[] = []
  for (const [path, owner] of fileOwners) {
    if (owner === sessionId) files.push(path)
  }
  return files
}
