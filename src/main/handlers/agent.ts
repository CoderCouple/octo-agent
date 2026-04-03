/**
 * IPC handlers for agent and git CLI installation checks.
 * Restored from Broomy's ghCore.ts — the gh-specific handlers were removed
 * in Phase 1 but agent:isInstalled and git:isInstalled are still needed.
 */
import { IpcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { isWindows, resolveCommand, enhancedPath } from '../platform'
import { HandlerContext } from './types'

const execFileAsync = promisify(execFile)

function getExecShell(): string | null {
  return process.env.SHELL || (isWindows ? null : '/bin/sh')
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('agent:isInstalled', async (_event, command: string) => {
    if (ctx.isE2ETest) return true
    const baseCommand = command.trim().split(/\s+/)[0]
    try {
      if (isWindows) {
        await execFileAsync('where', [baseCommand], { encoding: 'utf-8' })
      } else {
        const shell = getExecShell() || '/bin/sh'
        const env = { ...process.env, PATH: enhancedPath(process.env.PATH) }
        await execFileAsync(shell, ['-c', 'command -v "$1"', '--', baseCommand], { encoding: 'utf-8', timeout: 5000, env })
      }
      return true
    } catch {
      return resolveCommand(baseCommand) !== null
    }
  })

  ipcMain.handle('git:isInstalled', async () => {
    if (ctx.isE2ETest) return true
    try {
      await execFileAsync('git', ['--version'], { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  })
}
