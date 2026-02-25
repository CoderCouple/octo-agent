/**
 * IPC handlers for pseudo-terminal (PTY) lifecycle management.
 *
 * Creates, resizes, writes to, and destroys PTY processes using node-pty.
 * In E2E mode, spawns a fake shell script for deterministic test output.
 */
import { BrowserWindow, IpcMain } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import * as pty from 'node-pty'
import { isWindows, getDefaultShell, resolveWindowsCommand } from '../platform'
import { HandlerContext } from './types'
import { getScenarioData } from './scenarios'

/**
 * On Windows, resolve the base command to its full path so agents installed
 * outside PATH (e.g. %USERPROFILE%\.local\bin) can still be launched.
 */
function resolveInitialCommand(command: string, isE2ETest: boolean): string {
  if (!isWindows || isE2ETest) return command
  const parts = command.trim().split(/\s+/)
  const baseCmd = parts[0]
  const resolved = resolveWindowsCommand(baseCmd)
  if (resolved && resolved !== baseCmd) {
    parts[0] = `"${resolved}"`
    return parts.join(' ')
  }
  return command
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('pty:create', (_event, options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string>; shell?: string }) => {
    // Find the sender window
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    // In E2E test mode, use a controlled shell that won't run real commands
    let shell: string
    let shellArgs: string[] = []
    let initialCommand: string | undefined = options.command

    if (ctx.isE2ETest) {
      // In E2E mode, use controlled shells
      if (isWindows) {
        shell = process.env.ComSpec || 'cmd.exe'
        shellArgs = []

        if (options.command) {
          const fakeClaude = join(__dirname, '../../scripts/fake-claude.ps1')
          initialCommand = `powershell -ExecutionPolicy Bypass -File "${fakeClaude}"`
        } else {
          initialCommand = 'echo E2E_TEST_SHELL_READY'
        }
      } else {
        shell = '/bin/bash'
        shellArgs = []

        if (options.command) {
          // This is an agent terminal - run the fake claude script
          const scenarioScript = getScenarioData(ctx.e2eScenario).agentScript(options.sessionId || '')
          const fakeClaude = scenarioScript
            ? join(__dirname, `../../scripts/${scenarioScript}`)
            : ctx.FAKE_CLAUDE_SCRIPT || join(__dirname, '../../scripts/fake-claude.sh')
          initialCommand = `bash "${fakeClaude}"`
        } else {
          // Regular user terminal - just echo ready marker
          initialCommand = 'echo "E2E_TEST_SHELL_READY"; PS1="test-shell$ "'
        }
      }
    } else if (ctx.E2E_MOCK_SHELL) {
      // Run the mock shell script via bash (external script mode)
      shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/bash'
      shellArgs = isWindows ? ['/c', ctx.E2E_MOCK_SHELL] : [ctx.E2E_MOCK_SHELL]
    } else {
      shell = options.shell || getDefaultShell()
      shellArgs = []
      // Pass agent command as shell args so it runs after the shell profile loads,
      // instead of writing it to the PTY after a blind delay.
      if (initialCommand && !isWindows) {
        shellArgs = ['-l', '-i', '-c', initialCommand]
        initialCommand = undefined
      }
    }

    // Start with process.env, but remove env vars that should be explicitly configured
    const baseEnv = { ...process.env } as Record<string, string>
    // Don't inherit CLAUDE_CONFIG_DIR - it should be explicitly set per-agent if needed
    delete baseEnv.CLAUDE_CONFIG_DIR

    // Expand ~ to home directory in env var values
    const expandHome = (value: string) => {
      if (value.startsWith('~/')) {
        return join(homedir(), value.slice(2))
      }
      if (value === '~') {
        return homedir()
      }
      return value
    }

    // Process agent env vars, expanding ~ in values
    const agentEnv: Record<string, string> = {}
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        const expanded = expandHome(value)

        // Special case: CLAUDE_CONFIG_DIR=~/.claude is the default, so don't set it
        // (Claude behaves differently when the env var is explicitly set vs not set)
        if (key === 'CLAUDE_CONFIG_DIR' && expanded === join(homedir(), '.claude')) {
          continue
        }

        agentEnv[key] = expanded
      }
    }

    const env = {
      ...baseEnv,
      ...agentEnv,  // Agent-specific env vars override base env
    } as Record<string, string>

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: options.cwd,
      env,
    })

    ctx.ptyProcesses.set(options.id, ptyProcess)
    if (senderWindow) {
      ctx.ptyOwnerWindows.set(options.id, senderWindow)
    }

    // Forward data to the window that created this PTY
    ptyProcess.onData((data) => {
      const ownerWindow = ctx.ptyOwnerWindows.get(options.id) || ctx.mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`pty:data:${options.id}`, data)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      const ownerWindow = ctx.ptyOwnerWindows.get(options.id) || ctx.mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`pty:exit:${options.id}`, exitCode)
      }
      ctx.ptyProcesses.delete(options.id)
      ctx.ptyOwnerWindows.delete(options.id)
    })

    // If a command was specified (or in E2E test mode), run it after shell starts
    if (initialCommand) {
      initialCommand = resolveInitialCommand(initialCommand, ctx.isE2ETest)
      setTimeout(() => {
        ptyProcess.write(`${initialCommand  }\r`)
      }, 100)
    }

    return { id: options.id }
  })

  ipcMain.handle('pty:write', (_event, id: string, data: string) => {
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.write(data)
    }
  })

  ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) => {
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.resize(cols, rows)
    }
  })

  ipcMain.handle('pty:kill', (_event, id: string) => {
    const ptyProcess = ctx.ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.kill()
      ctx.ptyProcesses.delete(id)
    }
  })
}
