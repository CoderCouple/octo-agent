# OctoAgent — Complete Build Plan for Claude Code
# Feed this entire file to Claude Code at the start of each session.
# One brain. Many agents.

---

## OVERVIEW

OctoAgent is a desktop app (Electron + React + TypeScript) for solo developers
running multiple AI coding agents simultaneously. It is forked from Broomy
(https://github.com/broomy-ai/broomy) and extended with a WebSocket gateway,
supervisor engine, WhatsApp-style chat per agent, attention queue, phone push
decisions, agent-to-agent briefing, session memory, and multi-channel support.

The core mental model: you are the director, the agents are the arms. You stop
watching terminals and start making decisions — from your desk, your phone,
Slack, or WhatsApp.

---

## TECH STACK

- Electron + electron-vite (app shell, from Broomy)
- React + TypeScript + Tailwind (UI, from Broomy)
- Zustand (state management)
- node-pty + xterm.js (terminal emulation, from Broomy — do not modify)
- Monaco Editor (file viewer, from Broomy — do not modify)
- ws (npm) — WebSocket server for the gateway
- Anthropic SDK (@anthropic-ai/sdk) — Claude API for memory + briefings
- caffeinate (macOS CLI) — sleep prevention

---

## REPOSITORY SETUP

Start by forking Broomy:

  git clone https://github.com/broomy-ai/broomy.git octoagent
  cd octoagent
  pnpm install

Then install additional dependencies:

  pnpm add ws
  pnpm add @anthropic-ai/sdk
  pnpm add @types/ws -D

Then delete the following from Broomy before building anything new:
- src/renderer/components/Review.tsx (AI code review panel — not our feature)
- All profile/multi-window code in src/renderer/store/profiles.ts
- All GitHub IPC handlers (gh CLI integration) in src/main/index.ts
- Profile entries from src/renderer/panels/builtinPanels.tsx

---

## DIRECTORY STRUCTURE (FINAL)

```
octoagent/
  src/
    main/
      index.ts                    Electron main, app entry, IPC bootstrap
      gateway/
        index.ts                  Gateway class — WebSocket server :18789
        frameValidator.ts         Connect-first rule, JSON schema validation
        sessionRouter.ts          Maps channel identity → sessionId
        broadcaster.ts            Push events to all subscribed WS clients
        adapters/
          ptyAdapter.ts           node-pty onData → gateway.emit()
          hookAdapter.ts          HTTP server :random, Claude Code hooks
          phoneAdapter.ts         HTTP server :9876, receives phone replies
          slackAdapter.ts         (v2) Bolt SDK, Slack webhook normalize
          whatsappAdapter.ts      (v2) Baileys, QR pair, normalize
          telegramAdapter.ts      (v2) Bot API, setWebhook, normalize
      supervisor/
        index.ts                  Supervisor class, EventEmitter, orchestrates all
        sessionQueue.ts           Map<sessionId, Promise> lane queue
        conflictDetector.ts       Map<filePath, Set<sessionId>> ownership
        sessionMemory.ts          JSONL append + memory.md flush on done
        briefingEngine.ts         Claude API call, generates agent briefings
        reportGenerator.ts        Claude API call, generates end-of-session report
        sleepGuard.ts             Spawns/kills caffeinate process
        hitl.ts                   4-layer decision system + auto-rule matching
        parsers/
          claudeCode.ts           Hook events primary + PTY regex fallback
          gemini.ts               Regex on ANSI-stripped PTY output
          codex.ts                Regex on ANSI-stripped PTY output
      notifications/
        push.ts                   POST to Cloudflare Worker, triggers APNs
    preload/
      index.ts                    Minimal IPC bridge — only exposes WS port
    renderer/
      App.tsx                     Root component
      components/
        ChatPanel.tsx             WhatsApp-style per-agent chat thread
        DecisionCard.tsx          Yes/No/Auto buttons + hard stop variant
        AttentionQueue.tsx        Triage feed sidebar, 5 items max
        PersonaCard.tsx           Session creation form, persona config
        ReportCard.tsx            End-of-session report display
        Terminal.tsx              FROM BROOMY — do not modify
        FileViewer.tsx            FROM BROOMY — do not modify
        SessionList.tsx           EXTENDED from Broomy — adds status field
        MenuBarStatus.tsx         Coffee cup icon, mode switcher
      store/
        chat.ts                   Messages per session, decision state
        queue.ts                  Attention queue items
        sessions.ts               EXTENDED from Broomy — adds status + persona
        gateway.ts                WS connection state, send helper
      hooks/
        useGateway.ts             React hook for WS connection + event dispatch
  ~/.octoagent/                   Runtime data (created at first launch)
    config.json
    personas/
    sessions/<id>/
      transcript.jsonl
      memory.md
      report.md
      incidents/
```

---

## COMPONENT 1: GATEWAY

File: src/main/gateway/index.ts

The Gateway is a WebSocket server at ws://127.0.0.1:18789. It is the single
control plane. Everything connects here. The supervisor never sees raw channel
data — only typed AgentEvent objects.

### Responsibilities
- Run WebSocketServer on port 18789 (or next available port)
- Enforce connect-first rule (close socket if first frame is not connect)
- Authenticate connecting clients via token in connect frame
- Route incoming messages through channel adapters → event normalizer → supervisor
- Broadcast AgentEvent objects from supervisor to all subscribed clients
- Maintain client registry (Map<clientId, WebSocket>)
- Handle dedup cache (short-lived Map<idempotencyKey, timestamp>)
- 100ms debounce on rapid text messages from same session

### WS Frame Protocol

Three frame types only:

Request (client → gateway):
  { type: "req", id: "uuid", method: string, params: object }

Response (gateway → client):
  { type: "res", id: "uuid", ok: boolean, payload?: object, error?: string }

Event (gateway → all clients, server push):
  { type: "event", event: string, payload: object, sessionId?: string }

Methods the gateway accepts:
- connect    { role: "operator"|"node", token: string, deviceId: string, version: "1" }
- send       { sessionId: string, text: string, idempotencyKey: string }
- resolve    { sessionId: string, decisionId: string, answer: string, idempotencyKey: string }
- status     { sessionId: string }
- brief      { fromSessionId: string, toSessionId: string }
- setMode    { mode: "focused"|"away"|"autonomous" }

Events the gateway pushes:
- agentEvent    { sessionId, type, detail } — working/done/waitingForInput/fileChanged/conflict
- decision      { sessionId, decisionId, question, options, layer }
- presence      { clientId, role, connected }
- heartbeat     { ts } — every 30 seconds
- memoryUpdate  { sessionId, summary } — when memory.md is refreshed
- report        { sessionId, content } — when report.md is generated

### Implementation notes
- Use the ws npm package (not socket.io)
- Store connected clients: Map<string, { ws: WebSocket, role: string, deviceId: string }>
- Broadcast helper: iterate all clients, send if role matches subscription
- Idempotency: Map<key, timestamp>, expire after 60 seconds
- On client disconnect: remove from map, emit presence event to remaining clients
- Expose getPort() method so preload can send the port to renderer on startup

### Code skeleton

```typescript
import { WebSocketServer, WebSocket } from 'ws'
import { supervisor } from '../supervisor'

export class Gateway {
  private wss: WebSocketServer
  private clients = new Map<string, { ws: WebSocket, role: string }>()
  private dedupe = new Map<string, number>()
  private port: number

  async start() {
    this.port = await findFreePort(18789)
    this.wss = new WebSocketServer({ port: this.port })
    this.wss.on('connection', ws => this.onConnection(ws))
    supervisor.on('agentEvent', event => this.broadcast('agentEvent', event))
    supervisor.on('decision', event => this.broadcast('decision', event))
    supervisor.on('report', event => this.broadcast('report', event))
    setInterval(() => this.broadcast('heartbeat', { ts: Date.now() }), 30000)
  }

  private onConnection(ws: WebSocket) {
    let authed = false
    let clientId: string

    ws.on('message', raw => {
      const frame = JSON.parse(raw.toString())
      if (!authed) {
        if (frame.method !== 'connect') { ws.close(); return }
        clientId = frame.params.deviceId
        this.clients.set(clientId, { ws, role: frame.params.role })
        authed = true
        ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true }))
        this.broadcast('presence', { clientId, role: frame.params.role, connected: true })
        return
      }
      this.handleFrame(frame, ws)
    })

    ws.on('close', () => {
      if (clientId) {
        this.clients.delete(clientId)
        this.broadcast('presence', { clientId, connected: false })
      }
    })
  }

  private handleFrame(frame: any, ws: WebSocket) {
    if (frame.type !== 'req') return
    // check idempotency key for send/resolve
    if (frame.params?.idempotencyKey) {
      if (this.dedupe.has(frame.params.idempotencyKey)) {
        ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { deduped: true } }))
        return
      }
      this.dedupe.set(frame.params.idempotencyKey, Date.now())
    }

    switch (frame.method) {
      case 'send':
        supervisor.handleUserMessage(frame.params.sessionId, frame.params.text)
        break
      case 'resolve':
        supervisor.resolveDecision(frame.params.sessionId, frame.params.decisionId, frame.params.answer)
        break
      case 'status':
        const status = supervisor.getStatus(frame.params.sessionId)
        ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: status }))
        return
      case 'brief':
        supervisor.briefAgent(frame.params.fromSessionId, frame.params.toSessionId)
        break
      case 'setMode':
        supervisor.setMode(frame.params.mode)
        break
    }
    ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true }))
  }

  broadcast(event: string, payload: object) {
    const frame = JSON.stringify({ type: 'event', event, payload })
    this.clients.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame)
    })
  }

  getPort() { return this.port }
}

export const gateway = new Gateway()
```

---

## COMPONENT 2: CHANNEL ADAPTERS

File: src/main/gateway/adapters/

Each adapter does exactly one thing: normalize external input → emit to gateway.

### ChannelAdapter interface

```typescript
interface ChannelAdapter {
  name: string
  start(): Promise<void>
  stop(): void
  send(sessionId: string, message: OutboundMessage): Promise<void>
}

interface InboundMessage {
  source: string       // 'pty' | 'hook' | 'phone' | 'slack' | 'whatsapp'
  sessionId: string
  data: unknown
  idempotencyKey: string
}

interface OutboundMessage {
  type: 'decision' | 'agentEvent' | 'report' | 'text'
  content: string
  options?: string[]
  decisionId?: string
}
```

### PTY Adapter (v1)

File: src/main/gateway/adapters/ptyAdapter.ts

Receives raw byte stream from node-pty for each session. Strips ANSI codes.
Emits to gateway with source='pty'.

```typescript
export function attachPtyAdapter(sessionId: string, ptyProcess: IPty) {
  ptyProcess.onData(data => {
    gateway.emit('inbound', {
      source: 'pty',
      sessionId,
      data: stripAnsi(data),
      idempotencyKey: `pty-${sessionId}-${Date.now()}`
    })
  })
}
```

### Hook Adapter (v1)

File: src/main/gateway/adapters/hookAdapter.ts

HTTP server on a random port. Claude Code sends POST requests here when hooks
fire. Inject the hook config into ~/.claude/settings.json when launching a
Claude Code session.

Hook config to inject:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": ".*",
      "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:PORT/hook -d @-" }]
    }],
    "Stop": [{
      "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:PORT/hook -d @-" }]
    }]
  }
}
```

The hook payload contains: hook_type, tool_name, tool_input, tool_response.

### Phone Adapter (v1)

File: src/main/gateway/adapters/phoneAdapter.ts

HTTP server at port 9876. Receives POST /decision from Cloudflare Worker when
user taps a button on iPhone notification.

Payload: { decisionId: string, answer: string, sessionId: string }

On receive: emit to gateway with source='phone', which supervisor routes to
resolveDecision().

### Slack Adapter (v2 — scaffold only in v1)

File: src/main/gateway/adapters/slackAdapter.ts

Uses @slack/bolt SDK. Receives action webhooks when user clicks Block Kit
buttons. Normalizes to InboundMessage. send() method posts a Block Kit message
with decision buttons.

Decision message format:
```
OctoAgent — Agent needs a decision
{question}
[Option 1] [Option 2] [View context]
```

When user clicks a button, Slack sends action webhook → normalize → gateway →
supervisor.resolveDecision().

### WhatsApp Adapter (v2 — scaffold only in v1)

File: src/main/gateway/adapters/whatsappAdapter.ts

Uses baileys library. QR code pairing on first launch. Receives messages →
normalize → gateway. send() sends WhatsApp message with numbered options.

### Telegram Adapter (v2 — scaffold only in v1)

File: src/main/gateway/adapters/telegramAdapter.ts

Uses Telegram Bot API. setWebhook on start. Receives updates → normalize →
gateway. send() sends message with inline keyboard buttons.

---

## COMPONENT 3: SUPERVISOR

File: src/main/supervisor/index.ts

The Supervisor is the brain. It receives only typed AgentEvent objects. It
never sees raw channel data. It is an EventEmitter. The gateway subscribes to
its events and broadcasts them to clients.

### AgentEvent types

```typescript
type AgentEvent =
  | { type: 'working';         sessionId: string; detail: string }
  | { type: 'waitingForInput'; sessionId: string; question: string; options: string[]; decisionId: string }
  | { type: 'done';            sessionId: string; summary: string }
  | { type: 'fileChanged';     sessionId: string; path: string; operation: 'read'|'write'|'edit' }
  | { type: 'conflict';        sessionId: string; path: string; conflictingSessions: string[] }
  | { type: 'error';           sessionId: string; detail: string }
