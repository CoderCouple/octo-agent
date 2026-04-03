 Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 OctoAgent — Step-by-Step Build Plan

 Context

 OctoAgent is a macOS desktop app for running multiple AI coding agents simultaneously. It's built by forking OctoAgent (MIT license), then layering on a WebSocket gateway, supervisor engine, WhatsApp-style chat, attention queue, phone push
 decisions, agent-to-agent briefing, and session memory.

 The OctoAgent baseline provides: Electron + electron-vite, React + Tailwind + Zustand, node-pty + xterm.js terminal, Monaco file viewer, IPC handlers, panel system, and session management. We keep the terminal and file viewer untouched, delete
 review/profile/GitHub features, and build the three-layer OctoAgent architecture on top.

 ---
 Phase 1: Fork, Clean, and Verify Baseline

 Goal: Clone OctoAgent, strip unwanted features, add deps, confirm it still runs.

 Steps

 1. Clone OctoAgent and set up remotes
 git clone https://github.com/octoagent/octoagent.git /Users/suniltiwari/Desktop/octo-agent
 cd /Users/suniltiwari/Desktop/octo-agent
 git remote rename origin upstream
 pnpm install && pnpm dev  # verify baseline works
 2. Delete review-related files
   - src/renderer/panels/explorer/tabs/review/ (entire directory)
   - src/renderer/types/review.ts
   - src/renderer/features/sessions/newSession/ReviewPrsView.tsx + test + stories
 3. Delete profile-related files
   - src/renderer/features/profiles/ (ProfileChip, ProfileDropdown + tests + stories)
   - src/renderer/store/profiles.ts + test
 4. Delete GitHub CLI files
   - src/main/handlers/gh.ts, ghCore.ts, ghComments.ts + tests
   - src/preload/apis/gh.ts + test
 5. Clean up references in modified files
   - src/main/handlers/index.ts — remove gh handler registration
   - src/preload/index.ts — remove gh and profiles API exposure + Window types
   - src/renderer/App.tsx — remove profile store, ProfileChip, review session logic
   - src/renderer/panels/explorer/ExplorerPanel.tsx — remove review tab
   - src/renderer/store/sessions.ts — remove review fields (sessionType, reviewStatus, prNumber, prTitle, prUrl, prBaseBranch)
   - src/renderer/store/configPersistence.ts — remove profile store import
   - Session creation views — remove ReviewPrsView navigation
 6. Rebrand
   - package.json: name → "OctoAgent"
   - electron-builder.yml: productName → "OctoAgent"
   - Window title in src/main/index.ts
 7. Add dependencies
 pnpm add ws @anthropic-ai/sdk
 pnpm add -D @types/ws
 8. Keep OctoAgent's MIT LICENSE file (legal requirement)

 Verify

 - pnpm dev launches, no errors
 - pnpm build compiles
 - Create session, launch agent, type in terminal — PTY works
 - Explorer has 4 tabs (no review tab)

 ---
 Phase 2: Gateway + WebSocket Connection

 Goal: WS gateway running in main process. Renderer connects via WebSocket. Heartbeat flows.

 Files to create

 ┌─────────────────────────────────────────┬───────────────────────────────────────────────────────────────────┐
 │                  File                   │                              Purpose                              │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/shared/types.ts                     │ InboundMessage, AgentEvent, WSFrame types                         │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/index.ts               │ Gateway class: WSS on :18789, connect-first, broadcast, heartbeat │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/frameValidator.ts      │ JSON parse + schema validation                                    │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/broadcaster.ts         │ Client map iteration, send to open sockets                        │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/sessionRouter.ts       │ Client → session subscription map                                 │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/ptyAdapter.ts │ node-pty onData → strip ANSI → InboundMessage                     │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/renderer/store/gateway.ts           │ Zustand store: WS connect, send, on (event handlers)              │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────┤
 │ src/renderer/hooks/useGateway.ts        │ React hook: get port via IPC, connect, dispatch events            │
 └─────────────────────────────────────────┴───────────────────────────────────────────────────────────────────┘

 Files to modify

 ┌──────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
 │         File         │                                           Change                                            │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/index.ts    │ await gateway.start() before window, ipcMain.handle('get-gateway-port'), attach PTY adapter │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/preload/index.ts │ Expose getGatewayPort                                                                       │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/renderer/App.tsx │ Call useGateway hook on mount                                                               │
 └──────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘

 Verify

 - Console: "Gateway connected on port 18789"
 - Heartbeat events every 30s in DevTools
 - Start agent session — PTY data events appear in console

 ---
 Phase 3: Supervisor + Claude Code Parser + Decision Flow

 Goal: Supervisor receives parsed events. Claude Code hooks work. Decisions can be resolved.

 Files to create

 ┌───────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┐
 │                   File                    │                                         Purpose                                         │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/index.ts              │ Supervisor EventEmitter: handleInbound, handleEvent, resolveDecision                    │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/sessionQueue.ts       │ Promise chain queue, one active run per session                                         │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/parsers/claudeCode.ts │ processHook (PostToolUse→fileChanged, Stop→done) + processPty regex fallback            │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/hookAdapter.ts  │ HTTP server on random port, POST /hook, inject hook config into ~/.claude/settings.json │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/phoneAdapter.ts │ HTTP :9876, POST /decision stub                                                         │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/sessionMemory.ts      │ Minimal: append to transcript.jsonl, getSummary, flush stub                             │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/hitl.ts               │ Minimal: emit decision events, resolve pending, no timers yet                           │
 ├───────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/conflictDetector.ts   │ Stub: record() returns [], clearSession() no-op                                         │
 └───────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘

 Files to modify

 ┌─────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
 │                  File                   │                                   Change                                    │
 ├─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
 │ src/main/index.ts                       │ Import supervisor, register sessions with parser, wire gateway↔supervisor   │
 ├─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/index.ts               │ Route send→supervisor.handleUserMessage, resolve→supervisor.resolveDecision │
 ├─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/ptyAdapter.ts │ Send to supervisor.handleInbound instead of gateway directly                │
 └─────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

 Verify

 - Start Claude Code → hook config injected, HTTP hook server starts
 - Agent works → working and fileChanged events in console
 - Agent prompts → waitingForInput event emitted
 - curl POST localhost:9876/decision → resolves decision
 - ~/.octoagent/sessions/<id>/transcript.jsonl has event log

 ---
 Phase 4: Chat UI

 Goal: WhatsApp-style chat panel. Decision cards inline. Attention queue in sidebar.

 Files to create

 ┌────────────────────────────────────────────┬─────────────────────────────────────────────────────────┐
 │                    File                    │                         Purpose                         │
 ├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ src/renderer/store/chat.ts                 │ Messages per session, addMessage, resolveDecision       │
 ├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ src/renderer/store/queue.ts                │ Attention items, add, dismiss, priority sort            │
 ├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ src/renderer/components/ChatPanel.tsx      │ Message thread, input, auto-scroll, dark theme          │
 ├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ src/renderer/components/DecisionCard.tsx   │ Yes/No/Auto buttons, hard/soft variants, resolved state │
 ├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ src/renderer/components/AttentionQueue.tsx │ 5-item sidebar widget, priority sort, dismiss           │
 ├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ src/renderer/components/ReportCard.tsx     │ Markdown report display                                 │
 ├────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ src/renderer/components/PersonaCard.tsx    │ Stub: session name + agent type display                 │
 └────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘

 Files to modify

 ┌──────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────┐
 │                     File                     │                              Change                              │
 ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ src/renderer/hooks/useGateway.ts             │ Dispatch agentEvent→chat store, decision→chat+queue, report→chat │
 ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ src/renderer/App.tsx                         │ Wire ChatPanel into layout, add AttentionQueue to sidebar        │
 ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ src/renderer/panels/system/types.ts          │ Add CHAT to PANEL_IDS                                            │
 ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ src/renderer/panels/system/builtinPanels.tsx │ Add Chat panel definition                                        │
 ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ src/renderer/store/sessions.ts               │ Add agentStatus, personaId, agentType fields                     │
 ├──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ tailwind.config.js                           │ Add OctoAgent dark theme colors                                  │
 └──────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────┘

 Verify

 - Chat panel visible alongside terminal
 - Agent events appear as messages in chat
 - Decision card shows, click Yes → resolves, shows "Resolved: Yes"
 - Attention queue fills and dismisses correctly
 - Type in chat → message sent to agent PTY

 ---
 Phase 5: Memory, Conflict Detection, Briefing, Reports

 Goal: Claude API generates memory summaries and reports. File conflicts detected. Briefings work.

 Files to create

 ┌────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┐
 │                  File                  │                                Purpose                                │
 ├────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/briefingEngine.ts  │ Claude API: generate persona-aware briefing from session summary      │
 ├────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/reportGenerator.ts │ Claude API: structured report from last 100 events, save to report.md │
 └────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────┘

 Files to upgrade (stub → full)

 ┌─────────────────────────────────────────┬───────────────────────────────────────────────────────────────┐
 │                  File                   │                            Change                             │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/sessionMemory.ts    │ flush() calls Claude API → write memory.md, emit memoryUpdate │
 ├─────────────────────────────────────────┼───────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/conflictDetector.ts │ Full file ownership tracking, return conflicting sessions     │
 └─────────────────────────────────────────┴───────────────────────────────────────────────────────────────┘

 Files to modify

 ┌──────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │               File               │                                                          Change                                                          │
 ├──────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/index.ts     │ Wire conflict detection on fileChanged, report gen on all-done, briefing on brief command, recovery from disk on startup │
 ├──────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/index.ts        │ Broadcast memoryUpdate and report events                                                                                 │
 ├──────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/renderer/hooks/useGateway.ts │ Handle memoryUpdate→chat summary, report→chat report                                                                     │
 └──────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 Verify

 - Agent done → memory.md generated with Claude summary
 - Two agents edit same file → conflict event, hard stop
 - Brief command → briefing text in target agent terminal
 - All agents done → report.md generated, ReportCard in chat
 - Restart app → session state restored from disk

 ---
 Phase 6: Full HITL, Phone Push, Sleep Guard, Gemini/Codex

 Goal: 4-layer HITL complete. Push notifications. Sleep prevention. All agent types supported.

 Files to create

 ┌──────────────────────────────────────────────┬────────────────────────────────────────────────┐
 │                     File                     │                    Purpose                     │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ src/main/supervisor/parsers/gemini.ts        │ PTY regex parser for Gemini CLI                │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ src/main/supervisor/parsers/codex.ts         │ PTY regex parser for Codex CLI                 │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ src/main/notifications/push.ts               │ POST to Cloudflare Worker → APNs               │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ src/main/supervisor/sleepGuard.ts            │ Spawn/kill caffeinate based on active sessions │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/slackAdapter.ts    │ v2 scaffold (interface only)                   │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/whatsappAdapter.ts │ v2 scaffold                                    │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/telegramAdapter.ts │ v2 scaffold                                    │
 └──────────────────────────────────────────────┴────────────────────────────────────────────────┘

 Files to upgrade

 ┌───────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┐
 │                   File                    │                                Change                                 │
 ├───────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/hitl.ts               │ Full 4 layers: persona check, auto-rules, 60s timer + push, hard stop │
 ├───────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/phoneAdapter.ts │ Full HTTP server with validation                                      │
 └───────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────┘

 Files to modify

 ┌──────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │             File             │                                               Change                                                │
 ├──────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/index.ts │ Wire sleep guard, push, parser selection by agent type, persona loading from ~/.octoagent/personas/ │
 └──────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────┘

 Verify

 - Persona allowed action passes silently
 - Auto-rule matches resolve without UI
 - Away mode: 60s timeout → push sent
 - File conflict → immediate push
 - caffeinate spawns/dies with agent activity
 - Gemini/Codex sessions parse correctly

 ---
 Phase 7: Polish and Package

 Goal: MenuBarStatus, auto-rule suggestions, full PersonaCard, branding, .dmg.

 Files to create

 ┌───────────────────────────────────────────┬──────────────────────────────────────────────────────────────────┐
 │                   File                    │                             Purpose                              │
 ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ src/renderer/components/MenuBarStatus.tsx │ Mode switcher (Focused/Away/Autonomous), coffee cup, badge count │
 ├───────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
 │ src/renderer/components/AutoRuleModal.tsx │ "Save as auto-rule?" after 3 same answers                        │
 └───────────────────────────────────────────┴──────────────────────────────────────────────────────────────────┘

 Files to upgrade

 ┌─────────────────────────────────────────┬──────────────────────────────────────────────────────────┐
 │                  File                   │                          Change                          │
 ├─────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
 │ src/renderer/components/PersonaCard.tsx │ Full form: agent type, persona, repo dir, initial prompt │
 └─────────────────────────────────────────┴──────────────────────────────────────────────────────────┘

 Files to modify

 ┌──────────────────────┬─────────────────────────────────────────────────────┐
 │         File         │                       Change                        │
 ├──────────────────────┼─────────────────────────────────────────────────────┤
 │ src/renderer/App.tsx │ Add MenuBarStatus to toolbar, wire AutoRuleModal    │
 ├──────────────────────┼─────────────────────────────────────────────────────┤
 │ src/main/index.ts    │ Update Electron menu to OctoAgent, add Mode submenu │
 ├──────────────────────┼─────────────────────────────────────────────────────┤
 │ electron-builder.yml │ Final branding, icon, .dmg config                   │
 ├──────────────────────┼─────────────────────────────────────────────────────┤
 │ package.json         │ Final metadata                                      │
 └──────────────────────┴─────────────────────────────────────────────────────┘

 Verify

 - Mode switcher works end-to-end
 - Auto-rule suggestion appears after 3 same answers
 - pnpm dist → produces OctoAgent .dmg
 - Install from .dmg → full workflow works

 ---
 Critical Invariants (enforced across all phases)

 1. All state through supervisor — renderer never reads PTY directly
 2. One run per session — SessionQueue Promise chain
 3. Flush before discard — memory.flush() on done, before cleanup
 4. Every action logged — transcript.jsonl append on every event
 5. Recovery from disk — load from transcript.jsonl + memory.md on restart
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
