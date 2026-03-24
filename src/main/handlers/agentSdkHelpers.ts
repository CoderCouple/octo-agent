/**
 * Helper functions for the Agent SDK IPC handlers.
 * Extracted to keep agentSdk.ts under the line limit.
 */
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'
import { resolveCommand } from '../platform'
import type { AgentSdkMessage } from '../../shared/agentSdkTypes'

export function expandHome(value: string): string {
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  if (value === '~') return homedir()
  return value
}

let messageCounter = 0
export function nextMessageId(): string {
  return `sdk-msg-${String(++messageCounter)}-${String(Date.now())}`
}

export function sendMsg(win: BrowserWindow, sessionId: string, msg: AgentSdkMessage): void {
  win.webContents.send(`agentSdk:message:${sessionId}`, msg)
}

/** Temporarily set CLAUDE_CONFIG_DIR, run a function, then restore. */
export async function withConfigDir<T>(agentEnv: Record<string, string> | undefined, fn: () => Promise<T>): Promise<T> {
  const configDir = agentEnv?.CLAUDE_CONFIG_DIR
  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR
  if (configDir) process.env.CLAUDE_CONFIG_DIR = expandHome(configDir)
  try {
    return await fn()
  } finally {
    if (configDir) {
      if (prevConfigDir) process.env.CLAUDE_CONFIG_DIR = prevConfigDir
      else delete process.env.CLAUDE_CONFIG_DIR
    }
  }
}

export async function handleLoadHistory(
  senderWindow: BrowserWindow,
  sdkSessionId: string,
  sessionId: string,
  agentEnv?: Record<string, string>,
  limit?: number,
): Promise<void> {
  await withConfigDir(agentEnv, async () => {
    const { getSessionMessages } = await import('@anthropic-ai/claude-agent-sdk')
    const allMessages = await getSessionMessages(sdkSessionId)

    const maxMessages = limit ?? 10
    const history = allMessages.length > maxMessages
      ? allMessages.slice(allMessages.length - maxMessages)
      : allMessages

    if (allMessages.length > maxMessages) {
      senderWindow.webContents.send(`agentSdk:historyMeta:${sessionId}`, {
        total: allMessages.length,
        loaded: history.length,
      })
    }

    for (const entry of history) {
      const entryType = (entry as Record<string, unknown>).type as string
      const message = (entry as Record<string, unknown>).message as Record<string, unknown> | undefined
      if (!message) continue
      const content = message.content as Record<string, unknown>[] | string | undefined
      if (!content) continue

      const idPrefix = entryType === 'user' ? 'history-user' : 'history-asst'
      const blocks = typeof content === 'string'
        ? [{ type: 'text', text: content }] as Record<string, unknown>[]
        : Array.isArray(content) ? content : []

      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          sendMsg(senderWindow, sessionId, {
            id: `${idPrefix}-${nextMessageId()}`, type: 'text', timestamp: Date.now(), text: block.text,
          })
        } else if (entryType === 'assistant' && block.type === 'tool_use') {
          sendMsg(senderWindow, sessionId, {
            id: `history-tool-${nextMessageId()}`, type: 'tool_use', timestamp: Date.now(),
            toolName: block.name as string, toolInput: block.input as Record<string, unknown>, toolUseId: block.id as string,
          })
        }
      }
    }
  })
}

export async function handleStatus(
  senderWindow: BrowserWindow,
  sessionId: string,
  sdkSessionId: string | undefined,
  agentEnv?: Record<string, string>,
): Promise<void> {
  const rows: [string, string][] = [
    ['Status', sdkSessionId ? 'Active' : 'Idle'],
    ['Session', sdkSessionId ?? 'none'],
  ]

  try {
    await withConfigDir(agentEnv, async () => {
      const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk')
      const q = sdkQuery({
        prompt: '/cost',
        options: { env: process.env, settingSources: ['user'], maxTurns: 0 },
      })
      const account = await q.accountInfo()
      if (account.email) rows.push(['Account', account.email])
      if (account.subscriptionType) rows.push(['Plan', account.subscriptionType])
      q.close()
    })
  } catch {
    // Ignore
  }

  const tableRows = rows.map(([k, v]) => `| **${k}** | ${v} |`).join('\n')
  const table = `| | |\n|---|---|\n${tableRows}`

  sendMsg(senderWindow, sessionId, {
    id: nextMessageId(), type: 'result', timestamp: Date.now(), result: table,
  })
  senderWindow.webContents.send(`agentSdk:done:${sessionId}`, sdkSessionId ?? '')
}

export async function handleFetchCommands(agentEnv?: Record<string, string>): Promise<{ name: string; description: string }[]> {
  return withConfigDir(agentEnv, async () => {
    try {
      const { query: sdkQuery } = await import('@anthropic-ai/claude-agent-sdk')
      const q = sdkQuery({
        prompt: '/cost',
        options: {
          env: process.env,
          tools: { type: 'preset', preset: 'claude_code' },
          settingSources: ['user', 'project'],
          maxTurns: 0,
        },
      })
      const cmds = await q.supportedCommands()
      q.close()
      return cmds.map((c: Record<string, unknown>) => ({
        name: c.name as string,
        description: (typeof c.description === 'string' ? c.description : '').split('\n')[0].slice(0, 80),
      }))
    } catch {
      return []
    }
  })
}

export function handleLogin(senderWindow: BrowserWindow, sessionId: string): void {
  const claudePath = resolveCommand('claude') ?? 'claude'
  const child = spawn(claudePath, ['login'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (data: Buffer) => { output += data.toString() })
  child.stderr.on('data', (data: Buffer) => { output += data.toString() })

  sendMsg(senderWindow, sessionId, {
    id: nextMessageId(), type: 'system', timestamp: Date.now(),
    text: 'Opening browser for login...',
  })

  child.on('close', (code) => {
    const success = code === 0
    sendMsg(senderWindow, sessionId, {
      id: nextMessageId(),
      type: success ? 'system' : 'error',
      timestamp: Date.now(),
      text: success
        ? 'Login successful. You can now send messages.'
        : `Login failed (exit ${String(code)}). ${output.trim()}`,
    })
    senderWindow.webContents.send(`agentSdk:done:${sessionId}`, '')
  })
}