```

### Supervisor class

```typescript
import { EventEmitter } from 'events'
import { SessionQueue } from './sessionQueue'
import { ConflictDetector } from './conflictDetector'
import { SessionMemory } from './sessionMemory'
import { BriefingEngine } from './briefingEngine'
import { ReportGenerator } from './reportGenerator'
import { SleepGuard } from './sleepGuard'
import { HITL } from './hitl'

export class Supervisor extends EventEmitter {
  private queue = new SessionQueue()
  private conflict = new ConflictDetector()
  private memory = new SessionMemory()
  private briefing = new BriefingEngine()
  private report = new ReportGenerator()
  private sleep = new SleepGuard()
  private hitl = new HITL()
  private sessions = new Map<string, SessionState>()
  private mode: 'focused'|'away'|'autonomous' = 'focused'

  handleInbound(msg: InboundMessage) {
    this.queue.enqueue(msg.sessionId, async () => {
      const parser = this.getParser(msg.sessionId)
      if (!parser) return
      const events = parser.process(msg)
      for (const event of events) {
        await this.handleEvent(event)
      }
    })
  }

  private async handleEvent(event: AgentEvent) {
    // log everything to disk
    this.memory.record(event.sessionId, event)

    // conflict detection on file changes
    if (event.type === 'fileChanged') {
      const conflicts = this.conflict.record(event.sessionId, event.path)
      if (conflicts.length > 0) {
        const conflictEvent = { type: 'conflict' as const, sessionId: event.sessionId, path: event.path, conflictingSessions: conflicts }
        this.emit('agentEvent', conflictEvent)
        this.hitl.hardStop(event.sessionId, conflictEvent)
        return
      }
    }

    // HITL layer check for waitingForInput
    if (event.type === 'waitingForInput') {
      const resolved = await this.hitl.check(event)
      if (resolved) return // auto-decided
    }

    // sleep guard
    if (event.type === 'working' || event.type === 'waitingForInput') {
      this.sleep.prevent()
    }

    // flush memory and generate report on done
    if (event.type === 'done') {
      await this.memory.flush(event.sessionId)
      const allDone = [...this.sessions.values()].every(s => s.status === 'done' || s.status === 'idle')
      if (allDone) {
        this.sleep.allow()
        const reportContent = await this.report.generate(event.sessionId)
        this.emit('report', { sessionId: event.sessionId, content: reportContent })
      }
    }

    // broadcast to all gateway clients
    this.emit('agentEvent', event)
    this.updateSessionStatus(event.sessionId, event.type)
  }

