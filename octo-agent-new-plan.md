 Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Group Session: Inter-Agent Communication via claude-peers Pattern

 Context

 OctoAgent runs multiple AI coding agents (Claude Code / Gemini / Codex) simultaneously, each in its own session with a PTY terminal. Currently agents work in isolation — they can't discover or message each other.

 The user wants a Group Session feature where all agents can communicate together. Inspired by claude-peers-mcp, which uses a broker + MCP tools for peer discovery and messaging.

 Key insight: OctoAgent already HAS the broker (Gateway WS :18789) and the orchestrator (Supervisor). We just need:
 1. An MCP adapter that gives each agent list_peers / send_message / set_summary tools
 2. A Group Session UI that shows the aggregated inter-agent conversation

 ---
 Architecture

 ┌──────────────────────────────────────-───┐
 │  OctoAgent Main Process                  │
 │                                          │
 │  ┌─────────────-┐  ┌──────────────────┐  │
 │  │  Gateway     │  │  Supervisor      │  │
 │  │  WS :18789   │  │  (EventEmitter)  │  │
 │  └──────┬───────┘  └────────┬─────────┘  │
 │         │                   │            │
 │  ┌──────┴───────────────────┴──────────┐ │
 │  │  Peers Adapter (HTTP :18790)        │ │
 │  │  - POST /peers/register             │ │
 │  │  - POST /peers/send                 │ │
 │  │  - GET  /peers/list                 │ │
 │  │  - GET  /peers/messages/:id         │ │
 │  │  - POST /peers/summary              │ │
 │  └──────┬──────────────┬───────────────┘ │
 │         │              │                 │
 │    MCP Server A   MCP Server B           │
 │    (stdio)        (stdio)                │
 │         │              │                 │
 │    Claude A        Claude B              │
 │    (Session 1)     (Session 2)           │
 └───────────────────────────────────-──────┘

 Each agent session gets a built-in MCP server (spawned alongside the agent) that provides peer tools. The MCP server talks to the Peers Adapter HTTP endpoint, which routes through the Supervisor.

 ---
 Implementation Steps

 Step 1: Peers Adapter (Backend)

 Create src/main/gateway/adapters/peersAdapter.ts

 HTTP server on port 18790 (or dynamic). Endpoints:

 ┌─────────────────────────┬────────┬──────────────────────────────────────────────────────────┐
 │        Endpoint         │ Method │                       Description                        │
 ├─────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /peers/register         │ POST   │ Register a peer { peerId, sessionId, directory, branch } │
 ├─────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /peers/list             │ GET    │ List all active peers with summaries                     │
 ├─────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /peers/send             │ POST   │ Send message { from, to, text } → routes to supervisor   │
 ├─────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /peers/messages/:peerId │ GET    │ Poll messages for a peer (returns + clears)              │
 ├─────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /peers/summary          │ POST   │ Set peer summary { peerId, summary }                     │
 └─────────────────────────┴────────┴──────────────────────────────────────────────────────────┘

 Storage: in-memory Map (peers die with app restart, which is fine since sessions also restart).

 Messages are stored in a pendingMessages: Map<peerId, Message[]> queue. When polled, messages are returned and cleared.

 Also emits peerMessage events to the Supervisor so they appear in the Group Session UI.

 Step 2: MCP Server for Agents

 Create src/main/mcp/peersMcpServer.ts

 A stdio MCP server (Node.js script) that each agent session spawns. Provides 4 tools:

 - list_peers — GET /peers/list, returns all active agents with name, directory, branch, summary
 - send_message — POST /peers/send with { to: peerId, text }
 - check_messages — GET /peers/messages/:myPeerId, returns pending messages
 - set_summary — POST /peers/summary with description of current work

 The MCP server receives PEERS_ADAPTER_PORT and PEER_ID via env vars.

 Step 3: Inject MCP Server into Agent Sessions

 Modify src/main/handlers/pty.ts

 In pty:create, before spawning the PTY:
 1. Auto-register the session as a peer via the Peers Adapter
 2. Add claude mcp add command to inject the peers MCP server for this session

 Follow the same inject/remove pattern as hookAdapter.ts:
 - injectPeersMcp(sessionId) — runs claude mcp add peers-mcp -- node <path>/peersMcpServer.js with env vars
 - removePeersMcp(sessionId) — runs claude mcp remove peers-mcp on session cleanup

 Step 4: Group Session Type + Store

 Modify src/renderer/store/sessions.ts

 Add to Session interface:
 sessionType?: 'default' | 'review' | 'group'
 memberSessionIds?: string[]  // For group sessions: which sessions are members

 Modify src/renderer/store/sessionCoreActions.ts

 Add addGroupSession(name: string, memberSessionIds: string[]):
 - Creates a session with sessionType: 'group'
 - No agentId (group doesn't run its own agent)
 - No directory/branch (virtual session)
 - Stores memberSessionIds

 Step 5: Group Session Card (Stacked Avatars)

 Modify src/renderer/panels/sidebar/SessionCard.tsx

 For group sessions, replace the single avatar with stacked overlapping avatars:

 {/* Stacked avatars for group session */}
 <div className="flex -space-x-3 flex-shrink-0">
   {memberCharacters.slice(0, 3).map((char, i) => (
     <div key={char.id}
       className="w-8 h-8 rounded-full border-2 border-bg-primary flex items-center justify-center"
       style={{ backgroundColor: char.color, zIndex: 3 - i }}>
       <span className="text-xs font-bold text-white">{char.initials}</span>
     </div>
   ))}
   {memberCount > 3 && (
     <div className="w-8 h-8 rounded-full border-2 border-bg-primary bg-bg-tertiary flex items-center justify-center"
       style={{ zIndex: 0 }}>
       <span className="text-xs font-medium text-text-secondary">+{memberCount - 3}</span>
     </div>
   )}
 </div>

 Card shows: stacked avatars, group name, member count, last message from any member.

 Step 6: "New Group" Button in Sidebar

 Modify src/renderer/panels/sidebar/SessionList.tsx

 Add a group icon button next to "+ New Session":

 <div className="p-3 border-b border-border flex items-center gap-2">
   <button onClick={onNewSession} className="flex-1 ...">+ New Session</button>
   <button onClick={onNewGroup} className="p-2 ..." title="Create group session">
     {/* group users icon */}
   </button>
 </div>

 Step 7: New Group Dialog

 Create src/renderer/features/sessions/newSession/NewGroupDialog.tsx

 Simple modal:
 - Text input for group name
 - List of existing sessions with checkboxes (showing avatar + character name + branch)
 - Min 2 sessions required
 - "Create Group" button → calls addGroupSession(name, selectedIds)

 Step 8: Group Chat View (Agent Panel)

 Create src/renderer/panels/agent/GroupChatView.tsx

 When a group session is active, render this instead of TabbedTerminal:

 - Header: Group name + stacked member avatars + "Brief All" button
 - Message feed: Scrollable list of messages from all member sessions, each labeled with character avatar + name
 - Input bar: Text input + Send button — sends message to all member agents via gateway
 - Actions bar: "Brief All" (cross-agent briefing), "Pause All", "Resume All"

 Messages come from:
 1. useChatStore.messages[memberId] for each member — agent events
 2. Peer-to-peer messages from the Peers Adapter (new peerMessage event type)

 Modify src/renderer/hooks/usePanelsMap.tsx

 In the terminal panel logic, check if active session is a group:
 if (activeSession?.sessionType === 'group') {
   return <GroupChatView session={activeSession} />
 } else {
   return <TabbedTerminal ... />
 }

 Step 9: Wire Peer Messages to UI

 Modify src/renderer/hooks/useGateway.ts

 Subscribe to new peerMessage event from gateway:
 on('peerMessage', (frame) => {
   addMessage({
     id: randomUUID(),
     sessionId: frame.sessionId,
     type: 'agent',
     timestamp: Date.now(),
     text: `[From ${frame.payload.fromName}]: ${frame.payload.text}`,
     data: { eventType: 'peerMessage', from: frame.payload.from },
   })
 })

 Step 10: Supervisor Integration

 Modify src/main/supervisor/index.ts

 - Track peer messages in transcript.jsonl
 - When a peer message arrives, emit agentEvent to gateway for the target session
 - Support briefAll(groupSessionId) that generates cross-agent briefings for all members

 ---
 Files Summary

 New Files (4)

 ┌──────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────┐
 │                             File                             │                     Purpose                     │
 ├──────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/main/gateway/adapters/peersAdapter.ts                    │ HTTP server for peer discovery + messaging      │
 ├──────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/main/mcp/peersMcpServer.ts                               │ Stdio MCP server providing peer tools to agents │
 ├──────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderer/features/sessions/newSession/NewGroupDialog.tsx │ Modal to create group session                   │
 ├──────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
 │ src/renderer/panels/agent/GroupChatView.tsx                  │ Chat view for group sessions                    │
 └──────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────┘

 Modified Files (7)

 ┌─────────────────────────────────────────────┬──────────────────────────────────────────────────┐
 │                    File                     │                      Change                      │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────┤
 │ src/renderer/store/sessions.ts              │ Add 'group' to sessionType, add memberSessionIds │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────┤
 │ src/renderer/store/sessionCoreActions.ts    │ Add addGroupSession()                            │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────┤
 │ src/renderer/panels/sidebar/SessionCard.tsx │ Stacked avatars for group sessions               │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────┤
 │ src/renderer/panels/sidebar/SessionList.tsx │ Add "New Group" button                           │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────┤
 │ src/renderer/hooks/usePanelsMap.tsx         │ Render GroupChatView for group sessions          │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────┤
 │ src/renderer/hooks/useGateway.ts            │ Subscribe to peerMessage events                  │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────┤
 │ src/main/handlers/pty.ts                    │ Inject peers MCP server into agent sessions      │
 └─────────────────────────────────────────────┴──────────────────────────────────────────────────┘

 ---
 Verification

 1. Peer Discovery: Start 2 sessions → Agent A calls list_peers → sees Agent B
 2. Peer Messaging: Agent A calls send_message(to=B, "what files are you editing?") → Agent B receives it
 3. Group Session: Click group button → select 2+ sessions → see stacked avatars in sidebar
 4. Group Chat: Click group → see interleaved messages from all members with character labels
 5. Group Send: Type in group chat → message delivered to all member agents
 6. Brief All: Click "Brief All" → each agent gets a summary of what others are doing
 7. Build: pnpm build passes with no errors
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
