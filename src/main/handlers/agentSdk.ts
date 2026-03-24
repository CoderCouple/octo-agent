/**
 * IPC handlers for the Claude Agent SDK integration.
 *
 * Each user message starts a new query() call. Multi-turn context is maintained
 * via the SDK's session resume feature (passing the session ID from the previous
 * query). The SDK process exits after each query completes.
 */
import { BrowserWindow, IpcMain } from 'electron'
import { HandlerContext } from './types'
import type { AgentSdkMessage, AgentSdkPermissionRequest } from '../../shared/agentSdkTypes'
import {
  expandHome, nextMessageId, sendMsg,
  handleLoadHistory, handleStatus, handleFetchCommands, handleLogin,
} from './agentSdkHelpers'

interface PendingPermission {
  resolve: (result: { behavior: 'allow' } | { behavior: 'deny'; message: string }) => void
}

type UserMessage = {
  type: 'user'
  message: { role: 'user'; content: string }
}

/**
 * Async message queue (same pattern as the official simple-chatapp demo).
 * Messages are pushed in via push(), consumed by the SDK via async iteration.
 * The SDK process stays alive as long as the queue is open.
 */
class MessageQueue {
  private messages: UserMessage[] = []
  private waiting: ((msg: UserMessage) => void) | null = null
  private closed = false

  push(content: string): void {
    const msg: UserMessage = { type: 'user', message: { role: 'user', content } }
    if (this.waiting) {
      this.waiting(msg)
      this.waiting = null
    } else {
      this.messages.push(msg)
    }
  }

  close(): void {
    this.closed = true
    if (this.waiting) {
      // Resolve with a dummy that will cause iteration to end
      this.waiting = null
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<UserMessage> {
    while (!this.closed) {
      if (this.messages.length > 0) {
        yield this.messages.shift()!
      } else {
        yield await new Promise<UserMessage>((resolve) => {
          this.waiting = resolve
        })
      }
    }
  }
}

interface ActiveSession {
  sdkSessionId?: string
  abortController: AbortController
  ownerWindow: BrowserWindow
  pendingPermission: PendingPermission | null
  queryObj?: { close(): void }
  messageQueue: MessageQueue
}

// Module-local state
const activeSessions = new Map<string, ActiveSession>()


function processSystemMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  const session = activeSessions.get(sessionId)
  if (session && typeof sdkMessage.session_id === 'string') {
    session.sdkSessionId = sdkMessage.session_id
  }
  const model = typeof sdkMessage.model === 'string' ? sdkMessage.model : 'unknown'
  sendMsg(win, sessionId, {
    id: nextMessageId(),
    type: 'system',
    timestamp: Date.now(),
    text: `Session initialized (model: ${model})`,
  })
}

function processAssistantMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  const message = sdkMessage.message as Record<string, unknown> | undefined
  if (!message) return
  const content = message.content as Record<string, unknown>[] | undefined
  if (!content) return
  const parentId = (sdkMessage.parent_tool_use_id as string | null) ?? null

  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      sendMsg(win, sessionId, {
        id: nextMessageId(),
        type: 'text',
        timestamp: Date.now(),
        text: block.text,
        parentToolUseId: parentId,
      })
    } else if (block.type === 'tool_use') {
      sendMsg(win, sessionId, {
        id: nextMessageId(),
        type: 'tool_use',
        timestamp: Date.now(),
        toolName: block.name as string,
        toolInput: block.input as Record<string, unknown>,
        toolUseId: block.id as string,
        parentToolUseId: parentId,
      })
    }
  }
}

function processUserMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  const message = sdkMessage.message as Record<string, unknown> | undefined
  if (!message) return
  const content = message.content as Record<string, unknown>[] | undefined
  if (!content) return
  const parentId = (sdkMessage.parent_tool_use_id as string | null) ?? null

  for (const block of content) {
    if (block.type !== 'tool_result') continue
    const resultContent = block.content as string | Record<string, unknown>[] | undefined
    let resultText = ''
    if (typeof resultContent === 'string') {
      resultText = resultContent
    } else if (Array.isArray(resultContent)) {
      resultText = resultContent
        .filter((c) => c.type === 'text')
        .map((c) => c.text as string)
        .join('\n')
    }
    if (resultText.length > 5000) {
      resultText = `${resultText.slice(0, 5000)}\n... (truncated)`
    }
    sendMsg(win, sessionId, {
      id: nextMessageId(),
      type: 'tool_result',
      timestamp: Date.now(),
      toolUseId: block.tool_use_id as string,
      toolResult: resultText,
      isError: (block.is_error as boolean | undefined) === true,
      parentToolUseId: parentId,
    })
  }
}

