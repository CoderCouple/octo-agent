import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => '{}'),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.0.0'), isReady: vi.fn(() => true) },
}))

vi.mock('./handlers/types', () => ({
  CONFIG_DIR: '/mock/.broomy',
}))

import { writeCrashLog, readLatestCrashLog, deleteCrashLog, buildCrashReportUrl, type CrashReport } from './crashLog'

const CRASH_DIR = '/mock/.broomy/crash-reports'

describe('crashLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('writeCrashLog', () => {
    it('creates crash directory and writes JSON file', () => {
      const error = new Error('test crash')
      error.stack = 'Error: test crash\n    at test.ts:1'

      const path = writeCrashLog(error, 'main')

      expect(mkdirSync).toHaveBeenCalledWith(CRASH_DIR, { recursive: true })
      expect(writeFileSync).toHaveBeenCalledWith(
        join(CRASH_DIR, 'crash-1700000000000.json'),
        expect.stringContaining('"message": "test crash"'),
      )
      expect(path).toBe(join(CRASH_DIR, 'crash-1700000000000.json'))
    })

    it('handles non-Error values', () => {
      writeCrashLog('string error', 'renderer')

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"message": "string error"'),
      )
    })

    it('includes platform and version info in the report', () => {
      writeCrashLog(new Error('test'), 'main')

      const written = vi.mocked(writeFileSync).mock.calls[0][1] as string
      const report = JSON.parse(written) as CrashReport
      expect(report.platform).toBe(process.platform)
      expect(report.appVersion).toBe('1.0.0')
      expect(report.processType).toBe('main')
    })
  })

  describe('readLatestCrashLog', () => {
    it('returns null when no crash files exist', () => {
      vi.mocked(readdirSync).mockReturnValue([])
      expect(readLatestCrashLog()).toBeNull()
    })

    it('returns the latest crash file sorted alphabetically', () => {
      vi.mocked(readdirSync).mockReturnValue([
        'crash-1700000000000.json',
        'crash-1700000001000.json',
      ] as unknown as ReturnType<typeof readdirSync>)
      const report: CrashReport = {
        timestamp: '2023-11-14T00:00:01.000Z',
        message: 'latest crash',
        stack: null,
        electronVersion: '28.0.0',
        appVersion: '1.0.0',
        platform: 'darwin',
        processType: 'main',
      }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(report))

      const result = readLatestCrashLog()

      expect(result).not.toBeNull()
      expect(result!.report.message).toBe('latest crash')
      expect(result!.path).toBe(join(CRASH_DIR, 'crash-1700000001000.json'))
    })

    it('returns null on read errors', () => {
      vi.mocked(readdirSync).mockImplementation(() => { throw new Error('ENOENT') })
      expect(readLatestCrashLog()).toBeNull()
    })
  })

  describe('deleteCrashLog', () => {
    it('deletes the specified file', () => {
      deleteCrashLog('/mock/.broomy/crash-reports/crash-123.json')
      expect(unlinkSync).toHaveBeenCalledWith('/mock/.broomy/crash-reports/crash-123.json')
    })

    it('silently ignores errors', () => {
      vi.mocked(unlinkSync).mockImplementation(() => { throw new Error('ENOENT') })
      expect(() => deleteCrashLog('/nonexistent')).not.toThrow()
    })
  })

  describe('buildCrashReportUrl', () => {
    it('returns a GitHub issue URL with pre-filled fields', () => {
      const report: CrashReport = {
        timestamp: '2023-11-14T00:00:00.000Z',
        message: 'Something broke',
        stack: 'Error: Something broke\n    at main.ts:42',
        electronVersion: '28.0.0',
        appVersion: '1.0.0',
        platform: 'darwin',
        processType: 'main',
      }

      const url = buildCrashReportUrl(report)

      expect(url).toContain('https://github.com/Broomy-AI/broomy/issues/new')
      expect(url).toContain('title=')
      expect(url).toContain('Something+broke')
      expect(url).toContain('labels=bug')
    })
  })
})
