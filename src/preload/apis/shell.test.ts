import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
}))

import { shellApi, dialogApi, appApi, windowControlsApi } from './shell'

describe('preload shell API', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined)
  })

  describe('shellApi', () => {
    it('exec invokes shell:exec', async () => {
      await shellApi.exec('ls', '/test')
      expect(mockInvoke).toHaveBeenCalledWith('shell:exec', 'ls', '/test')
    })

    it('openExternal invokes shell:openExternal', async () => {
      await shellApi.openExternal('https://example.com')
      expect(mockInvoke).toHaveBeenCalledWith('shell:openExternal', 'https://example.com')
    })
  })

  describe('dialogApi', () => {
    it('openFolder invokes dialog:openFolder', async () => {
      await dialogApi.openFolder()
      expect(mockInvoke).toHaveBeenCalledWith('dialog:openFolder')
    })
  })

  describe('appApi', () => {
    it('isDev invokes app:isDev', async () => {
      await appApi.isDev()
      expect(mockInvoke).toHaveBeenCalledWith('app:isDev')
    })

    it('homedir invokes app:homedir', async () => {
      await appApi.homedir()
      expect(mockInvoke).toHaveBeenCalledWith('app:homedir')
    })

    it('platform invokes app:platform', async () => {
      await appApi.platform()
      expect(mockInvoke).toHaveBeenCalledWith('app:platform')
    })

    it('tmpdir invokes app:tmpdir', async () => {
      await appApi.tmpdir()
      expect(mockInvoke).toHaveBeenCalledWith('app:tmpdir')
    })
  })

  describe('windowControlsApi', () => {
    it('minimize invokes window:minimize', async () => {
      await windowControlsApi.minimize()
      expect(mockInvoke).toHaveBeenCalledWith('window:minimize')
    })

    it('maximize invokes window:maximize', async () => {
      await windowControlsApi.maximize()
      expect(mockInvoke).toHaveBeenCalledWith('window:maximize')
    })

    it('close invokes window:close', async () => {
      await windowControlsApi.close()
      expect(mockInvoke).toHaveBeenCalledWith('window:close')
    })
  })
})
