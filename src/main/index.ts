/**
 * Main process entry point for the OctoAgent Electron app.
 *
 * Creates the BrowserWindow, registers every IPC handler the renderer can call,
 * and manages application lifecycle (PTY processes, file watchers, window cleanup).
 * Handlers are organized into groups: PTY management (node-pty), config/profile
 * persistence (~/.octoagent/), git operations (simple-git), GitHub CLI wrappers (gh),
 * filesystem I/O, shell execution, native context menus, and TypeScript project
 * context collection. Every handler checks the `isE2ETest` flag and returns
 * deterministic mock data during Playwright tests so no real repos, APIs, or
 * config files are touched.
 */
import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { join, dirname } from 'path'
import { existsSync, readFileSync, FSWatcher } from 'fs'
import { execFileSync } from 'child_process'
import * as pty from 'node-pty'
import { isWindows, isMac, isLinux, resolveCommand, enhancedPath } from './platform'
import { registerAllHandlers, HandlerContext, PROFILES_FILE } from './handlers'
import { resolveShellEnv } from './shellEnv'
import { writeCrashLog, appendErrorLog } from './crashLog'
import { disposePtyListenersForWindow, disposeAllPtyListeners } from './handlers/pty'
import { Gateway } from './gateway'
import { Supervisor } from './supervisor'
import { startHookServer } from './gateway/adapters/hookAdapter'
import { startPhoneServer, stopPhoneServer } from './gateway/adapters/phoneAdapter'
import { startPeersServer, stopPeersServer, queueMessageForPeer } from './gateway/adapters/peersAdapter'
import { sendToSdkAgent } from './handlers/agentSdk'
import type { AgentEvent, Decision, AutoRule } from '../shared/types'

// Ensure app name is correct (in dev mode Electron defaults to "Electron")
app.name = 'OctoAgent'

// Check if we're in development mode
const isDev = process.env.ELECTRON_RENDERER_URL !== undefined

// Check if we're in E2E test mode
const isE2ETest = process.env.E2E_TEST === 'true'

// Check if we should hide the window (headless mode)
const isHeadless = process.env.E2E_HEADLESS !== 'false'

// Extend PATH with common bin directories (e.g. ~/.local/bin, /opt/homebrew/bin)
// so tools like claude, git, gh are found even before resolveShellEnv() runs.
process.env.PATH = enhancedPath(process.env.PATH)

// On Windows, also resolve git/gh from well-known install locations
if (isWindows) {
  const dirsToAdd = new Set<string>()
  for (const cmd of ['git', 'gh'] as const) {
    const resolved = resolveCommand(cmd)
    if (resolved) {
      dirsToAdd.add(dirname(resolved))
    }
  }
  if (dirsToAdd.size > 0) {
    const current = process.env.PATH || ''
    process.env.PATH = `${[...dirsToAdd].join(';')};${current}`
  }
}


// Crash handlers — write crash report to disk so the next launch can show recovery UI
if (!isE2ETest) {
  process.on('uncaughtException', (error) => {
    // EPIPE is non-fatal — a WebSocket or PTY stream closed mid-write
    if (error && (error as NodeJS.ErrnoException).code === 'EPIPE') {
      console.warn('Non-fatal EPIPE (broken pipe) — ignoring:', error.message)
      return
    }
    console.error('Uncaught exception:', error)
    try {
      appendErrorLog('main', error instanceof Error ? (error.stack ?? error.message) : String(error))
      writeCrashLog(error, 'main')
      dialog.showErrorBox('OctoAgent crashed', error.message || String(error))
    } catch {
      // Best-effort — avoid infinite crash loops
    }
    app.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    // EPIPE is non-fatal
    if (reason instanceof Error && (reason as NodeJS.ErrnoException).code === 'EPIPE') {
      console.warn('Non-fatal EPIPE (broken pipe) in rejection — ignoring:', reason.message)
      return
    }
    console.error('Unhandled rejection:', reason)
    try {
      appendErrorLog('main', reason instanceof Error ? (reason.stack ?? reason.message) : String(reason))
      writeCrashLog(reason, 'main')
      dialog.showErrorBox('OctoAgent crashed', reason instanceof Error ? reason.message : String(reason))
    } catch {
      // Best-effort
    }
    app.exit(1)
  })
}

