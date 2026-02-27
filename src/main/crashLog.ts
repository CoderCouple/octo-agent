/**
 * Crash log persistence — writes/reads JSON crash reports to ~/.broomy/crash-reports/.
 */
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { CONFIG_DIR } from './handlers/types'

export type CrashReport = {
  timestamp: string
  message: string
  stack: string | null
  electronVersion: string
  appVersion: string
  platform: string
  processType: 'main' | 'renderer'
}

const CRASH_DIR = join(CONFIG_DIR, 'crash-reports')

function ensureCrashDir(): void {
  mkdirSync(CRASH_DIR, { recursive: true })
}

export function writeCrashLog(error: unknown, processType: 'main' | 'renderer'): string {
  ensureCrashDir()
  const report: CrashReport = {
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    electronVersion: process.versions.electron || 'unknown',
    appVersion: app.isReady() ? app.getVersion() : 'unknown',
    platform: process.platform,
    processType,
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

export function buildCrashReportUrl(report: CrashReport): string {
  const title = `Crash: ${report.message.slice(0, 80)}`
  const body = [
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
    report.stack ?? 'No stack trace available',
    '```',
  ].join('\n')
  const params = new URLSearchParams({ title, body, labels: 'bug,crash' })
  return `https://github.com/Broomy-AI/broomy/issues/new?${params.toString()}`
}