  handleUserMessage(sessionId: string, text: string) {
    // write directly to PTY
    const pty = this.sessions.get(sessionId)?.pty
    if (pty) pty.write(text + '\n')
  }

  resolveDecision(sessionId: string, decisionId: string, answer: string) {
    this.hitl.resolve(sessionId, decisionId, answer)
    const char = answer.toLowerCase() === 'yes' ? 'y' : 'n'
    const pty = this.sessions.get(sessionId)?.pty
    if (pty) pty.write(char + '\n')
  }

  async briefAgent(fromId: string, toId: string) {
    const briefing = await this.briefing.generate(fromId, this.getPersona(toId))
    const pty = this.sessions.get(toId)?.pty
    if (pty) pty.write(`\n[Context from another agent]: ${briefing}\n`)
  }

  setMode(mode: 'focused'|'away'|'autonomous') { this.mode = mode }
  getStatus(sessionId: string) { return this.sessions.get(sessionId) }
}

export const supervisor = new Supervisor()
```

---

## COMPONENT 4: SESSION QUEUE

File: src/main/supervisor/sessionQueue.ts

Guarantees one active run per session. Parallel across sessions.
Uses a Map of Promise chains — one chain per sessionId.

```typescript
export class SessionQueue {
  private lanes = new Map<string, Promise<void>>()
  private maxConcurrent = 10
  private activeCount = 0

  async enqueue(sessionId: string, task: () => Promise<void>): Promise<void> {
    const current = this.lanes.get(sessionId) ?? Promise.resolve()
    const next = current.then(async () => {
      if (this.activeCount >= this.maxConcurrent) {
        await this.waitForSlot()
      }
      this.activeCount++
      try {
        await task()
      } finally {
        this.activeCount--
      }
    }).catch(() => {})
    this.lanes.set(sessionId, next)
    return next
  }

  private waitForSlot(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100))
  }

  clear(sessionId: string) {
    this.lanes.delete(sessionId)
  }
}
```

---

## COMPONENT 5: AGENT PARSERS

### Parser interface

```typescript
interface AgentParser {
  agentType: 'claude' | 'gemini' | 'codex'
  processHook?(payload: unknown): AgentEvent[]   // Claude Code only
  processPty(strippedData: string): AgentEvent[] // all parsers
}
```

### Claude Code Parser

File: src/main/supervisor/parsers/claudeCode.ts

Primary: hook events (structured JSON from hook server)
Fallback: PTY regex for permission prompts

Hook event handling:
- PostToolUse + tool_name Write/Edit/MultiEdit → fileChanged event
- PostToolUse + tool_name Bash → working event with command detail
- PostToolUse + tool_name Read → fileChanged read event
- Stop → done event with stop_reason

PTY fallback regex patterns:
- /Do you want to|proceed\?|Y\/n|\(y\/n\)/i → waitingForInput
- /✔|✓|Done|Completed/i → working
- /Error:|Failed:/i → error

When launching a Claude Code session, write hook config to
~/.claude/settings.json before spawning the PTY.

### Gemini Parser

File: src/main/supervisor/parsers/gemini.ts

Pure regex on ANSI-stripped PTY output. Buffer-based line parser.

Buffer all incoming data. Split on newlines. Keep partial last line in buffer.

Patterns to detect (in order):
- /✦\s+Writing\s+(.+)/ → fileChanged write, extract path from capture group
- /✦\s+Reading\s+(.+)/ → fileChanged read
- /✦\s+Editing\s+(.+)/ → fileChanged edit
- /✦\s+(Searching|Running|Executing)/ → working
- /Allow edit to|proceed\?|Y\/n|\(y\/n\)/i → waitingForInput
- /╰─\s+\$/ → done (prompt returned)
- /Error:|failed:/i → error

### Codex Parser

File: src/main/supervisor/parsers/codex.ts

Pure regex on ANSI-stripped PTY output.

Patterns to detect:
- /●\s+thinking/ → working
- /▸\s+run:\s+(.+)/ → working with command detail
- /▸\s+edit:\s+(.+)/ → fileChanged edit
- /▸\s+write:\s+(.+)/ → fileChanged write
- /Apply patch\?|Y\/N/i → waitingForInput
- /^❯\s*$/ → done (idle prompt, no spinner)

---

## COMPONENT 6: CONFLICT DETECTOR

File: src/main/supervisor/conflictDetector.ts

Maintains a map of which sessions have touched which files.
On every fileChanged event, checks for overlapping ownership.

```typescript
export class ConflictDetector {
  // filePath → Set of sessionIds that have touched it
  private fileOwners = new Map<string, Set<string>>()
  // sessionId → Set of filePaths it has touched
  private sessionFiles = new Map<string, Set<string>>()