// PTY instances map
const ptyProcesses = new Map<string, pty.IPty>()
// Session ID → PTY ID mapping (for supervisor PTY bridge)
const sessionPtyMap = new Map<string, string>()
// File watchers map
const fileWatchers = new Map<string, FSWatcher>()
// Track windows by profileId
const profileWindows = new Map<string, BrowserWindow>()
// Track which window owns each PTY
const ptyOwnerWindows = new Map<string, BrowserWindow>()
// Track which window owns each file watcher
const watcherOwnerWindows = new Map<string, BrowserWindow>()
// Track Docker containers for isolation
const dockerContainers = new Map<string, import('./handlers/types').DockerContainerState>()
let mainWindow: BrowserWindow | null = null

// OctoAgent gateway and supervisor
const gateway = new Gateway()
const supervisor = new Supervisor()

// Agent bridge: allows supervisor to write text to any agent (PTY or SDK mode)
supervisor.setPtyBridge((sessionId: string, text: string): boolean => {
  // Try PTY first (terminal-mode agents: Gemini, Codex, Claude in terminal mode)
  const ptyId = sessionPtyMap.get(sessionId)
  if (ptyId) {
    const proc = ptyProcesses.get(ptyId)
    if (proc) {
      console.log(`[Agent Bridge] PTY write to ${sessionId}: ${text.substring(0, 80)}`)
      proc.write(text)
      return true
    }
  }

  // Try SDK (API-mode agents: Claude in API mode)
  const sent = sendToSdkAgent(sessionId, text)
  if (sent) {
    console.log(`[Agent Bridge] SDK send to ${sessionId}: ${text.substring(0, 80)}`)
    return true
  }

  console.warn(`[Agent Bridge] No PTY or SDK session for ${sessionId}. PTY map: [${[...sessionPtyMap.keys()].join(', ')}]`)
  return false
})

