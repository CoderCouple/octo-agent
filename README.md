# OctoAgent

<p align="center">
  <img src="resources/icon.png" width="128" alt="OctoAgent logo" />
</p>

<p align="center">
  <strong>One brain. Many agents. Zero babysitting.</strong><br/>
  A macOS desktop app that runs multiple AI coding agents in parallel — and an intelligent supervisor that coordinates them all.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#supervisor-brain">Supervisor Brain</a> •
  <a href="#configuration">Configuration</a>
</p>

---

## Why OctoAgent?

Running one AI coding agent is powerful. Running five at once across different repos is chaos — unless something is coordinating them. OctoAgent gives you a **supervisor brain** that breaks down tasks, delegates to agents, monitors progress, handles approvals, and lets agents talk to each other — while you focus on the big picture.

## Quick Start

### Prerequisites

- macOS (primary target)
- Node.js 18+
- [pnpm](https://pnpm.io/)
- `ANTHROPIC_API_KEY` in your shell environment (for supervisor brain, briefings, memory summaries)

### Development

```bash
pnpm install
pnpm dev          # Electron + Vite dev server on :5173
```

### Build & Package

```bash
pnpm build        # Production build
pnpm dist         # Generate .dmg
```

### Testing

```bash
pnpm test:unit              # Vitest unit tests
pnpm test:unit:coverage     # With 90% line coverage threshold
pnpm test:e2e               # Playwright E2E tests
```

## Features

### Supervisor Brain — The Core

The supervisor isn't just a router — it's a Claude-powered intelligence layer that actively orchestrates your agents:

- **Natural language orchestration** — Tell the supervisor what you want in plain English. It breaks tasks into subtasks, assigns them to the right agents, and tracks completion.
- **Task lifecycle management** — Full task tree with dependencies, parent/subtask propagation, and auto-unblocking.
- **Autonomous coordination** — When an agent completes, the brain analyzes results and decides: mark task done, assign follow-up, brief other agents, or report back.
- **Peer conversation monitoring** — Agents on shared tasks can communicate freely. Every 10 messages, the brain reviews the conversation for off-track behavior.

### Multi-Agent Orchestration

- **Run 5+ agents in parallel** — Claude Code, Gemini CLI, Codex — each in its own repo/branch, all visible at a glance
- **Group sessions** — Create groups of agents that communicate via MCP peer tools, with the supervisor as gatekeeper
- **PTY + SDK bridge** — Delivers messages to agents via terminal (PTY) or Claude Agent SDK, depending on connection mode
- **Agent briefings** — Claude API-powered cross-agent context sharing

### Smart Approval System (5-Layer HITL)

| Layer | What it does |
|-------|-------------|
| **Layer 0: Risk assessment** | Safe tools (Read, Glob, Grep) → auto-approve. Critical ops (`rm -rf`, force push, `DROP TABLE`) → force phone push even in autonomous mode. |
| **Layer 1: Persona check** | If the agent's persona allows the tool/path, pass through silently. |
| **Layer 2: Auto-rules** | If a saved rule matches (tool name, file glob, prompt regex), resolve silently. |
| **Layer 3: Soft interrupt** | Show decision in UI, start 60s timer. If unresolved, escalate to phone push. |
| **Layer 4: Hard interrupt** | Immediate phone push notification for critical decisions. |

After 3 identical resolutions for the same pattern, suggests saving as an auto-rule.

### Per-Agent Chat

- **WhatsApp-style interface** — Message bubbles with inline decision cards (approve/deny file edits, command execution)
- **Attention queue** — Unresolved decisions bubble to the top of the sidebar
- **Markdown rendering** — Agent responses rendered with full markdown support

### Session Memory

- **Append-only transcript** — Every `AgentEvent` written to `transcript.jsonl`
- **Curated summaries** — Claude API generates memory summaries on agent completion
- **Recovery from disk** — On restart, session state rebuilt from transcript + memory (Invariant #5)

### Quality of Life

- **Sleep guard** — `caffeinate` keeps your Mac awake while agents work
- **Phone push decisions** — Approve/deny from your phone when away from desk
- **Naruto-themed avatars** — Each agent gets a character identity for quick visual identification
- **Conflict detection** — File ownership tracking with hard stops on overlapping edits

## Architecture

```
                          ┌──────────────────────────────┐
                          │       Supervisor Brain       │
                          │   (Claude-powered reasoning) │
                          └──────────┬───────────────────┘
                                     │
Channel Adapters → Gateway (WS :18789) → Supervisor → Gateway → All WS Clients
     pty/hook/phone                       (EventEmitter)         (renderer, phone)
```

Three layers, strict separation:

| Layer | Location | Role |
|-------|----------|------|
| **Gateway** | `src/main/gateway/` | WebSocket server. Single control plane. No business logic. |
| **Supervisor** | `src/main/supervisor/` | The brain. Task tracking, session queues, conflict detection, HITL, memory, briefings, brain reasoning. |
| **Renderer** | `src/renderer/` | React UI. Connects via WebSocket, not Electron IPC. |

### Five Invariants — Never Violated

1. **All state flows through the supervisor.** The renderer never reads PTY output directly.
2. **One active run per session.** The SessionQueue Promise chain guarantees this.
3. **Flush before discard.** `memory.md` always written before session context is cleared.
4. **Every action logged.** Every `AgentEvent` appended to `transcript.jsonl` with a timestamp.
5. **Recovery from disk.** On restart, load session state from `transcript.jsonl` and `memory.md`.

### Tech Stack

| Component | Technology |
|-----------|-----------|
| App shell | Electron + electron-vite |
| UI | React + TypeScript + Tailwind |
| State | Zustand |
| Terminal | node-pty + xterm.js |
| File viewer | Monaco Editor |
| WebSocket | ws (npm) |
| AI | @anthropic-ai/sdk (Claude Sonnet) |
| Sleep guard | caffeinate (macOS CLI) |

## Supervisor Brain

The brain lives in three files:

| File | Purpose |
|------|---------|
| `supervisorBrain.ts` | Claude API reasoning engine. Takes user message + context → returns structured response with actions. |
| `supervisorChat.ts` | Conversation state, action executor, periodic monitoring, peer review. Persists to disk. |
| `taskTracker.ts` | Task lifecycle — create, assign, dependencies, parent/subtask completion, disk persistence. |

### Brain Actions

When you talk to the supervisor, it can:

| Action | What it does |
|--------|-------------|
| `delegate` | Send an instruction to a specific agent |
| `brief` | Brief an agent about other sessions' work |
| `create_task` | Create a task with optional subtasks and dependencies |
| `monitor` | Start periodic 5-min monitoring of a session |
| `ask_user` | Ask you a clarifying question |
| `report` | Generate a progress report |
| `auto_approve` | Mark safe operations for auto-approval |

### Example Flow

```
You: "Set up a REST API in the backend repo and a React frontend that calls it"

Brain thinks:
  → Creates parent task "Full-stack REST API + React frontend"
  → Creates subtask "REST API" → delegates to agent on backend repo
  → Creates subtask "React frontend" (blocked by API task) → queued
  → Starts monitoring backend agent

Agent completes API →
  Brain analyzes results →
  Marks API task done →
  Unblocks frontend task →
  Briefs frontend agent about API endpoints →
  Delegates frontend work
```

## Project Structure

```
src/
├── main/
│   ├── gateway/                # WebSocket server + channel adapters
│   │   ├── adapters/           # PTY, hook, phone, peers adapters
│   │   ├── sessionRouter.ts    # Route WS requests (incl. supervisorSend)
│   │   └── broadcaster.ts      # Client fan-out
│   ├── supervisor/             # The brain
│   │   ├── supervisorBrain.ts  # Claude-powered reasoning engine
│   │   ├── supervisorChat.ts   # Conversation state + action executor
│   │   ├── taskTracker.ts      # Task lifecycle management
│   │   ├── parsers/            # Agent output parsers (Claude, Gemini, Codex)
│   │   ├── hitl.ts             # 5-layer approval system
│   │   ├── sessionMemory.ts    # Transcript + memory summaries
│   │   ├── conflictDetector.ts # File ownership tracking
│   │   ├── briefingEngine.ts   # Cross-agent briefings
│   │   ├── reportGenerator.ts  # End-of-run reports
│   │   └── sleepGuard.ts       # caffeinate management
│   ├── handlers/               # Electron IPC handlers
│   ├── mcp/                    # MCP server for peer discovery
│   └── notifications/          # Phone push notifications
├── renderer/
│   ├── panels/
│   │   ├── agent/              # Agent terminal + GroupChatView
│   │   ├── supervisor/         # Supervisor chat panel (brain UI)
│   │   ├── explorer/           # File tree, source control, search
│   │   ├── sidebar/            # Session list with avatars
│   │   └── system/             # Panel registry + built-in definitions
│   ├── store/                  # Zustand stores
│   │   ├── sessions.ts         # Session state
│   │   ├── supervisorChat.ts   # Supervisor messages + tasks
│   │   ├── chat.ts             # Per-agent chat messages
│   │   └── gateway.ts          # WebSocket connection
│   └── layout/                 # Layout system with resizable panels
├── preload/                    # Electron preload bridge
└── shared/
    └── types.ts                # AgentEvent, WSFrame, Decision, etc.
```

## Configuration

Runtime data lives at `~/.octoagent/`:

```
~/.octoagent/
├── config.json                 # App configuration
├── auto-rules.json             # Saved auto-approval rules
├── personas/<id>.json          # Agent personas
├── supervisor/
│   ├── conversation.json       # Supervisor brain chat history
│   └── tasks.json              # Task tracker state
└── sessions/<id>/
    ├── transcript.jsonl        # Append-only event log
    ├── memory.md               # Claude API-generated summary
    └── report.md               # End-of-run report
```

## WS Frame Protocol

Three frame types: `req` (client→gateway), `res` (gateway→client), `event` (server push).

| Method | Direction | Purpose |
|--------|-----------|---------|
| `connect` | req | Subscribe to a session |
| `send` | req | Send message to agent |
| `supervisorSend` | req | Send message to supervisor brain |
| `resolve` | req | Resolve a HITL decision |
| `brief` | req | Request agent briefing |
| `setMode` | req | Set supervisor mode (focused/away/autonomous) |

| Event | Direction | Purpose |
|-------|-----------|---------|
| `agentEvent` | push | Agent state changes, messages, tool use |
| `decision` | push | HITL decision needed |
| `supervisorChat` | push | Supervisor brain response |
| `taskUpdate` | push | Task status change |
| `memoryUpdate` | push | Session memory updated |
| `peerMessage` | push | Agent-to-agent message |

## Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Fork Broomy, clean, rebrand to OctoAgent | Done |
| 2 | Gateway WebSocket server, frame protocol, PTY adapter | Done |
| 3 | Supervisor, parsers, session queue, HITL stubs, adapters, memory | Done |
| 4 | Chat UI — WhatsApp-style chat, decision cards, attention queue | Done |
| 5 | Memory summaries, conflict detection, briefing engine, reports | Done |
| 6 | Full HITL, phone push, sleep guard, Gemini/Codex parsers, P2P | Done |
| 7 | Naruto avatars, group sessions, Agent SDK, PTY/SDK bridge | Done |
| 8 | **Supervisor Brain** — Claude-powered orchestration, task tracker, 5-layer HITL, supervisor chat UI, autonomous peers | Done |

## Forked From

[Broomy](https://github.com/broomy-ai/broomy) (MIT License) — the terminal, file viewer, and base Electron shell are inherited and intentionally left unmodified.

## License

MIT