  record(sessionId: string, filePath: string): string[] {
    // normalize path
    const normalized = path.resolve(filePath)

    if (!this.fileOwners.has(normalized)) {
      this.fileOwners.set(normalized, new Set())
    }
    if (!this.sessionFiles.has(sessionId)) {
      this.sessionFiles.set(sessionId, new Set())
    }

    this.fileOwners.get(normalized)!.add(sessionId)
    this.sessionFiles.get(sessionId)!.add(normalized)

    // return all OTHER sessions that have touched this file
    const conflicts = [...this.fileOwners.get(normalized)!]
      .filter(id => id !== sessionId)

    return conflicts
  }

  getSessionFiles(sessionId: string): string[] {
    return [...(this.sessionFiles.get(sessionId) ?? [])]
  }

  clearSession(sessionId: string) {
    const files = this.sessionFiles.get(sessionId)
    if (files) {
      files.forEach(f => this.fileOwners.get(f)?.delete(sessionId))
    }
    this.sessionFiles.delete(sessionId)
  }
}
```

---

## COMPONENT 7: SESSION MEMORY

File: src/main/supervisor/sessionMemory.ts

Two storage tiers:
1. transcript.jsonl — append-only, every event, recovery source
2. memory.md — curated summary, flushed via Claude API on agent done

```typescript
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'

const OCTOAGENT_DIR = path.join(process.env.HOME!, '.octoagent')
const client = new Anthropic()

export class SessionMemory {
  // in-memory buffer: last 50 events per session
  private buffers = new Map<string, AgentEvent[]>()

  record(sessionId: string, event: AgentEvent) {
    // write to transcript.jsonl
    const dir = this.sessionDir(sessionId)
    fs.mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({ ...event, ts: Date.now() }) + '\n'
    fs.appendFileSync(path.join(dir, 'transcript.jsonl'), line)

    // update RAM buffer
    if (!this.buffers.has(sessionId)) this.buffers.set(sessionId, [])
    const buf = this.buffers.get(sessionId)!
    buf.push(event)
    if (buf.length > 50) buf.shift()
  }

  getSummary(sessionId: string): string {
    const buf = this.buffers.get(sessionId) ?? []
    return buf.slice(-10).map(e => {
      if (e.type === 'fileChanged') return `• ${e.operation} ${e.path}`
      if (e.type === 'done') return `• Completed: ${e.summary}`
      if (e.type === 'working') return `• ${e.detail}`
      return `• ${e.type}`
    }).join('\n')
  }

  async flush(sessionId: string): Promise<void> {
    const summary = this.getSummary(sessionId)
    if (!summary) return

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Write a 3-5 sentence memory summary of what this coding agent did. Be specific about files changed and why. Format as plain text, no headers.\n\n${summary}`
      }]
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    const memPath = path.join(this.sessionDir(sessionId), 'memory.md')
    fs.writeFileSync(memPath, `# Session memory\n\n${content}\n\nLast updated: ${new Date().toISOString()}\n`)
  }

  loadMemory(sessionId: string): string | null {
    const memPath = path.join(this.sessionDir(sessionId), 'memory.md')
    if (fs.existsSync(memPath)) return fs.readFileSync(memPath, 'utf8')
    return null
  }

  private sessionDir(sessionId: string): string {
    return path.join(OCTOAGENT_DIR, 'sessions', sessionId)
  }
}
```

---

## COMPONENT 8: BRIEFING ENGINE

File: src/main/supervisor/briefingEngine.ts

Called when an agent finishes and another agent needs context from it.
Reads session memory, filters by target persona's allowed paths, calls Claude API.

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export class BriefingEngine {
  async generate(fromSessionId: string, toPersona: Persona, memory: SessionMemory): Promise<string> {
    const log = memory.getSummary(fromSessionId)
    if (!log) return ''

    const allowedPathsContext = toPersona.allowedPaths.length > 0
      ? `The receiving agent is responsible for: ${toPersona.allowedPaths.join(', ')}.`
      : ''

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Summarize what this coding agent did in 2-3 sentences for another agent that needs to continue related work.
${allowedPathsContext}
Only include what is relevant to the receiving agent. Be specific about files changed and interfaces modified.

Agent activity:
${log}`
      }]
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  }
}
```

---

## COMPONENT 9: REPORT GENERATOR

File: src/main/supervisor/reportGenerator.ts

Called when all sessions reach done. Reads full transcript.jsonl for the
session and generates a structured report.md via Claude API.

```typescript
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

const client = new Anthropic()
const OCTOAGENT_DIR = path.join(process.env.HOME!, '.octoagent')