function processResultMessage(sessionId: string, sdkMessage: Record<string, unknown>, win: BrowserWindow): void {
  sendMsg(win, sessionId, {
    id: nextMessageId(),
    type: 'result',
    timestamp: Date.now(),
    result: typeof sdkMessage.result === 'string' ? sdkMessage.result : undefined,
    costUsd: sdkMessage.total_cost_usd as number | undefined,
    durationMs: sdkMessage.duration_ms as number | undefined,
    numTurns: sdkMessage.num_turns as number | undefined,
  })
}

function processAndSendMessage(
  sessionId: string,
  sdkMessage: Record<string, unknown>,
  win: BrowserWindow,
): void {
  const type = sdkMessage.type as string

  if (type === 'system' && sdkMessage.subtype === 'init') {
    processSystemMessage(sessionId, sdkMessage, win)
  } else if (type === 'assistant') {
    processAssistantMessage(sessionId, sdkMessage, win)
  } else if (type === 'user') {
    processUserMessage(sessionId, sdkMessage, win)
  } else if (type === 'result') {
    processResultMessage(sessionId, sdkMessage, win)
  }
}

/**
 * Start a persistent SDK session using an async message queue as the prompt.
 * The SDK process stays alive and consumes messages from the queue.
 * Follow-up messages are pushed into the queue via agentSdk:send.
 *
 * This is the same pattern used by the official simple-chatapp demo.
 */
