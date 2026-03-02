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
import type { IPty } from 'node-pty'
import { isWindows, getDefaultShell, resolveWindowsCommand } from '../platform'
import { HandlerContext } from './types'
import { getScenarioData } from './scenarios'
import { isDockerAvailable, ensureContainer, buildDockerExecArgs, dockerSetupMessage, imageExists, ensureAgentInstalled, setupContainer, acquireSetupLock, DEFAULT_DOCKER_IMAGE } from '../docker'

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

/** Wire onData/onExit events for a PTY, registering it in the context maps. */
function wirePtyEvents(ctx: HandlerContext, ptyProcess: IPty, id: string, senderWindow: BrowserWindow | null) {
  ctx.ptyProcesses.set(id, ptyProcess)
  if (senderWindow) ctx.ptyOwnerWindows.set(id, senderWindow)

  ptyProcess.onData((data) => {
    const ownerWindow = ctx.ptyOwnerWindows.get(id) || ctx.mainWindow
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      ownerWindow.webContents.send(`pty:data:${id}`, data)
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    const ownerWindow = ctx.ptyOwnerWindows.get(id) || ctx.mainWindow
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      ownerWindow.webContents.send(`pty:exit:${id}`, exitCode)
    }
    ctx.ptyProcesses.delete(id)
    ctx.ptyOwnerWindows.delete(id)
  })
}

/**
 * Send ANSI error text directly to the terminal, then signal exit.
 * No bash process needed — avoids shell prompt artifacts.
 */
function displayTerminalError(id: string, message: string, senderWindow: BrowserWindow | null) {
  const send = (channel: string, data: unknown) => {
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.webContents.send(channel, data)
    }
  }

  setTimeout(() => {
    send(`pty:data:${id}`, `\x1b[31m${message}\x1b[0m\r\n`)
    setTimeout(() => {
      send(`pty:exit:${id}`, 1)
    }, 50)
  }, 150)
}

/**
 * Extract the base agent command from a full command string.
 * e.g. "claude --dangerously-skip-permissions" → "claude"
 */
function extractAgentCommand(command: string): string {
  return command.trim().split(/\s+/)[0]
}

/**
 * Handle Docker isolation PTY creation with two-phase flow:
 * Phase 1 (sync): Return { id } immediately so the renderer can register onData.
 * Phase 2 (async): Set up container, install agent, start docker exec PTY.
 */