export class ReportGenerator {
  async generate(sessionId: string): Promise<string> {
    const transcriptPath = path.join(OCTOAGENT_DIR, 'sessions', sessionId, 'transcript.jsonl')
    if (!fs.existsSync(transcriptPath)) return ''

    const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n')
    const events = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

    // take last 100 events for the report
    const relevant = events.slice(-100)
    const eventSummary = relevant.map(e => {
      if (e.type === 'fileChanged') return `${e.operation}: ${e.path}`
      if (e.type === 'done') return `done: ${e.summary}`
      if (e.type === 'working') return `working: ${e.detail}`
      if (e.type === 'waitingForInput') return `decision: ${e.question}`
      return e.type
    }).join('\n')

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Generate a structured end-of-session report for a coding agent session.

Use this format exactly:
## What was built
[2-3 sentences]

## Files changed
[bullet list of files with one-line descriptions]

## Decisions made
[bullet list of decisions and how they were resolved]

## Still needs attention
[bullet list or "Nothing outstanding"]

Event log:
${eventSummary}`
      }]
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    const reportPath = path.join(OCTOAGENT_DIR, 'sessions', sessionId, 'report.md')
    fs.writeFileSync(reportPath, content)
    return content
  }
}
```

---

## COMPONENT 10: HITL (HUMAN IN THE LOOP)

File: src/main/supervisor/hitl.ts

Four-layer decision system. Every agent action hits the first matching layer.

Layer 1 — Never ask: action within persona allowed_paths + allowed_commands
Layer 2 — Auto-decide: rule matches in config.json, silent resolution
Layer 3 — Soft interrupt: decision card, 60s timer, push to channels
Layer 4 — Hard interrupt: conflict or disallowed path, push immediately

Auto-rule format in config.json:
```json
{
  "rules": [
    { "pattern": "merge.*tests pass", "answer": "yes" },
    { "pattern": "approve lint", "answer": "yes" }
  ],
  "_answerHistory": {
    "merge.*": { "yes": 3, "no": 0 }
  }
}
```

After 3 same answers to same pattern → emit suggestion event to suggest saving rule.

```typescript
import fs from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.env.HOME!, '.octoagent', 'config.json')

export class HITL {
  private pendingDecisions = new Map<string, { resolve: Function, timer: NodeJS.Timeout }>()
  private mode: 'focused'|'away'|'autonomous' = 'focused'

  async check(event: AgentEvent & { type: 'waitingForInput' }): Promise<boolean> {
    const config = this.loadConfig()
    const persona = this.getPersona(event.sessionId)

    // Layer 1: check allowed paths/commands
    if (persona && this.isAllowed(event.question, persona)) {
      return false // let it through, do not interrupt
    }

    // Layer 2: check auto-rules
    const rule = config.rules?.find(r => new RegExp(r.pattern, 'i').test(event.question))
    if (rule) {
      this.applyRule(event.sessionId, event.decisionId, rule.answer)
      this.recordAnswer(event.question, rule.answer)
      return true // auto-resolved
    }

    // Layer 3: soft interrupt
    // emit decision event (gateway will broadcast to all clients)
    // start 60s timer, then push to phone if not resolved
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pushToChannels(event)
        // in autonomous mode, auto-approve after push
        if (this.mode === 'autonomous') {
          this.applyRule(event.sessionId, event.decisionId, 'yes')
          resolve(true)
        }
      }, this.mode === 'focused' ? 999999 : 60000) // focused = no timer

      this.pendingDecisions.set(event.decisionId, {
        resolve: (answer: string) => {
          clearTimeout(timer)
          this.applyRule(event.sessionId, event.decisionId, answer)
          this.recordAnswer(event.question, answer)
          this.checkForRuleSuggestion(event.question, answer)
          resolve(true)
        },
        timer
      })
    })
  }

  hardStop(sessionId: string, conflictEvent: AgentEvent) {
    // emit to gateway immediately, no timer
    // push to phone immediately
    this.pushToChannels(conflictEvent)
  }

  resolve(sessionId: string, decisionId: string, answer: string) {
    const pending = this.pendingDecisions.get(decisionId)
    if (pending) {
      pending.resolve(answer)
      this.pendingDecisions.delete(decisionId)
    }
  }

  setMode(mode: 'focused'|'away'|'autonomous') { this.mode = mode }

  private applyRule(sessionId: string, decisionId: string, answer: string) {
    // write to PTY via supervisor callback
    // this is wired up when supervisor creates HITL instance
  }

  private recordAnswer(question: string, answer: string) {
    // update _answerHistory in config.json
  }

  private checkForRuleSuggestion(question: string, answer: string) {
    // if same answer 3+ times for same pattern, emit suggestionEvent
  }

  private pushToChannels(event: any) {
    // call push.ts to send to Cloudflare Worker → APNs
    // in v2: also send to Slack/WhatsApp adapters
  }

  private loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    return { rules: [], _answerHistory: {} }
  }

  private saveConfig(config: object) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  }
}
```

---

## COMPONENT 11: SLEEP GUARD

File: src/main/supervisor/sleepGuard.ts

Spawns caffeinate process when any agent is working or waiting.
Kills it when all agents are idle or done.

```typescript
import { spawn, ChildProcess } from 'child_process'

export class SleepGuard {
  private proc: ChildProcess | null = null
  private activeSessions = new Set<string>()

  markActive(sessionId: string) {
    this.activeSessions.add(sessionId)
    this.prevent()
  }

  markIdle(sessionId: string) {
    this.activeSessions.delete(sessionId)
    if (this.activeSessions.size === 0) this.allow()
  }

  prevent() {
    if (this.proc) return
    this.proc = spawn('caffeinate', ['-i'])
    this.proc.on('exit', () => { this.proc = null })
  }

  allow() {
    if (!this.proc) return
    this.proc.kill()
    this.proc = null
  }

  isActive() { return this.proc !== null }
}
```

---

## COMPONENT 12: PHONE PUSH NOTIFICATIONS

File: src/main/notifications/push.ts

Calls Cloudflare Worker which relays to APNs.

```typescript
const WORKER_URL = 'https://your-worker.workers.dev'

export async function sendDecisionPush(options: {
  deviceToken: string
  sessionName: string
  question: string
  decisionId: string
  sessionId: string
  isHardStop?: boolean
}) {
  try {
    await fetch(`${WORKER_URL}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceToken: options.deviceToken,
        title: options.isHardStop
          ? `URGENT — ${options.sessionName} blocked`
          : `${options.sessionName} needs a decision`,
        body: options.question,
        decisionId: options.decisionId,
        sessionId: options.sessionId,
        category: 'DECISION'
      })
    })
  } catch (err) {
    console.error('Push failed:', err)
  }
}
```

### Cloudflare Worker

Deploy separately. One file, 30 lines.

```typescript
// worker.ts — deploy with: wrangler deploy
export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)

    if (url.pathname === '/push' && req.method === 'POST') {
      const body = await req.json() as any
      const jwt = await generateAPNsJWT(env.APNS_PRIVATE_KEY, env.APNS_KEY_ID, env.APNS_TEAM_ID)
      const apnsRes = await fetch(
        `https://api.push.apple.com/3/device/${body.deviceToken}`,
        {
          method: 'POST',
          headers: {
            authorization: `bearer ${jwt}`,
            'apns-topic': env.BUNDLE_ID,
            'apns-push-type': 'alert',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            aps: { alert: { title: body.title, body: body.body }, category: body.category },
            decisionId: body.decisionId,
            sessionId: body.sessionId
          })
        }
      )
      return new Response(null, { status: apnsRes.ok ? 200 : 500 })
    }

    if (url.pathname === '/reply' && req.method === 'POST') {
      const body = await req.json()
      await fetch(`${env.MAC_WEBHOOK_URL}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      return new Response('ok')
    }

    return new Response('not found', { status: 404 })
  }
}

// Cloudflare Worker secrets to set with wrangler secret put:
// APNS_PRIVATE_KEY  — contents of your .p8 file
// APNS_KEY_ID       — from Apple Developer portal
// APNS_TEAM_ID      — from Apple Developer portal
// BUNDLE_ID         — your iOS app bundle ID
// MAC_WEBHOOK_URL   — ngrok URL or tailscale address of your Mac :9876
```

---

## COMPONENT 13: REACT UI — GATEWAY CONNECTION

File: src/renderer/store/gateway.ts

The renderer connects to the WS gateway instead of using Electron IPC.
Gets the port via a single IPC call on startup, then uses WS for everything.

```typescript
import { create } from 'zustand'

interface GatewayStore {
  ws: WebSocket | null
  connected: boolean
  connect: (port: number) => void
  send: (method: string, params: object) => Promise<unknown>
  on: (event: string, handler: (payload: unknown) => void) => void
}

let pendingRequests = new Map<string, { resolve: Function, reject: Function }>()
let eventHandlers = new Map<string, Function[]>()

export const useGateway = create<GatewayStore>((set, get) => ({
  ws: null,
  connected: false,

  connect(port: number) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    ws.onopen = () => {
      set({ ws, connected: true })
      // send connect frame
      const id = crypto.randomUUID()
      ws.send(JSON.stringify({
        type: 'req', id,
        method: 'connect',
        params: { role: 'operator', deviceId: getDeviceId(), version: '1' }
      }))
    }
    ws.onmessage = (e) => {
      const frame = JSON.parse(e.data)
      if (frame.type === 'res') {
        const pending = pendingRequests.get(frame.id)
        if (pending) { pending.resolve(frame.payload); pendingRequests.delete(frame.id) }
      }
      if (frame.type === 'event') {
        const handlers = eventHandlers.get(frame.event) ?? []
        handlers.forEach(h => h(frame.payload))
      }
    }
    ws.onclose = () => set({ connected: false })
  },

  send(method: string, params: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      pendingRequests.set(id, { resolve, reject })
      get().ws?.send(JSON.stringify({ type: 'req', id, method, params }))
      setTimeout(() => { pendingRequests.delete(id); reject(new Error('timeout')) }, 10000)
    })
  },

  on(event: string, handler: Function) {
    if (!eventHandlers.has(event)) eventHandlers.set(event, [])
    eventHandlers.get(event)!.push(handler)
  }
}))

function getDeviceId(): string {
  let id = localStorage.getItem('octoagent-device-id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('octoagent-device-id', id) }
  return id
}
```

---

## COMPONENT 14: REACT UI — CHAT PANEL

File: src/renderer/components/ChatPanel.tsx

WhatsApp-style message thread per agent. Decision cards surface automatically
via gateway events. You can also type directly to agents.

Message types: text, decision, summary, conflict, report, system

```typescript
import { useChatStore } from '../store/chat'
import { useGateway } from '../store/gateway'
import { DecisionCard } from './DecisionCard'
import { ReportCard } from './ReportCard'

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const { messages, addMessage } = useChatStore()
  const { send } = useGateway()
  const [input, setInput] = useState('')
  const msgs = messages[sessionId] ?? []
  const bottomRef = useRef<HTMLDivElement>(null)

  // auto-scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // load memory summary as first message on session switch
  useEffect(() => {
    // gateway will emit memoryUpdate on session switch
    // handled in useGateway hook setup
  }, [sessionId])

  const sendMessage = () => {
    if (!input.trim()) return
    addMessage(sessionId, { role: 'user', type: 'text', content: input })
    send('send', { sessionId, text: input, idempotencyKey: crypto.randomUUID() })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0f18]">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.map(msg => {
          if (msg.type === 'decision') return <DecisionCard key={msg.id} message={msg} sessionId={sessionId} />
          if (msg.type === 'report') return <ReportCard key={msg.id} message={msg} />
          return <MessageBubble key={msg.id} message={msg} />
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Message agent..."
          className="flex-1 bg-[#1e2029] text-sm text-gray-200 rounded-full px-4 py-2 outline-none"
        />
        <button onClick={sendMessage} className="w-8 h-8 rounded-full bg-[#1D9E75] flex items-center justify-center">
          →
        </button>
      </div>
    </div>
  )
}
```

---

## COMPONENT 15: REACT UI — DECISION CARD

File: src/renderer/components/DecisionCard.tsx

Shows inside the chat panel when waitingForInput event arrives.
Connects back to gateway resolve method.

```typescript
import { useGateway } from '../store/gateway'
import { useChatStore } from '../store/chat'

export function DecisionCard({ message, sessionId }: { message: Message, sessionId: string }) {
  const { send } = useGateway()
  const { resolveDecision } = useChatStore()

  const handleAnswer = async (answer: string) => {
    resolveDecision(sessionId, message.id, answer)
    await send('resolve', {
      sessionId,
      decisionId: message.decision!.decisionId,
      answer,
      idempotencyKey: crypto.randomUUID()
    })
  }

  const isResolved = message.decision?.resolved
  const isHardStop = message.decision?.layer === 4

  return (
    <div className={`rounded-lg p-3 max-w-[88%] ${isHardStop ? 'border border-red-500/40 bg-[#1e2029]' : 'border border-yellow-500/30 bg-[#1e2029]'}`}>
      <div className={`text-[10px] font-medium mb-1 uppercase tracking-wider ${isHardStop ? 'text-red-400' : 'text-yellow-500'}`}>
        {isHardStop ? 'Hard stop — action blocked' : 'Decision needed'}
      </div>
      <div className="text-sm text-gray-200 mb-2">{message.content}</div>
      {!isResolved && (
        <div className="flex gap-2 flex-wrap">
          {message.decision?.options.map(opt => (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                opt.toLowerCase() === 'yes' || opt.toLowerCase() === 'merge'
                  ? 'bg-[#166534] text-green-200 border-green-700'
                  : 'bg-[#1e2029] text-gray-300 border-white/20 hover:bg-white/5'
              }`}
            >
              {opt}
            </button>
          ))}
          <button
            onClick={() => {/* open always-do-this modal */}}
            className="text-[10px] px-2 py-1.5 rounded-full bg-purple-900/40 text-purple-300 border-none ml-auto"
          >
            Always do this
          </button>
        </div>
      )}
      {isResolved && (
        <div className="text-[11px] text-gray-500">
          Resolved: {message.decision?.answer}
          {message.decision?.autoDecided && ' (auto)'}
        </div>
      )}
    </div>
  )
}
```

---

## COMPONENT 16: REACT UI — ATTENTION QUEUE

File: src/renderer/components/AttentionQueue.tsx

Sits at the bottom of the sidebar. Shows up to 5 undismissed items.
Ordered by: hard stops → conflicts → waiting → done.

```typescript
import { useQueueStore } from '../store/queue'