function createWindow(profileId?: string): BrowserWindow {
  const window = new BrowserWindow({
    title: 'OctoAgent',
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    ...(isMac ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 15, y: 10 },
    } : isLinux ? {
      frame: false,
      autoHideMenuBar: true,
    } : {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: {
        color: '#252525',
        symbolColor: '#e0e0e0',
        height: 40,
      },
      autoHideMenuBar: true,
    }),
    // Hide window in E2E test mode for headless-like behavior (unless E2E_HEADLESS=false)
    show: !(isE2ETest && isHeadless),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    acceptFirstMouse: true,
  })

  // Security: restrict webview tags to HTTPS URLs only
  window.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    // Strip away preload scripts
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true

    // Only allow HTTPS URLs
    if (params.src && !params.src.startsWith('https://')) {
      _event.preventDefault()
    }
  })

  // Forward Cmd/Ctrl+F from webview guests to the renderer so it can open
  // the find-in-page bar (keyboard events inside a <webview> don't propagate
  // to the embedder DOM).
  window.webContents.on('did-attach-webview', (_event, webContents) => {
    webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key.toLowerCase() === 'f' && (input.meta || input.control) && !input.alt && !input.shift) {
        event.preventDefault()
        window.webContents.send('webview:find-in-page')
      }
    })
  })

  // Track the first window as mainWindow for backwards compat
  if (!mainWindow) {
    mainWindow = window
  }

  // Track window by profileId
  if (profileId) {
    profileWindows.set(profileId, window)
  }

  // Load the renderer with profileId as query parameter
  const profileParam = profileId ? `?profile=${encodeURIComponent(profileId)}` : ''
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${profileParam}`)
    if (!isE2ETest) window.webContents.openDevTools()
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      search: profileId ? `profile=${encodeURIComponent(profileId)}` : undefined,
    })
  }

  // Ensure window shows once ready (but not in headless E2E mode)
  if (!(isE2ETest && isHeadless)) {
    window.once('ready-to-show', () => {
      window.show()
    })
  }

  // Log renderer errors
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
    appendErrorLog('did-fail-load', `${errorCode}: ${errorDescription}`)
  })

  window.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    // level 3 = error (0=verbose, 1=info, 2=warning, 3=error)
    if (level >= 3) {
      appendErrorLog('renderer', message)
    }
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Render process gone:', details)
    if (details.reason !== 'clean-exit') {
      try {
        writeCrashLog(new Error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`), 'renderer')
      } catch {
        // best-effort
      }
    }
  })

  // Kill PTY processes and close file watchers when the renderer reloads —
  // prevents FD exhaustion from accumulated zombie handles
  window.webContents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return
    // Only clean up on same-origin navigation (reload), not initial load
    const currentUrl = window.webContents.getURL()
    if (currentUrl && currentUrl !== url) return
    // Dispose native event listeners before killing PTY processes
    disposePtyListenersForWindow(ptyOwnerWindows, window)
    for (const [id, owner] of ptyOwnerWindows) {
      if (owner === window) {
        const proc = ptyProcesses.get(id)
        if (proc) {
          proc.kill()
          ptyProcesses.delete(id)
        }
        ptyOwnerWindows.delete(id)
      }
    }
    // Clean up sessionPtyMap entries for killed PTYs
    for (const [sessId, ptyId] of sessionPtyMap) {
      if (!ptyProcesses.has(ptyId)) sessionPtyMap.delete(sessId)
    }
    for (const [id, owner] of watcherOwnerWindows) {
      if (owner === window) {
        const watcher = fileWatchers.get(id)
        if (watcher) {
          watcher.close()
          fileWatchers.delete(id)
        }
        watcherOwnerWindows.delete(id)
      }
    }
  })

  // Prevent navigation to external URLs — open them in the default browser instead
  window.webContents.on('will-navigate', (event, url) => {
    // Allow reloading the app itself (file:// or devserver URLs)
    if (url.startsWith('file://') || url.startsWith('http://localhost')) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  // Intercept window.open() calls and redirect to external browser
  window.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Cleanup when window is closing
  window.on('close', () => {
    // Remove from profileWindows tracking
    if (profileId) {
      profileWindows.delete(profileId)
    }
    // Dispose native event listeners before killing PTY processes
    disposePtyListenersForWindow(ptyOwnerWindows, window)
    // Kill PTY processes belonging to this window only
    for (const [id, owner] of ptyOwnerWindows) {
      if (owner === window) {
        const ptyProcess = ptyProcesses.get(id)
        if (ptyProcess) {
          ptyProcess.kill()
          ptyProcesses.delete(id)
        }
        ptyOwnerWindows.delete(id)
      }
    }
    // Clean up sessionPtyMap entries for killed PTYs
    for (const [sessId, ptyId] of sessionPtyMap) {
      if (!ptyProcesses.has(ptyId)) sessionPtyMap.delete(sessId)
    }
    // Close file watchers belonging to this window only
    for (const [id, owner] of watcherOwnerWindows) {
      if (owner === window) {
        const watcher = fileWatchers.get(id)
        if (watcher) {
          watcher.close()
          fileWatchers.delete(id)
        }
        watcherOwnerWindows.delete(id)
      }
    }
    if (window === mainWindow) {
      mainWindow = null
    }
  })

  return window
}

// Build context for handler modules
const context: HandlerContext & { createWindow: (profileId?: string) => BrowserWindow } = {
  isE2ETest,
  get e2eScenario() { return (process.env.E2E_SCENARIO || 'default') as import('./handlers/types').E2EScenario },
  e2eRealRepos: process.env.E2E_REAL_REPOS === 'true',
  isDev,
  isWindows,
  ptyProcesses,
  ptyOwnerWindows,
  fileWatchers,
  watcherOwnerWindows,
  profileWindows,
  get mainWindow() { return mainWindow },
  E2E_MOCK_SHELL: process.env.E2E_MOCK_SHELL,
  FAKE_CLAUDE_SCRIPT: process.env.FAKE_CLAUDE_SCRIPT,
  dockerContainers,
  sessionPtyMap,
  createWindow,
}

// Expose context on globalThis for E2E tests to clean up PTY processes between reloads
if (isE2ETest) {
  (globalThis as Record<string, unknown>).__appContext = context
}

// Register all IPC handlers
registerAllHandlers(ipcMain, context)

async function checkForUpdatesFromMenu(): Promise<void> {
  if (isE2ETest || isDev) {
    void dialog.showMessageBox({ message: 'Update checking is disabled in development mode.' })
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result && result.updateInfo.version !== autoUpdater.currentVersion?.version) {
      // The renderer's VersionIndicator will handle the UI via IPC events
      const info = result.updateInfo
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow) {
        focusedWindow.webContents.send('updater:updateAvailable', {
          version: info.version,
        })
      }
    } else {
      void dialog.showMessageBox({ message: 'You are running the latest version of OctoAgent.' })
    }
  } catch {
    void dialog.showMessageBox({ message: 'Could not check for updates. Please try again later.' })
  }
}

