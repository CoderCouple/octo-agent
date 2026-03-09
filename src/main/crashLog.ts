/**
 * Crash log persistence — writes/reads JSON crash reports to ~/.broomy/crash-reports/.
 *
 * Uses a pidfile (running.pid) to detect unclean shutdowns: written on launch,
 * deleted on clean exit. If it exists on next launch, we know we crashed.
 *
 * macOS native crash reports (.ips files in ~/Library/Logs/DiagnosticReports/)
 * are only read when the user explicitly clicks "Report Issue", to avoid
 * accessing system directories unnecessarily.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { CONFIG_DIR } from './handlers/types'

export type ErrorLogEntry = {
  timestamp: string
  source: string
  message: string
}

export type CrashReport = {
  timestamp: string
  message: string
  stack: string | null
  electronVersion: string
  appVersion: string
  platform: string
  processType: 'main' | 'renderer'
  recentErrors?: ErrorLogEntry[]
}

const CRASH_DIR = join(CONFIG_DIR, 'crash-reports')
const RUNNING_PID_FILE = join(CRASH_DIR, 'running.pid')
const MAX_ERROR_LOG_ENTRIES = 50

/** In-memory ring buffer of recent error-level log messages. */
const recentErrors: ErrorLogEntry[] = []

export function appendErrorLog(source: string, message: string): void {
  recentErrors.push({
    timestamp: new Date().toISOString(),
    source,
    message: message.length > 500 ? `${message.slice(0, 500)}…` : message,
  })
  if (recentErrors.length > MAX_ERROR_LOG_ENTRIES) {
    recentErrors.splice(0, recentErrors.length - MAX_ERROR_LOG_ENTRIES)
  }
}

export function getRecentErrors(): ErrorLogEntry[] {
  return [...recentErrors]
}

function ensureCrashDir(): void {
  mkdirSync(CRASH_DIR, { recursive: true })
}

export function writeCrashLog(error: unknown, processType: 'main' | 'renderer'): string {
  ensureCrashDir()
  const errors = getRecentErrors()
  const report: CrashReport = {
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    electronVersion: process.versions.electron || 'unknown',
    appVersion: app.isReady() ? app.getVersion() : 'unknown',
    platform: process.platform,
    processType,
    ...(errors.length > 0 ? { recentErrors: errors } : {}),
  }
  const filename = `crash-${Date.now()}.json`
  const filepath = join(CRASH_DIR, filename)
  writeFileSync(filepath, JSON.stringify(report, null, 2))
  return filepath
}

export function readLatestCrashLog(): { report: CrashReport; path: string } | null {
  try {
    const files = readdirSync(CRASH_DIR)
      .filter(f => f.startsWith('crash-') && f.endsWith('.json'))
      .sort()
    if (files.length === 0) return null
    const latest = files[files.length - 1]
    const filepath = join(CRASH_DIR, latest)
    const report = JSON.parse(readFileSync(filepath, 'utf-8')) as CrashReport
    return { report, path: filepath }
  } catch {
    return null
  }
}

export function deleteCrashLog(filepath: string): void {
  try {
    unlinkSync(filepath)
  } catch {
    // already deleted or inaccessible — ignore
  }
}

export function deleteAllCrashLogs(): void {
  try {
    const files = readdirSync(CRASH_DIR).filter(
      f => f.startsWith('crash-') && f.endsWith('.json'),
    )
    for (const file of files) {
      try {
        unlinkSync(join(CRASH_DIR, file))
      } catch {
        // ignore individual failures
      }
    }
  } catch {
    // directory doesn't exist or inaccessible — ignore
  }
}

export function buildCrashReportUrl(report: CrashReport): string {
  const title = `Crash: ${report.message.slice(0, 80)}`

  const stackTrace = report.stack ?? 'No stack trace available'
  // Try to enrich with native crash data from macOS DiagnosticReports
  const nativeTrace = findNativeCrashTrace(report.timestamp)

  const lines = [
    '## Crash Report',
    '',
    `**Timestamp:** ${report.timestamp}`,
    `**Process:** ${report.processType}`,
    `**Platform:** ${report.platform}`,
    `**App Version:** ${report.appVersion}`,
    `**Electron:** ${report.electronVersion}`,
    '',
    '### Stack Trace',
    '```',
    stackTrace,
    '```',
  ]

  if (nativeTrace) {
    lines.push(
      '',
      '### Native Crash Trace',
      '```',
      nativeTrace,
      '```',
    )
  }

  if (report.recentErrors && report.recentErrors.length > 0) {
    lines.push('', '### Recent Errors', '```')
    for (const entry of report.recentErrors.slice(-20)) {
      lines.push(`[${entry.timestamp}] [${entry.source}] ${entry.message}`)
    }
    lines.push('```')
  }

  const body = lines.join('\n')
  const params = new URLSearchParams({ title, body, labels: 'bug,crash' })
  return `https://github.com/Broomy-AI/broomy/issues/new?${params.toString()}`
}

