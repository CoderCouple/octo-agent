/**
 * Promise chain queue — guarantees one active run per session.
 * Invariant #2: Never bypass the queue.
 */

type Task<T> = () => Promise<T>

export class SessionQueue {
  private queues = new Map<string, Promise<void>>()

  /** Enqueue a task for a session. It runs after all prior tasks for that session complete. */
  enqueue<T>(sessionId: string, task: Task<T>): Promise<T> {
    const prev = this.queues.get(sessionId) ?? Promise.resolve()
    const next = prev.then(() => task()).catch((err) => {
      console.error(`[SessionQueue] Task failed for session ${sessionId}:`, err)
      throw err
    })
    // Store the chain (void-ified to avoid holding results in memory)
    this.queues.set(sessionId, next.then(() => {}, () => {}))
    return next
  }

  /** Clear the queue for a session (e.g. on session close). */
  clear(sessionId: string): void {
    this.queues.delete(sessionId)
  }
}
