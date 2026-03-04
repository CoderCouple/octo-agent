import { describe, it, expect, vi, beforeEach } from 'vitest'
import { E2EScenario, type HandlerContext } from './types'

// Mock devcontainer functions
const mockIsCliAvailable = vi.fn()
const mockHasConfig = vi.fn()
const mockWriteConfig = vi.fn()
vi.mock('../devcontainer', () => ({
  isDevcontainerCliAvailable: (...args: unknown[]) => mockIsCliAvailable(...args),
  hasDevcontainerConfig: (...args: unknown[]) => mockHasConfig(...args),
  writeDefaultDevcontainerConfig: (...args: unknown[]) => mockWriteConfig(...args),
}))

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    e2eScenario: E2EScenario.Default,
    isDev: false,
    isWindows: false,
    ptyProcesses: new Map(),
    ptyOwnerWindows: new Map(),
    fileWatchers: new Map(),
    watcherOwnerWindows: new Map(),
    profileWindows: new Map(),
    mainWindow: null,
    E2E_MOCK_SHELL: undefined,
    FAKE_CLAUDE_SCRIPT: undefined,
    dockerContainers: new Map(),
    ...overrides,
  } as HandlerContext
}

describe('devcontainer handlers', () => {
  let handlers: Record<string, Function>
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  const mockEvent = { sender: { id: 1 } }

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
  })

  describe('devcontainer:status', () => {
    it('returns mock data in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      const result = await handlers['devcontainer:status'](mockEvent)
      expect(result).toEqual({ available: true, version: '0.71.0' })
    })

    it('calls isDevcontainerCliAvailable in normal mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx())

      mockIsCliAvailable.mockResolvedValue({ available: true, version: '0.72.0' })
      const result = await handlers['devcontainer:status'](mockEvent)
      expect(result).toEqual({ available: true, version: '0.72.0' })
    })
  })

  describe('devcontainer:hasConfig', () => {
    it('returns false in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      const result = await handlers['devcontainer:hasConfig'](mockEvent, '/workspace')
      expect(result).toBe(false)
    })

    it('delegates to hasDevcontainerConfig in normal mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx())

      mockHasConfig.mockReturnValue(true)
      const result = await handlers['devcontainer:hasConfig'](mockEvent, '/workspace')
      expect(result).toBe(true)
      expect(mockHasConfig).toHaveBeenCalledWith('/workspace')
    })
  })

  describe('devcontainer:generateDefaultConfig', () => {
    it('does nothing in E2E mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx({ isE2ETest: true }))

      await handlers['devcontainer:generateDefaultConfig'](mockEvent, '/workspace')
      expect(mockWriteConfig).not.toHaveBeenCalled()
    })

    it('calls writeDefaultDevcontainerConfig in normal mode', async () => {
      const { register } = await import('./devcontainer')
      register(mockIpcMain as never, createCtx())

      await handlers['devcontainer:generateDefaultConfig'](mockEvent, '/workspace')
      expect(mockWriteConfig).toHaveBeenCalledWith('/workspace')
    })
  })
})