// --- Pidfile-based crash detection ---

/**
 * Write a pidfile on launch. If this file exists on the next launch,
 * we know the previous session didn't exit cleanly.
 */
export function markRunning(): void {
  ensureCrashDir()
  writeFileSync(RUNNING_PID_FILE, String(process.pid))
}

/** Remove the pidfile on clean exit. */
export function markCleanExit(): void {
  try {
    unlinkSync(RUNNING_PID_FILE)
  } catch {
    // ignore
  }
}

/**
 * Check if the previous session crashed (pidfile still exists).
 * If so, write a crash log so the recovery banner picks it up,
 * then remove the stale pidfile.
 */
export function checkForUncleanShutdown(): void {
  try {
    const pid = readFileSync(RUNNING_PID_FILE, 'utf-8').trim()
    // Pidfile exists — previous session didn't exit cleanly.
    // Only write a crash log if we don't already have one (e.g. from uncaughtException).
    if (!readLatestCrashLog()) {
      ensureCrashDir()
      const report: CrashReport = {
        timestamp: new Date().toISOString(),
        message: `Unexpected shutdown (previous PID: ${pid})`,
        stack: null,
        electronVersion: process.versions.electron || 'unknown',
        appVersion: app.isReady() ? app.getVersion() : 'unknown',
        platform: process.platform,
        processType: 'main',
      }
      const filename = `crash-${Date.now()}.json`
      writeFileSync(join(CRASH_DIR, filename), JSON.stringify(report, null, 2))
    }
    // Clean up the stale pidfile
    unlinkSync(RUNNING_PID_FILE)
  } catch {
    // No pidfile or read error — previous session exited cleanly (or first run)
  }
}

// --- macOS native crash report lookup (on-demand only) ---

/** Max frames to include from the crashed thread. */
const MAX_CRASH_FRAMES = 15

/**
 * Search macOS DiagnosticReports for a Broomy .ips crash file close to the
 * given crash timestamp. Only called when the user clicks "Report Issue".
 * Returns a trimmed native stack trace string, or null if not found.
 */
function findNativeCrashTrace(crashTimestamp: string): string | null {
  if (process.platform !== 'darwin') return null

  try {
    const diagDir = join(homedir(), 'Library', 'Logs', 'DiagnosticReports')
    const files = readdirSync(diagDir).filter(f => f.startsWith('Broomy-') && f.endsWith('.ips'))
    if (files.length === 0) return null

    // Find the .ips file closest to the crash timestamp
    const crashTime = new Date(crashTimestamp).getTime()
    let bestFile: string | null = null
    let bestDelta = Infinity

    for (const file of files) {
      try {
        const stat = statSync(join(diagDir, file))
        const delta = Math.abs(stat.mtimeMs - crashTime)
        // Only consider files within 5 minutes of the crash
        if (delta < 5 * 60 * 1000 && delta < bestDelta) {
          bestDelta = delta
          bestFile = file
        }
      } catch {
        continue
      }
    }

    if (!bestFile) return null

    return parseIpsCrashTrace(join(diagDir, bestFile))
  } catch {
    return null
  }
}

/**
 * Parse a macOS .ips crash report and extract a summary of the crashed thread.
 */
function parseIpsCrashTrace(filepath: string): string | null {
  try {
    const raw = readFileSync(filepath, 'utf-8')

    // .ips format: first line is JSON metadata, rest is JSON body
    const newlineIdx = raw.indexOf('\n')
    if (newlineIdx === -1) return null

    const body = JSON.parse(raw.slice(newlineIdx + 1))
    const exception = body.exception || {}
    const termination = body.termination || {}

    const threads: { triggered?: boolean; name?: string; frames?: { symbol?: string; imageOffset?: number }[] }[] = body.threads || []
    const crashedThread = threads.find(t => t.triggered)
    if (!crashedThread) return null

    const frameLines = (crashedThread.frames || []).slice(0, MAX_CRASH_FRAMES).map((f, i) =>
      `  ${i}: ${f.symbol || `<unknown> +${f.imageOffset || 0}`}`
    )

    const signal = exception.signal || 'unknown signal'
    const indicator = termination.indicator || exception.type || ''

    return [
      `Signal: ${signal}${indicator ? ` (${indicator})` : ''}`,
      `Thread: ${crashedThread.name || 'unknown'}`,
      ...frameLines,
    ].join('\n')
  } catch {
    return null
  }
}
