/**
 * Sleep guard: prevents macOS from sleeping while agents are active.
 * Spawns `caffeinate -di` (prevent display + idle sleep) when at least
 * one session is active, kills it when all are idle/done.
 */
import { spawn, type ChildProcess } from 'child_process'

let caffeinateProc: ChildProcess | null = null
let activeCount = 0

/** Increment active session count. Spawns caffeinate if transitioning from 0. */
export function agentActivated(): void {
  activeCount++
  if (activeCount === 1 && !caffeinateProc) {
    try {
      caffeinateProc = spawn('caffeinate', ['-di'], {
        stdio: 'ignore',
        detached: false,
      })
      caffeinateProc.on('error', (err) => {
        console.error('[SleepGuard] caffeinate error:', err.message)
        caffeinateProc = null
      })
      caffeinateProc.on('exit', () => {
        caffeinateProc = null
      })
      console.log(`[SleepGuard] caffeinate started (pid ${caffeinateProc.pid})`)
    } catch (err) {
      console.error('[SleepGuard] Failed to spawn caffeinate:', err)
    }
  }
}

/** Decrement active session count. Kills caffeinate when reaching 0. */
export function agentDeactivated(): void {
  activeCount = Math.max(0, activeCount - 1)
  if (activeCount === 0) {
    killCaffeinate()
  }
}

/** Force-kill caffeinate and reset state. Call on app quit. */
export function killCaffeinate(): void {
  if (caffeinateProc) {
    try {
      caffeinateProc.kill('SIGTERM')
      console.log('[SleepGuard] caffeinate stopped')
    } catch {
      // Already dead
    }
    caffeinateProc = null
  }
  activeCount = 0
}

/** Check if caffeinate is currently running. */
export function isActive(): boolean {
  return caffeinateProc !== null
}
