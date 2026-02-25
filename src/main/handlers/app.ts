/**
 * IPC handlers for app-level queries like platform, home directory, and version.
 */
import { app, IpcMain } from 'electron'
import { homedir, tmpdir } from 'os'
import { normalizePath } from '../platform'
import { HandlerContext } from './types'

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('app:isDev', () => ctx.isDev)
  ipcMain.handle('app:homedir', () => normalizePath(homedir()))
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('app:tmpdir', () => normalizePath(tmpdir()))
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