async function startSession(
  sessionId: string,
  firstPrompt: string,
  cwd: string,
  win: BrowserWindow,
  options: {
    sdkSessionId?: string
    skipApproval: boolean
    env?: Record<string, string>
  },
): Promise<void> {
  console.log('[agentSdk] startSession', sessionId, 'cwd:', cwd, 'skipApproval:', options.skipApproval)
  const { query } = await import('@anthropic-ai/claude-agent-sdk')

  const abortController = new AbortController()
  const messageQueue = new MessageQueue()

  const session: ActiveSession = {
    sdkSessionId: options.sdkSessionId,
    abortController,
    ownerWindow: win,
    pendingPermission: null,
    messageQueue,
  }
  activeSessions.set(sessionId, session)

  // Build env: process.env as base, agent-specific env vars merged on top
  const agentEnv: Record<string, string> = {}
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      agentEnv[key] = expandHome(value)
    }
  }
  const env = { ...process.env, ...agentEnv }

  const queryOptions: Record<string, unknown> = {
    abortController,
    cwd,
    env,
    tools: { type: 'preset', preset: 'claude_code' },
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    settingSources: ['user', 'project'],
  }

  if (options.sdkSessionId && options.sdkSessionId.length > 0) {
    queryOptions.resume = options.sdkSessionId
  }

  if (options.skipApproval) {
    queryOptions.permissionMode = 'bypassPermissions'
    queryOptions.allowDangerouslySkipPermissions = true
  } else {
    queryOptions.canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      canUseToolOptions: { toolUseID: string; decisionReason?: string },
    ) => {
      const permReq: AgentSdkPermissionRequest = {
        id: `perm-${String(Date.now())}`,
        toolName,
        toolInput: input,
        toolUseId: canUseToolOptions.toolUseID,
        decisionReason: canUseToolOptions.decisionReason,
      }
      win.webContents.send(`agentSdk:permission:${sessionId}`, permReq)

      return new Promise<{ behavior: 'allow' } | { behavior: 'deny'; message: string }>((resolve) => {
        const activeSession = activeSessions.get(sessionId)
        if (activeSession) {
          activeSession.pendingPermission = { resolve }
        }
      })
    }
  }

  // Push the first message into the queue, then pass the queue as the prompt.
  // The SDK iterates the queue — it stays alive waiting for more messages.
  messageQueue.push(firstPrompt)

  const queryObj = query({
    prompt: messageQueue as unknown as Parameters<typeof query>[0]['prompt'],
    options: queryOptions as Parameters<typeof query>[0]['options'],
  })
  session.queryObj = queryObj

  try {
    for await (const message of queryObj) {
      if (!activeSessions.has(sessionId)) break
      const msg = message as unknown as Record<string, unknown>
      processAndSendMessage(sessionId, msg, win)

      // When a result arrives, the current turn is done — signal idle
      if (msg.type === 'result') {
        const sdkSessionId = session.sdkSessionId ?? ''
        win.webContents.send(`agentSdk:done:${sessionId}`, sdkSessionId)
      }
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (errorMessage.includes('aborted')) {
      // User cancelled — not an error
    } else if (errorMessage.includes('No conversation found') && options.sdkSessionId) {
      // Stale session ID — retry without resume
      console.log('[agentSdk] Stale session ID, retrying without resume')
      activeSessions.delete(sessionId)
      void startSession(sessionId, firstPrompt, cwd, win, {
        ...options,
        sdkSessionId: undefined,
      })
      return
    } else {
      win.webContents.send(`agentSdk:error:${sessionId}`, errorMessage)
    }
  } finally {
    activeSessions.delete(sessionId)
  }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('agentSdk:start', (_event, options: {
    id: string
    prompt: string
    cwd: string
    sdkSessionId?: string
    skipApproval: boolean
    env?: Record<string, string>
  }) => {
    if (ctx.isE2ETest) {
      const senderWindow = BrowserWindow.fromWebContents(_event.sender)
      if (!senderWindow) return { id: options.id }

      const initMsg: AgentSdkMessage = {
        id: nextMessageId(),
        type: 'system',
        timestamp: Date.now(),
        text: 'Session initialized (model: claude-sonnet-4-20250514)',
      }
      senderWindow.webContents.send(`agentSdk:message:${options.id}`, initMsg)

      setTimeout(() => {
        const textMsg: AgentSdkMessage = {
          id: nextMessageId(),
          type: 'text',
          timestamp: Date.now(),
          text: "I'll help you with that. Let me look at the codebase.",
        }
        senderWindow.webContents.send(`agentSdk:message:${options.id}`, textMsg)

        setTimeout(() => {
          const resultMsg: AgentSdkMessage = {
            id: nextMessageId(),
            type: 'result',
            timestamp: Date.now(),
            result: 'Task completed successfully.',
            costUsd: 0.01,
            durationMs: 2000,
            numTurns: 1,
          }
          senderWindow.webContents.send(`agentSdk:message:${options.id}`, resultMsg)
          senderWindow.webContents.send(`agentSdk:done:${options.id}`, 'mock-session-id')
        }, 500)
      }, 200)

      return { id: options.id }
    }

    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return { id: options.id }

    // Kill any existing session with the same ID
    const existing = activeSessions.get(options.id)
    if (existing) {
      existing.messageQueue.close()
      existing.abortController.abort()
      activeSessions.delete(options.id)
    }

    void startSession(options.id, options.prompt, options.cwd, senderWindow, {
      sdkSessionId: options.sdkSessionId,
      skipApproval: options.skipApproval,
      env: options.env,
    })

    return { id: options.id }
  })

  // Send a follow-up message to an existing session via the message queue.
  // If no session exists, starts a new one.
  ipcMain.handle('agentSdk:send', (_event, id: string, prompt: string, options?: {
    sdkSessionId?: string; cwd?: string; skipApproval?: boolean; env?: Record<string, string>
  }) => {
    const existing = activeSessions.get(id)
    if (existing) {
      // Push into the queue — the SDK process picks it up
      console.log('[agentSdk] send: pushing to queue for', id)
      existing.messageQueue.push(prompt)
      return
    }

    // No active session — start a new one with the correct cwd
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return

    const cwd = options?.cwd ?? process.cwd()
    console.log('[agentSdk] send: no active session, starting new. cwd:', cwd, 'skipApproval:', options?.skipApproval)
    void startSession(id, prompt, cwd, senderWindow, {
      sdkSessionId: options?.sdkSessionId,
      skipApproval: options?.skipApproval ?? false,
      env: options?.env,
    })
  })

  ipcMain.handle('agentSdk:stop', (_event, id: string) => {
    const session = activeSessions.get(id)
    if (session) {
      session.messageQueue.close()
      session.abortController.abort()
      if (session.queryObj) {
        (session.queryObj as { close(): void }).close()
      }
      activeSessions.delete(id)
    }
  })

  ipcMain.handle('agentSdk:respond', (_event, id: string, _toolUseId: string, allowed: boolean, updatedInput?: Record<string, unknown>) => {
    const session = activeSessions.get(id)
    if (session?.pendingPermission) {
      if (allowed) {
        session.pendingPermission.resolve({
          behavior: 'allow',
          ...(updatedInput ? { updatedInput } : {}),
        })
      } else {
        session.pendingPermission.resolve({ behavior: 'deny', message: 'User denied permission' })
      }
      session.pendingPermission = null
    }
  })

  ipcMain.handle('agentSdk:loadHistory', async (_event, sdkSessionId: string, sessionId: string, agentEnv?: Record<string, string>, limit?: number) => {
    if (ctx.isE2ETest || !sdkSessionId || sdkSessionId.length === 0) return
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return
    try {
      await handleLoadHistory(senderWindow, sdkSessionId, sessionId, agentEnv, limit)
    } catch (err) {
      console.warn('[agentSdk] Failed to load history:', err instanceof Error ? err.message : err)
    }
  })

  ipcMain.handle('agentSdk:login', (_event, sessionId: string) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return
    handleLogin(senderWindow, sessionId)
  })

  ipcMain.handle('agentSdk:status', async (_event, sessionId: string, agentEnv?: Record<string, string>) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender)
    if (!senderWindow) return
    const session = activeSessions.get(sessionId)
    await handleStatus(senderWindow, sessionId, session?.sdkSessionId, agentEnv)
  })

  ipcMain.handle('agentSdk:commands', async (_event, agentEnv?: Record<string, string>) => {
    return handleFetchCommands(agentEnv)
  })
}