export function AttentionQueue() {
  const { items, dismiss } = useQueueStore()
  const active = items
    .filter(i => !i.dismissed)
    .sort((a, b) => {
      const priority = { hardstop: 0, conflict: 1, waiting: 2, done: 3, error: 1 }
      return (priority[a.type] ?? 9) - (priority[b.type] ?? 9) || b.timestamp - a.timestamp
    })
    .slice(0, 5)

  if (active.length === 0) {
    return (
      <div className="p-3 text-[11px] text-gray-600">
        All agents running smoothly
      </div>
    )
  }

  return (
    <div className="border-t border-white/10 pt-2">
      <div className="px-3 py-1 text-[10px] text-gray-500 font-medium uppercase tracking-wider flex items-center justify-between">
        Attention queue
        <span className="bg-yellow-500/20 text-yellow-400 rounded-full px-1.5 py-0.5">{active.length}</span>
      </div>
      {active.map(item => (
        <QueueItem key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
      ))}
    </div>
  )
}

function QueueItem({ item, onDismiss }) {
  const borderColor = {
    hardstop: 'border-l-red-500',
    conflict: 'border-l-red-400',
    waiting: 'border-l-yellow-500',
    done: 'border-l-gray-600',
    error: 'border-l-red-400'
  }[item.type] ?? 'border-l-gray-600'

  return (
    <div className={`mx-2 mb-1 p-2 bg-[#1a1d28] rounded border-l-2 ${borderColor} cursor-pointer hover:bg-[#1e2235]`}
      onClick={() => switchToSession(item.sessionId)}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-medium text-gray-300">{item.sessionName}</span>
        <button onClick={e => { e.stopPropagation(); onDismiss() }} className="text-[10px] text-gray-600 hover:text-gray-400">×</button>
      </div>
      <div className="text-[10px] text-gray-500 leading-snug">{item.message}</div>
    </div>
  )
}
```

---

## COMPONENT 17: ZUSTAND STORES

### chat.ts

```typescript
import { create } from 'zustand'

