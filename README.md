# OctoAgent

**One brain. Many agents.** A macOS desktop app for running multiple AI coding agents simultaneously — Claude Code, Gemini CLI, Codex — with a supervisor that coordinates, arbitrates, and keeps you in the loop.

Built with Electron, React, TypeScript, and a three-layer architecture (Gateway, Supervisor, Renderer) that separates control from UI.

## What It Does

- **Multi-agent orchestration** — Run 5+ AI coding agents in parallel, each in its own repo/branch, all visible at a glance
- **Supervisor engine** — Central brain that parses agent output, detects file conflicts, gates peer-to-peer communication, and escalates decisions
- **WhatsApp-style chat** — Per-agent chat with inline decision cards (approve/deny file edits, command execution)
- **Group sessions** — Create groups of agents that can communicate with each other via MCP peer tools, with supervisor as gatekeeper
- **PTY + SDK bridge** — Delivers messages to agents via terminal (PTY) or Claude Agent SDK, depending on connection mode
- **4-layer HITL** — (1) persona auto-allow, (2) auto-rule match, (3) 60s soft timer + phone push, (4) hard interrupt for conflicts
- **Session memory** — Append-only transcript + Claude API-generated summaries persisted to `~/.octoagent/`
- **Agent briefings** — Cross-agent context sharing powered by Claude API
- **Sleep guard** — `caffeinate` keeps your Mac awake while agents work
- **Phone push decisions** — Approve/deny from your phone when away from desk
- **Naruto-themed avatars** — Each agent gets a character identity for quick visual identification

## Architecture

```
Channel Adapters → Gateway (WS :18789) → Supervisor → Gateway → All WS Clients
     pty/hook/phone                       (EventEmitter)         (renderer, phone, etc.)
```

Three layers, strict separation:

| Layer | Location | Role |
|-------|----------|------|
| **Gateway** | `src/main/gateway/` | WebSocket server. Single control plane. No business logic. |
| **Supervisor** | `src/main/supervisor/` | The brain. Session queues, conflict detection, HITL, memory, briefings. |
| **Renderer** | `src/renderer/` | React UI. Connects via WebSocket, not Electron IPC. |

See [CLAUDE.md](CLAUDE.md) for the full architecture guide and five invariants.

## Quick Start

### Prerequisites

- macOS (primary target)
- Node.js 18+
- [pnpm](https://pnpm.io/)

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

## Project Structure

```
src/
├── main/
│   ├── gateway/              # WebSocket server + channel adapters
│   │   ├── adapters/         # PTY, hook, phone, peers, slack/whatsapp/telegram (v2 scaffolds)
│   │   └── broadcaster.ts    # Client map iteration, fan-out
│   ├── supervisor/           # The brain
│   │   ├── parsers/          # Claude Code (hook+PTY), Gemini (PTY), Codex (PTY)
│   │   ├── hitl.ts           # 4-layer human-in-the-loop decision system
│   │   ├── sessionMemory.ts  # transcript.jsonl + memory.md
│   │   ├── conflictDetector.ts
│   │   ├── briefingEngine.ts # Claude API cross-agent briefings
│   │   ├── reportGenerator.ts
│   │   └── sleepGuard.ts     # caffeinate management
│   ├── handlers/             # Electron IPC handlers (PTY, config, git, fs, shell)
│   ├── mcp/                  # MCP server for peer discovery/messaging
│   └── notifications/        # Phone push notifications
├── renderer/
│   ├── panels/agent/         # Agent terminal + GroupChatView
│   ├── panels/explorer/      # File tree, source control, search
│   ├── panels/sidebar/       # Session list with Naruto avatars
│   ├── store/                # Zustand stores (sessions, agents, chat, gateway, queue)
│   └── data/                 # Avatar definitions (avatars.json)
└── shared/
    └── types.ts              # AgentEvent, WSFrame, Decision, etc.
```

## Build Plans

Detailed implementation plans for each development phase:

| Plan | Description |
|------|-------------|
| [OctoAgent Build Plan](OCTOAGENT_BUILD_PLAN.md) | Complete build plan — overview, tech stack, architecture, all phases |
| [Phase-by-Phase Plan](octo-agent-plan.md) | Step-by-step build plan: Phase 1 (fork/clean), Phase 2 (gateway), Phase 3 (supervisor), Phase 4 (chat UI), Phase 5 (memory/briefings), Phase 6 (HITL/push/parsers), Phase 7 (polish) |
| [Group Chat Plan](octo-agent-chat-plan.md) | Inter-agent communication via claude-peers pattern — MCP adapter, peers adapter, group sessions, GroupChatView |
| [Supervisor Plan](octo-agent-supervisor-plan.md) | Phase 2 (PTY bridge + permission-gated P2P) and Phase 3 (supervisor as active AI participant in group chat) |
| [New Features Plan](octo-agent-new-plan.md) | Naruto-themed WhatsApp chat, Agent SDK integration, polish |

## Current Status

**Completed phases:**
- Phase 1: Fork Broomy, clean review/profile/gh, rebrand to OctoAgent
- Phase 2: Gateway WebSocket server, frame protocol, PTY adapter, renderer store/hook
- Phase 3: Supervisor, Claude Code parser, session queue, HITL stubs, hook/phone adapters, session memory, conflict detector
- Phase 4: Chat UI — WhatsApp-style chat, decision cards, attention queue
- Phase 5: Memory summaries via Claude API, conflict detection, briefing engine, reports
- Phase 6: Full HITL, phone push, sleep guard, Gemini/Codex parsers, peer communication
- Phase 7: Naruto avatars, group sessions, Agent SDK integration, PTY/SDK bridge, permission-gated P2P

**Next:** Supervisor as active AI participant in group chat (Phase 3 of supervisor plan)

## Configuration

Runtime data lives at `~/.octoagent/`:

```
~/.octoagent/
├── config.json              # App configuration
├── personas/<id>.json       # Agent personas (auto-approve rules, traits)
└── sessions/<id>/
    ├── transcript.jsonl     # Append-only event log
    ├── memory.md            # Claude API-generated summary
    └── report.md            # End-of-run report
```

## Forked From

[Broomy](https://github.com/broomy-ai/broomy) (MIT License) — the terminal, file viewer, and base Electron shell are inherited and intentionally left unmodified.

## License

MIT
