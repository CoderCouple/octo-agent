/**
 * IPC handlers for Docker isolation status and container management.
 */
import { IpcMain } from 'electron'
import { HandlerContext } from './types'
import { isDockerAvailable, getContainerInfo, stopContainer, resetContainer } from '../docker'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('docker:status', async () => {
    if (ctx.isE2ETest) {
      return { available: true }
    }
    return isDockerAvailable()
  })

  ipcMain.handle('docker:containerInfo', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return null
    }
    return getContainerInfo(ctx, repoDir)
  })

  ipcMain.handle('docker:stopContainer', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return
    }
    await stopContainer(ctx, repoDir)
  })

  ipcMain.handle('docker:restartContainer', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return
    }
    // Stop — the next PTY create will re-start it
    await stopContainer(ctx, repoDir)
  })

  ipcMain.handle('docker:resetContainer', async (_event, repoDir: string) => {
    if (ctx.isE2ETest) {
      return
    }
    await resetContainer(ctx, repoDir)
  })
}