// Build application menu with Help menu
function buildAppMenu() {
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Check for Updates...',
          click: () => { void checkForUpdatesFromMenu() },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: (_, browserWindow) => {
            browserWindow?.webContents.send('menu:select-all')
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ]
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Agent',
      submenu: [
        {
          label: 'Restart Agent',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (_, browserWindow) => {
            browserWindow?.webContents.send('agent:restart')
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Getting Started',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('help:menu', 'getting-started')
            }
          },
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('help:menu', 'shortcuts')
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Reset Tutorial Progress',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('help:menu', 'reset-tutorial')
            }
          },
        },
        { type: 'separator' },
        ...(!isMac ? [{
          label: 'Check for Updates...',
          click: () => { void checkForUpdatesFromMenu() },
        },
        { type: 'separator' as const }] : []),
        {
          label: 'Report Issue...',
          click: () => {
            void shell.openExternal('https://github.com/octoagent/octoagent/issues')
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)
}

// IPC handler for gateway port
ipcMain.handle('octoagent:getGatewayPort', () => gateway.getPort())

// App lifecycle
  void app.whenReady().then(async () => {
    await resolveShellEnv()

    // Start the OctoAgent gateway
    await gateway.start()

    // Wire supervisor → gateway: broadcast events to WS clients
    supervisor.on('agentEvent', (event: AgentEvent) => {
      gateway.emitAgentEvent(event)
    })
    supervisor.on('decision', (decision: Decision) => {
      gateway.emitSessionEvent(decision.sessionId, 'decision', decision as unknown as Record<string, unknown>)
    })
    supervisor.on('decisionResolved', (decision: Decision) => {
      gateway.emitSessionEvent(decision.sessionId, 'decision', decision as unknown as Record<string, unknown>)
    })
    supervisor.on('memoryUpdate', (data: { sessionId: string; summary: string }) => {
      gateway.emitSessionEvent(data.sessionId, 'memoryUpdate', { summary: data.summary })
    })
    supervisor.on('report', (data: { sessionIds: string[]; content: string }) => {
      // Broadcast report to the first session (primary)
      if (data.sessionIds.length > 0) {
        gateway.emitSessionEvent(data.sessionIds[0], 'report', { content: data.content, sessionIds: data.sessionIds })
      }
    })
    supervisor.on('autoRuleSuggestion', (suggestion: {
      sessionId: string; pattern: string; patternType: AutoRule['patternType']; resolution: string; count: number
    }) => {
      gateway.emitSessionEvent(suggestion.sessionId, 'autoRuleSuggestion', suggestion as unknown as Record<string, unknown>)
    })
    supervisor.on('peerMessage', (data: { sessionId: string; from: string; fromName?: string; text: string; timestamp: number }) => {
      gateway.emitSessionEvent(data.sessionId, 'peerMessage', data as unknown as Record<string, unknown>)
    })
    supervisor.on('supervisorChat', (data: Record<string, unknown>) => {
      gateway.emitGlobalEvent('supervisorChat', data)
    })
    supervisor.on('taskUpdate', (data: Record<string, unknown>) => {
      gateway.emitGlobalEvent('taskUpdate', data)
    })
    // Queue approved peer messages for direct P2P polling (check_messages MCP tool)
    supervisor.on('peerMessageApproved', (message: import('./gateway/adapters/peersAdapter').PeerMessage) => {
      queueMessageForPeer(message)
    })

    // Wire gateway → supervisor: route requests
    gateway.setRouteHandlers({
      onSend: (_clientId, frame) => {
        if (frame.sessionId && frame.payload?.text) {
          const text = frame.payload.text as string
          const memberSessionIds = frame.payload.memberSessionIds as string[] | undefined
          console.log(`[onSend] sessionId=${frame.sessionId}, memberSessionIds=${JSON.stringify(memberSessionIds)}, text="${text.substring(0, 60)}"`)
          if (memberSessionIds && memberSessionIds.length > 0) {
            // Group session: dispatch to all member agents
            supervisor.sendToGroupMembers(memberSessionIds, text, 'user')
          } else {
            supervisor.handleUserMessage(frame.sessionId, text)
          }
        }
      },
      onResolve: (_clientId, frame) => {
        const decisionId = frame.payload?.decisionId as string | undefined
        const resolution = frame.payload?.resolution as string | undefined
        if (decisionId && resolution) {
          supervisor.resolveDecision(decisionId, resolution)
        }
      },
      onBrief: (_clientId, frame) => {
        const targetSessionId = frame.sessionId
        const sourceSessionIds = frame.payload?.sourceSessionIds as string[] | undefined
        if (targetSessionId && sourceSessionIds) {
          void supervisor.briefSession({
            targetSessionId,
            sourceSessionIds,
            additionalContext: frame.payload?.context as string | undefined,
          })
        }
      },
      onSetMode: (_clientId, frame) => {
        const mode = frame.payload?.mode as string | undefined
        if (mode === 'focused' || mode === 'away' || mode === 'autonomous') {
          supervisor.setMode(mode)
        }
      },
      onSupervisorSend: (_clientId, frame) => {
        const text = frame.payload?.text as string | undefined
        if (text) {
          console.log(`[onSupervisorSend] Received: "${text.substring(0, 80)}"`)
          supervisor.handleSupervisorChat(text).catch((err) => {
            console.error('[onSupervisorSend] Error:', err)
          })
        }
      },
    })

    // Start hook adapter (for Claude Code hooks → supervisor)
    await startHookServer((message) => {
      supervisor.handleInbound(message)
    })

    // Start phone adapter (for phone push decisions)
    await startPhoneServer((decisionId, resolution) => {
      supervisor.resolveDecision(decisionId, resolution)
    })

    // Start peers adapter (for inter-agent peer communication)
    await startPeersServer((message) => {
      supervisor.handlePeerMessage(message)
    })

    // Build the application menu
    buildAppMenu()
  // Determine the initial profile to open
  let initialProfileId = 'default'
  if (!isE2ETest) {
    try {
      if (existsSync(PROFILES_FILE)) {
        const profilesData = JSON.parse(readFileSync(PROFILES_FILE, 'utf-8'))
        if (profilesData.lastProfileId) {
          initialProfileId = profilesData.lastProfileId
        }
      }
    } catch {
      // ignore, use default
    }
  }

  createWindow(initialProfileId)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(initialProfileId)
    }
  })
})