function createIsolatedPty(
  ctx: HandlerContext,
  options: { id: string; cwd: string; command?: string; sessionId: string; env?: Record<string, string>; dockerImage?: string; repoRootDir?: string },
  senderWindow: BrowserWindow | null,
): { id: string } | null {
  const { id, cwd, command, dockerImage, repoRootDir } = options
  // Container is keyed on repo root dir (shared across worktrees/sessions),
  // falling back to cwd if repoRootDir is not provided.
  const containerKey = repoRootDir || cwd

  const sendToTerminal = (text: string) => {
    if (senderWindow && !senderWindow.isDestroyed()) {
      senderWindow.webContents.send(`pty:data:${id}`, text)
    }
  }

  // Phase 1 (sync): Quick checks that don't need async
  // We launch the async phase and return immediately.

  // Phase 2 (async): Container setup, agent install, PTY start
  // Uses a per-repo lock so concurrent sessions wait for the first to finish
  // setup rather than racing on container creation and agent install.
  const asyncSetup = async () => {
    sendToTerminal('\x1b[2m── Starting container for agent ──\x1b[22m\r\n')

    // Check Docker availability (before acquiring lock — fast check)
    const status = await isDockerAvailable()
    if (!status.available) {
      displayTerminalError(id, dockerSetupMessage(status), senderWindow)
      return
    }

    // Check custom image exists (before acquiring lock — fast check)
    const img = dockerImage || DEFAULT_DOCKER_IMAGE
    if (dockerImage) {
      const hasImage = await imageExists(img)
      if (!hasImage) {
        displayTerminalError(id,
          `Docker image '${img}' not found. Pull or build it, then restart the session.`,
          senderWindow)
        return
      }
    }

    // Acquire per-repo lock for container creation + setup + agent install.
    // Second session for the same repo waits here, then gets the already-running
    // container with the agent already installed.
    const releaseLock = await acquireSetupLock(containerKey)
    let containerId: string
    try {
      // Ensure container exists (pulls default image if needed)
      const result = await ensureContainer(ctx, containerKey, dockerImage, sendToTerminal)
      if (!result.success || !result.containerId) {
        displayTerminalError(id,
          `Docker container failed to start: ${result.error || 'Unknown error'}`,
          senderWindow)
        return
      }
      containerId = result.containerId

      // First-time setup for new containers
      if (result.isNew) {
        const setupResult = await setupContainer(containerId, sendToTerminal)
        if (!setupResult.success) {
          displayTerminalError(id,
            `Container setup failed: ${setupResult.error || 'Unknown error'}`,
            senderWindow)
          return
        }
      }

      // Install agent if a command was specified
      if (command) {
        const agentCmd = extractAgentCommand(command)
        const installResult = await ensureAgentInstalled(containerId, agentCmd, sendToTerminal)
        if (!installResult.success) {
          displayTerminalError(id,
            `Failed to install ${agentCmd}: ${installResult.error || 'Unknown error'}`,
            senderWindow)
          return
        }
      }
    } finally {
      releaseLock()
    }

    sendToTerminal('\x1b[2m── Container ready ──\x1b[22m\r\n\r\n')

    // Start docker exec PTY.
    // Expand ~ to the container's home dir (/home/node) since Node.js fs APIs
    // don't expand tilde — only shells do. Without this, env vars like
    // CLAUDE_CONFIG_DIR=~/.claude create a literal '~' directory.
    const containerHome = '/home/node'
    const dockerEnv: Record<string, string> = {}
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        if (value.startsWith('~/')) {
          dockerEnv[key] = `${containerHome}/${value.slice(2)}`
        } else if (value === '~') {
          dockerEnv[key] = containerHome
        } else {
          dockerEnv[key] = value
        }
      }
    }
    const dockerArgs = buildDockerExecArgs(containerId, cwd, dockerEnv, command)

    const ptyProcess = pty.spawn('docker', dockerArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })
    wirePtyEvents(ctx, ptyProcess, id, senderWindow)
  }

  // Fire and forget — errors are sent to the terminal
  asyncSetup().catch((err: unknown) => {
    displayTerminalError(id, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`, senderWindow)
  })

  return { id }
}

/** Resolve shell, args, and initial command for the standard (non-isolated) PTY path. */
function resolveShellConfig(
  ctx: HandlerContext,
  options: { command?: string; sessionId?: string; shell?: string },
): { shell: string; shellArgs: string[]; initialCommand: string | undefined } {
  let initialCommand: string | undefined = options.command

  if (ctx.isE2ETest) {
    if (isWindows) {
      const shell = process.env.ComSpec || 'cmd.exe'
      if (options.command) {
        const fakeClaude = join(__dirname, '../../scripts/fake-claude.ps1')
        initialCommand = `powershell -ExecutionPolicy Bypass -File "${fakeClaude}"`
      } else {
        initialCommand = 'echo E2E_TEST_SHELL_READY'
      }
      return { shell, shellArgs: [], initialCommand }
    }
    const shell = '/bin/bash'
    if (options.command) {
      const scenarioScript = getScenarioData(ctx.e2eScenario).agentScript(options.sessionId || '')
      const fakeClaude = scenarioScript
        ? join(__dirname, `../../scripts/${scenarioScript}`)
        : ctx.FAKE_CLAUDE_SCRIPT || join(__dirname, '../../scripts/fake-claude.sh')
      initialCommand = `bash "${fakeClaude}"`
    } else {
      initialCommand = 'echo "E2E_TEST_SHELL_READY"; PS1="test-shell$ "'
    }
    return { shell, shellArgs: [], initialCommand }
  }

  if (ctx.E2E_MOCK_SHELL) {
    const shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/bash'
    const shellArgs = isWindows ? ['/c', ctx.E2E_MOCK_SHELL] : [ctx.E2E_MOCK_SHELL]
    return { shell, shellArgs, initialCommand }
  }

  const shell = options.shell || getDefaultShell()
  let shellArgs: string[] = []
  if (initialCommand && !isWindows) {
    shellArgs = ['-l', '-i', '-c', initialCommand]
    initialCommand = undefined
  }
  return { shell, shellArgs, initialCommand }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('pty:create', (_event, options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string>; shell?: string; isolated?: boolean; dockerImage?: string; repoRootDir?: string }) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)

    // Docker isolation path (allowed in E2E when E2E_REAL_DOCKER is set)
    const allowRealDocker = ctx.isE2ETest && process.env.E2E_REAL_DOCKER === 'true'
    if (options.isolated && (!ctx.isE2ETest || allowRealDocker) && options.sessionId) {
      return createIsolatedPty(ctx, { ...options, sessionId: options.sessionId }, senderWindow)
    }

    // Standard (non-isolated) path
    const { shell, shellArgs, initialCommand: resolvedCommand } = resolveShellConfig(ctx, options)
    let initialCommand = resolvedCommand

    // Build environment
    const baseEnv = { ...process.env } as Record<string, string>
    delete baseEnv.CLAUDE_CONFIG_DIR

    const expandHome = (value: string) => {
      if (value.startsWith('~/')) return join(homedir(), value.slice(2))
      if (value === '~') return homedir()
      return value
    }

    const agentEnv: Record<string, string> = {}
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        const expanded = expandHome(value)
        if (key === 'CLAUDE_CONFIG_DIR' && expanded === join(homedir(), '.claude')) continue
        agentEnv[key] = expanded
      }
    }

    const env = { ...baseEnv, ...agentEnv } as Record<string, string>

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: options.cwd,
      env,
    })

    wirePtyEvents(ctx, ptyProcess, options.id, senderWindow)

    if (initialCommand) {
      initialCommand = resolveInitialCommand(initialCommand, ctx.isE2ETest)
      setTimeout(() => {
        ptyProcess.write(`${initialCommand}\r`)
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
