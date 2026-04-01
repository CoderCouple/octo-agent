# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OctoAgent is a macOS desktop app (Electron + React + TypeScript) for running multiple AI coding agents simultaneously. Forked from [Broomy](https://github.com/broomy-ai/broomy), it adds a WebSocket gateway, supervisor engine, WhatsApp-style chat per agent, attention queue, phone push decisions, agent-to-agent briefing, session memory, and multi-channel support.

## Build Commands

```bash
pnpm install          # install dependencies
pnpm dev              # run in development (electron-vite dev server on :5173)
pnpm build            # production build
pnpm dist             # generate .dmg
```

## Tech Stack

- **Electron + electron-vite** (app shell, inherited from Broomy)
- **React + TypeScript + Tailwind** (UI)
- **Zustand** (state management)
- **node-pty + xterm.js** (terminal emulation — from Broomy, do not modify)
- **Monaco Editor** (file viewer — from Broomy, do not modify)
- **ws** (npm) — WebSocket server for the gateway
- **@anthropic-ai/sdk** — Claude API for memory summaries, briefings, and reports
- **caffeinate** (macOS CLI) — sleep prevention

## Architecture

### Three-Layer Model

1. **Gateway** (`src/main/gateway/`) — WebSocket server on port 18789. Single control plane. Receives all input, broadcasts all output. Never processes business logic.
2. **Supervisor** (`src/main/supervisor/`) — The brain. EventEmitter that receives typed `AgentEvent` objects only. Orchestrates session queues, conflict detection, HITL decisions, memory, briefings, and reports.
3. **Renderer** (`src/renderer/`) — React UI. Connects to gateway via WebSocket (not Electron IPC). Only IPC call is `get-gateway-port` on startup.

### Data Flow

```
Channel Adapters → Gateway (WS :18789) → Supervisor → Gateway → All WS Clients
     pty/hook/phone                       (EventEmitter)         (renderer, phone, etc.)
```

### Key Subsystems

- **Channel Adapters** (`src/main/gateway/adapters/`) — Normalize external input into `InboundMessage`. PTY adapter, hook adapter (HTTP for Claude Code hooks), phone adapter (HTTP :9876). Slack/WhatsApp/Telegram are v2 scaffolds only.
- **Agent Parsers** (`src/main/supervisor/parsers/`) — Convert raw adapter data into `AgentEvent[]`. Claude Code uses structured hook JSON (primary) + PTY regex (fallback). Gemini and Codex use pure PTY regex.
- **HITL** (`src/main/supervisor/hitl.ts`) — 4-layer decision system: (1) persona-allowed → pass through, (2) auto-rule match → silent resolve, (3) soft interrupt → 60s timer then push, (4) hard interrupt → immediate push. After 3 same answers to same pattern, suggests saving as auto-rule.
- **Session Memory** (`src/main/supervisor/sessionMemory.ts`) — Two tiers: `transcript.jsonl` (append-only, every event) and `memory.md` (curated summary via Claude API on agent done).
- **Conflict Detector** (`src/main/supervisor/conflictDetector.ts`) — Tracks file ownership per session. Emits conflict event + hard stop on overlap.
- **Sleep Guard** (`src/main/supervisor/sleepGuard.ts`) — Spawns/kills `caffeinate` when agents are active/idle.

### WS Frame Protocol

Three frame types: `req` (client→gateway), `res` (gateway→client), `event` (server push to all).

Methods: `connect`, `send`, `resolve`, `status`, `brief`, `setMode`

Events: `agentEvent`, `decision`, `presence`, `heartbeat`, `memoryUpdate`, `report`

### Runtime Data

All runtime data at `~/.octoagent/`: `config.json`, `personas/<id>.json`, `sessions/<id>/transcript.jsonl|memory.md|report.md|incidents/`

## Five Invariants — Never Violate

1. **All state flows through the supervisor.** The renderer never reads PTY output directly. It only receives typed `AgentEvent` objects via the gateway WebSocket.
2. **One active run per session.** The `SessionQueue` Promise chain guarantees this. Never bypass the queue.
3. **Flush before discard.** `memory.md` is always written before session context is cleared. Call `flush()` before closing any session.
4. **Every action logged.** Every `AgentEvent` is appended to `transcript.jsonl` with a timestamp. Never skip logging. Never truncate the file.
5. **Recovery from disk.** On app restart, load session state from `transcript.jsonl` and `memory.md`. Do not rely on RAM state surviving restarts.

## Do Not Modify (Broomy Components)

- `src/renderer/components/Terminal.tsx`
- `src/renderer/components/FileViewer.tsx`
- node-pty and xterm.js integration

## Not in V1 Scope

AI code review, GitHub/PR integration, multi-window profiles, team features, token cost tracking, Windows/Linux support, Slack/WhatsApp adapter implementations (interface scaffolds only).