app.on('window-all-closed', () => {
  // Stop the gateway and adapters
  void gateway.stop()
  void stopPhoneServer()
  void stopPeersServer()
  supervisor.shutdown()
  // Dispose all native PTY event listeners before killing processes
  disposeAllPtyListeners()
  // Kill all PTY processes
  for (const [id, ptyProcess] of ptyProcesses) {
    ptyProcess.kill()
    ptyProcesses.delete(id)
  }
  // Close all file watchers
  for (const [id, watcher] of fileWatchers) {
    watcher.close()
    fileWatchers.delete(id)
  }
  stopDockerContainers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Also stop containers on Cmd+Q / Quit (macOS doesn't always fire window-all-closed)
app.on('will-quit', () => {
  stopDockerContainers()
})

function stopDockerContainers() {
  // Stop legacy octoagent-managed containers (backward compat — can be removed in a future release)
  try {
    const ids = execFileSync('docker', ['ps', '-q', '--filter', 'name=octoagent-'], { encoding: 'utf-8' }).trim()
    if (ids) {
      execFileSync('docker', ['stop', ...ids.split('\n').filter(Boolean)], { timeout: 10000 })
    }
  } catch {
    // Docker not available or already stopped — ignore
  }
  // Stop any tracked devcontainers
  for (const [, state] of context.dockerContainers) {
    try {
      execFileSync('docker', ['stop', state.containerId], { timeout: 10000 })
    } catch {
      // Already stopped or gone — ignore
    }
  }
  context.dockerContainers.clear()
}