export interface Message {
  id: string
  sessionId: string
  role: 'agent' | 'user' | 'system'
  type: 'text' | 'decision' | 'summary' | 'conflict' | 'report' | 'system'
  content: string
  timestamp: number
  decision?: {
    decisionId: string
    options: string[]
    resolved: boolean
    answer?: string
    autoDecided?: boolean
    layer?: 1 | 2 | 3 | 4
  }
}

interface ChatStore {
  messages: Record<string, Message[]>
  addMessage: (sessionId: string, msg: Omit<Message, 'id' | 'timestamp'>) => void
  resolveDecision: (sessionId: string, messageId: string, answer: string, auto?: boolean) => void
  clearSession: (sessionId: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: {},

  addMessage: (sessionId, msg) => set(state => ({
    messages: {
      ...state.messages,
      [sessionId]: [
        ...(state.messages[sessionId] ?? []),
        { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }
      ]
    }
  })),

  resolveDecision: (sessionId, messageId, answer, auto = false) => set(state => ({
    messages: {
      ...state.messages,
      [sessionId]: (state.messages[sessionId] ?? []).map(m =>
        m.id === messageId
          ? { ...m, decision: { ...m.decision!, resolved: true, answer, autoDecided: auto } }
          : m
      )
    }
  })),

  clearSession: (sessionId) => set(state => {
    const { [sessionId]: _, ...rest } = state.messages
    return { messages: rest }
  })
}))
```

### queue.ts

```typescript
import { create } from 'zustand'

export type QueueItemType = 'waiting' | 'conflict' | 'done' | 'error' | 'hardstop' | 'suggestion'

export interface QueueItem {
  id: string
  sessionId: string
  sessionName: string
  type: QueueItemType
  message: string
  timestamp: number
  dismissed: boolean
  decisionId?: string
}

interface QueueStore {
  items: QueueItem[]
  add: (item: Omit<QueueItem, 'id' | 'timestamp' | 'dismissed'>) => void
  dismiss: (id: string) => void
  dismissSession: (sessionId: string) => void
  undismissedCount: () => number
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],

  add: (item) => set(state => ({
    items: [...state.items, {
      ...item, id: crypto.randomUUID(), timestamp: Date.now(), dismissed: false
    }]
  })),

  dismiss: (id) => set(state => ({
    items: state.items.map(i => i.id === id ? { ...i, dismissed: true } : i)
  })),

  dismissSession: (sessionId) => set(state => ({
    items: state.items.map(i => i.sessionId === sessionId ? { ...i, dismissed: true } : i)
  })),

  undismissedCount: () => get().items.filter(i => !i.dismissed).length
}))
```

---

## COMPONENT 18: PRELOAD (MINIMAL)

File: src/preload/index.ts

In the WS gateway model, preload is minimal. Only exposes the WS port so the
renderer can connect. Everything else goes over WebSocket.

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  getGatewayPort: () => ipcRenderer.invoke('get-gateway-port'),
  // keep any Broomy PTY methods that xterm.js Terminal component needs
  // do NOT add new IPC channels — use WS gateway instead
})
```

---

## COMPONENT 19: DISK LAYOUT

All runtime data lives at ~/.octoagent/

```
~/.octoagent/
  config.json          — sessions, auto-rules, _answerHistory, device token, WS port
  personas/
    <sessionId>.json   — name, role, allowedPaths, allowedCommands, channelMap
  sessions/
    <sessionId>/
      transcript.jsonl — append-only, every AgentEvent with timestamp
      memory.md        — curated summary, rewritten on agent done via Claude API
      report.md        — end-of-session report, generated when all sessions done
      incidents/       — debug dumps, triggered manually or on crash
```

### config.json schema

```json
{
  "version": 1,
  "deviceToken": "",
  "wsPort": 18789,
  "mode": "focused",
  "rules": [
    { "pattern": "merge.*tests pass", "answer": "yes" }
  ],
  "_answerHistory": {
    "merge": { "yes": 3, "no": 0 }
  },
  "sessions": [
    {
      "id": "uuid",
      "name": "Agent 1 — backend",
      "agentType": "claude",
      "repoPath": "/Users/you/projects/backend",
      "personaId": "uuid",
      "status": "idle",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### persona schema

```json
{
  "id": "uuid",
  "name": "Agent 1 — backend",
  "role": "Backend API developer",
  "allowedPaths": ["src/api", "src/middleware", "tests"],
  "allowedCommands": ["npm test", "npm run lint", "git status"],
  "channelMap": {
    "slack": "C0123CHANNEL",
    "whatsapp": "+1234567890"
  }
}
```

---

## COMPONENT 20: MAIN PROCESS BOOTSTRAP

File: src/main/index.ts

Wires everything together at app startup.

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import { gateway } from './gateway'
import { supervisor } from './supervisor'

let mainWindow: BrowserWindow

async function createWindow() {
  // start gateway first
  await gateway.start()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true
    }
  })

  // only IPC call: give renderer the WS port
  ipcMain.handle('get-gateway-port', () => gateway.getPort())

  // load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { supervisor.sleepGuard.allow(); app.quit() })
```

---

## FOUR-WEEK BUILD PLAN

### Week 1 — Foundation

Goal: WS gateway running, chat panel live, you can see agents and type back.

Day 1:
- Fork Broomy, pnpm install, confirm it runs
- Delete Review.tsx, profiles store, GitHub IPC handlers
- Read src/preload/index.ts, src/main/index.ts, src/renderer/store/sessions.ts fully
- Install ws and @anthropic-ai/sdk

Day 2:
- Create src/main/gateway/index.ts (Gateway class, WS server, connect-first)
- Create src/main/gateway/frameValidator.ts
- Create src/main/gateway/broadcaster.ts
- Wire gateway.start() in src/main/index.ts
- Add ipcMain.handle('get-gateway-port') to main

