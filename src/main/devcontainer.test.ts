/**
 * Unit tests for devcontainer CLI wrapper functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateDefaultDevcontainerJson, buildDevcontainerExecArgs, devcontainerSetupMessage, isDevcontainerCliAvailable, hasDevcontainerConfig, writeDefaultDevcontainerConfig } from './devcontainer'

// We need to mock execFile as a callback-style function that promisify will wrap
const mockExecFile = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
  spawn: vi.fn(),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import { existsSync, mkdirSync, writeFileSync } from 'fs'

describe('devcontainer', () => {
  describe('generateDefaultDevcontainerJson', () => {
    it('returns a valid devcontainer config with base image and features', () => {
      const config = generateDefaultDevcontainerJson()
      expect(config.image).toBe('mcr.microsoft.com/devcontainers/base:ubuntu')
      expect(config.features).toBeDefined()
      expect(config.features['ghcr.io/devcontainers/features/node:1']).toEqual({})
      expect(config.features['ghcr.io/devcontainers/features/git:1']).toEqual({})
      expect(config.features['ghcr.io/devcontainers/features/github-cli:1']).toEqual({})
    })
  })

  describe('buildDevcontainerExecArgs', () => {
    it('builds args for interactive shell', () => {
      const args = buildDevcontainerExecArgs('abc123', 'vscode', '/workspace', {})
      expect(args).toEqual([
        'exec', '-it', '-u', 'vscode', '-w', '/workspace',
        'abc123', 'bash', '-l',
      ])
    })

    it('builds args with command', () => {
      const args = buildDevcontainerExecArgs('abc123', 'vscode', '/workspace', {}, 'claude')
      expect(args).toEqual([
        'exec', '-it', '-u', 'vscode', '-w', '/workspace',
        'abc123', 'bash', '-l', '-c', 'claude',
      ])
    })

    it('uses specified remote user', () => {
      const args = buildDevcontainerExecArgs('abc123', 'root', '/workspace', {})
      expect(args).toContain('-u')
      const userIndex = args.indexOf('-u')
      expect(args[userIndex + 1]).toBe('root')
    })

    it('passes environment variables', () => {
      const args = buildDevcontainerExecArgs('abc123', 'vscode', '/workspace', {
        ANTHROPIC_API_KEY: 'sk-123',
        NODE_ENV: 'development',
      })
      expect(args).toContain('-e')
      expect(args).toContain('ANTHROPIC_API_KEY=sk-123')
      expect(args).toContain('NODE_ENV=development')
    })
  })

  describe('devcontainerSetupMessage', () => {
    it('returns a message with install instructions', () => {
      const msg = devcontainerSetupMessage({ available: false, error: 'devcontainer CLI is not installed' })
      expect(msg).toContain('Dev Container CLI required')
      expect(msg).toContain('npm install -g @devcontainers/cli')
      expect(msg).toContain('devcontainer CLI is not installed')
    })

    it('handles missing error message', () => {
      const msg = devcontainerSetupMessage({ available: false })
      expect(msg).toContain('devcontainer CLI is not available')
    })
  })

  describe('isDevcontainerCliAvailable', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('returns not available with ENOENT error', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('spawn devcontainer ENOENT'))
      })

      const result = await isDevcontainerCliAvailable()
      expect(result.available).toBe(false)
      expect(result.error).toBe('devcontainer CLI is not installed')
    })

    it('returns not available with generic error', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('something went wrong'))
      })

      const result = await isDevcontainerCliAvailable()
      expect(result.available).toBe(false)
      expect(result.error).toBe('something went wrong')
    })

    it('returns not available with not found error', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('not found'))
      })

      const result = await isDevcontainerCliAvailable()
      expect(result.available).toBe(false)
      expect(result.error).toBe('devcontainer CLI is not installed')
    })
  })

  describe('hasDevcontainerConfig', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReset()
    })

    it('returns true when .devcontainer/devcontainer.json exists', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('.devcontainer/devcontainer.json')
      })
      expect(hasDevcontainerConfig('/workspace')).toBe(true)
    })

    it('returns true when .devcontainer.json exists', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith('.devcontainer.json')
      })
      expect(hasDevcontainerConfig('/workspace')).toBe(true)
    })

    it('returns false when no config exists', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      expect(hasDevcontainerConfig('/workspace')).toBe(false)
    })
  })

  describe('writeDefaultDevcontainerConfig', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReset()
      vi.mocked(mkdirSync).mockReset()
      vi.mocked(writeFileSync).mockReset()
    })

    it('creates .devcontainer dir and writes config', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      writeDefaultDevcontainerConfig('/workspace')

      expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.devcontainer'), { recursive: true })
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('devcontainer.json'),
        expect.stringContaining('mcr.microsoft.com/devcontainers/base:ubuntu'),
      )
    })

    it('skips mkdir if .devcontainer already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      writeDefaultDevcontainerConfig('/workspace')

      expect(mkdirSync).not.toHaveBeenCalled()
      expect(writeFileSync).toHaveBeenCalled()
    })
  })
})