Day 3:
- Create src/renderer/store/gateway.ts (WS client, connect, send, on)
- Create src/renderer/hooks/useGateway.ts
- Wire gateway connect in App.tsx on mount using ipcRenderer.invoke('get-gateway-port')
- Create src/renderer/store/chat.ts

Day 4:
- Create src/renderer/components/ChatPanel.tsx
- Create src/renderer/components/DecisionCard.tsx (no real decisions yet, just UI)
- Wire ChatPanel into main layout replacing Broomy review panel
- Create src/main/gateway/adapters/ptyAdapter.ts
- Wire ptyAdapter to existing node-pty onData in main/index.ts

Day 5:
- Create src/renderer/components/PersonaCard.tsx
- Wire persona creation to config.json save
- Create src/renderer/store/queue.ts
- Create src/renderer/components/AttentionQueue.tsx (no real events yet, static)
- Test end-to-end: start session, see PTY output in chat, type message back

Milestone: Chat panel live. WS gateway running. PTY output visible in chat.

---

### Week 2 — Supervisor + Claude Code + Decision Cards

Goal: Decisions surface automatically. Claude Code fully integrated. Status dots real.

Day 1:
- Create src/main/supervisor/index.ts (Supervisor class, EventEmitter)
- Create src/main/supervisor/sessionQueue.ts
- Create src/main/gateway/adapters/hookAdapter.ts (HTTP server, receives hook JSON)
- Wire hookAdapter startup in main/index.ts

Day 2:
- Create src/main/supervisor/parsers/claudeCode.ts
- processHook() for PostToolUse and Stop events
- processPty() regex fallback for permission prompts
- Write hook config to ~/.claude/settings.json on Claude Code session start

Day 3:
- Wire supervisor.handleInbound() to gateway's inbound events
- Wire gateway.broadcast() to supervisor's agentEvent emissions
- Create session router: src/main/gateway/sessionRouter.ts
- Test: start Claude Code, hook fires, event arrives in React UI via WS

Day 4:
- Wire DecisionCard resolve buttons to gateway.send('resolve', ...)
- Wire supervisor.resolveDecision() to PTY write
- Add status field to sessions store
- Update SessionList to show status dots from WS events instead of Broomy regex

Day 5:
- Wire AttentionQueue to real agentEvent events from gateway
- Test full decision flow: Claude Code asks permission → decision card appears → click Yes → agent continues
- Add dedup and 100ms debounce to gateway

Milestone: Decision cards surface automatically. Claude Code integrated. Status dots real.

---

### Week 3 — Memory, Conflict, Gemini, Briefing, Report

Goal: Full memory pipeline. Gemini integrated. Agent briefing works.

Day 1:
- Create src/main/supervisor/sessionMemory.ts
- Wire record() to every agentEvent in supervisor
- Implement flush() with Claude API call
- On session switch: gateway emits memoryUpdate, ChatPanel shows memory as first message

Day 2:
- Create src/main/supervisor/conflictDetector.ts
- Wire recordFileAccess() to every fileChanged event
- Emit conflict event when overlap detected
- Hard stop: emit to gateway immediately, push to phone without timer

Day 3:
- Create src/main/supervisor/parsers/gemini.ts
- Buffer-based line parser, all regex patterns
- Test with real Gemini CLI session

Day 4:
- Create src/main/supervisor/briefingEngine.ts (Claude API, persona-aware)
- Create src/main/supervisor/hitl.ts (4-layer system, 60s timer, auto-rules)
- Wire HITL into supervisor.handleEvent()
- Add "Brief another agent" button to ChatPanel

Day 5:
- Create src/main/supervisor/reportGenerator.ts (Claude API)
- Create src/renderer/components/ReportCard.tsx
- Wire report generation to when all sessions reach done
- Emit report event via gateway, show ReportCard in chat

Milestone: Full memory pipeline. Conflict detection. Gemini integrated. Briefing works. Reports generated.

---

### Week 4 — Phone Push, Auto-Decide, Codex, Sleep Guard, Ship

Goal: Phone decisions work. Auto-decide learns. All agents supported. Ship.

Day 1:
- Create src/main/notifications/push.ts
- Deploy Cloudflare Worker (see worker code in COMPONENT 12)
- Create src/main/gateway/adapters/phoneAdapter.ts (HTTP :9876)
- Wire 60s timer in HITL to push.ts
- Hard stops push immediately

Day 2:
- Implement auto-decide rules in hitl.ts
- _answerHistory tracking in config.json
- After 3 same answers: emit suggestionEvent to queue
- "Always do this" button in DecisionCard → confirm modal → save rule
- "Auto-decided" chip on auto-resolved cards

Day 3:
- Create src/main/supervisor/parsers/codex.ts
- Test with real Codex CLI session
- Create src/main/supervisor/sleepGuard.ts
- Wire sleepGuard to working/done events

Day 4:
- Create src/renderer/components/MenuBarStatus.tsx
- Three-mode switcher: Focused / Away / Autonomous
- Coffee cup icon when sleep guard active
- Wire mode changes to gateway setMode message → supervisor

Day 5:
- pnpm dist — generate .dmg
- Write README.md with setup instructions (clone, pnpm install, API key, Claude Code hook setup)
- Send to 10 beta developers with setup guide

Milestone: OctoAgent v1 shipped.

---

## FIVE INVARIANTS — NEVER VIOLATE THESE

1. All state flows through the supervisor. The renderer never reads PTY output
   directly or reconstructs session state. It only receives typed AgentEvent
   objects via the gateway WebSocket.

2. One active run per session. The SessionQueue's Promise chain guarantees
   this. Never bypass the queue.

3. Flush before discard. memory.md is always written before session context
   is cleared. Call flush() before closing any session.

4. Every action logged. Every AgentEvent is appended to transcript.jsonl
   with a timestamp. Never skip logging. Never truncate the file.

5. Recovery from disk. On app restart, load session state from
   transcript.jsonl and memory.md. Do not rely on RAM state surviving restarts.

---

## WHAT NOT TO BUILD IN V1

Do not build these — they come after validation with real users:
- AI code review (Broomy's feature, not our angle)
- GitHub issues / PR integration
- Multi-window profiles
- Team / collaboration features
- Token cost tracking dashboard
- Windows or Linux support
- Slack or WhatsApp adapters (scaffold the interface, do not implement)

---

## HOW TO START EACH CLAUDE CODE SESSION

Paste this at the top of every Claude Code session:

"I am building OctoAgent — an Electron + React + TypeScript desktop app that
is a mission control for running multiple AI coding agents simultaneously.
I have forked Broomy as the baseline. Read OCTOAGENT_BUILD_PLAN.md for the
complete architecture. I am currently working on [DESCRIBE WHAT YOU ARE BUILDING].
The key constraint: never bypass the supervisor, never modify the Broomy terminal
or file viewer components, always use the WebSocket gateway for renderer communication."
