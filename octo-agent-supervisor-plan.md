 Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Phase 3: Supervisor as Active AI Participant in Group Chat

 Context

 Phase 2 (complete) built the PTY/SDK bridge + permission-gated P2P + SDK response bridge so group chat messages reach member agents and responses display. But the supervisor has no chat presence — it's a backend orchestrator only. User wants
 it as a visible, active AI participant.

 Approach: Group Session = Supervisor Agent

 Make the group session itself the supervisor's SDK agent. GroupChatView already merges allMessages[session.id], so supervisor responses appear naturally.

 Steps

 Step 1: Add supervisor character

 src/renderer/data/avatars.json — append:
 { "id": "hiruzen", "name": "Hiruzen Sarutobi", "shortName": "Supervisor", "color": "#5D4037", "initials": "SV", "trait": "Wise coordinator", "image": "" }

 Step 2: Export constant

 src/renderer/data/narutoCharacters.ts — add:
 export const SUPERVISOR_CHARACTER_ID = 'hiruzen'

 Step 3: Update addGroupSession

 src/renderer/store/sessions.ts — accept supervisorConfig?: { agentId: string; directory: string }, set agentId, directory, characterId: SUPERVISOR_CHARACTER_ID.

 Step 4: Update NewGroupDialog

 src/renderer/features/sessions/newSession/NewGroupDialog.tsx — derive agentId + directory from first member, pass to addGroupSession().

 Step 5: Update GroupChatView

 src/renderer/panels/agent/GroupChatView.tsx:
 - Subscribe to SDK messages for session.id (supervisor)
 - In handleSend: also call window.agentSdk.send(session.id, text, ...) with coordinator prompt prefix on first message
 - In mergedMessages: set memberSession: session for group-session agent messages → renders supervisor avatar

 Verification

 1. Create new group → group session has agentId + characterId 'hiruzen'
 2. Send message → supervisor responds alongside agents with "SV" avatar
 3. Existing groups without agentId still work (backward compatible)
 4. pnpm build passes

 ---
 Phase 2: Supervisor PTY Bridge + Permission-Gated Agent Communication (COMPLETE)

 Context

 Phase 1 (complete) built the Group Session UI, Peers Adapter, MCP server, and basic wiring. But there are two critical gaps:

 1. Dead end #1: User messages from group chat → supervisor.handleUserMessage() → logs + emits event → never reaches agent PTY
 2. Dead end #2: Peer messages (Agent A → Agent B) go to HTTP queue + UI, but never reach Agent B's PTY input

 The supervisor has zero access to PTY processes (owned by HandlerContext). We need a PTY bridge.

 Additionally, the user wants:
 - Direct P2P kept (agents can poll messages via check_messages MCP tool)
 - Supervisor permission gate before any P2P message goes through
 - All agent-to-agent communication routed through supervisor as gatekeeper
 - Each agent owns its own repo, supervisor directs agents

 ---
 Architecture After This Phase

 User types in Group Chat
   → WS 'send' frame {sessionId, text, memberSessionIds}
   → Gateway → onSend route handler
   → supervisor.sendToGroupMembers(memberIds, text)
     → For EACH member:
       → appendTranscript()
       → emit('agentEvent') → Gateway → UI
       → writeToPty(memberId, text + '\n')  ← NEW: PTY bridge
         → sessionPtyMap.get(memberId) → ptyId
         → ptyProcesses.get(ptyId).write(text)
         → Agent receives text in terminal

 Agent A calls send_message(to=B, text)
   → MCP server → POST /peers/send
   → peersAdapter → onPeerMessage callback
   → supervisor.handlePeerMessage(message)
     → PERMISSION CHECK (one-time approval per peer pair)
       → If approved: queue message + write to PTY + emit to UI
       → If not approved: emit 'decision' event → HITL → phone/UI approval
         → On approval: queue + write + emit, grant one-time permission
         → On denial: reject, notify Agent A

 Supervisor directive:
   → supervisor.sendDirective(sessionId, instruction)
     → appendTranscript() + emit() + writeToPty()

 ---
 Implementation Steps

 Step 1: Add sessionPtyMap to HandlerContext

 File: src/main/handlers/types.ts

 Add to HandlerContext interface:
 sessionPtyMap: Map<string, string>  // sessionId → ptyId

 Step 2: Create the map + bridge in main process

 File: src/main/index.ts

 After existing ptyProcesses map (line ~102):
 const sessionPtyMap = new Map<string, string>()

 Define writeToPty bridge function:
 function writeToPty(sessionId: string, text: string): boolean {
   const ptyId = sessionPtyMap.get(sessionId)
   if (!ptyId) return false
   const proc = ptyProcesses.get(ptyId)
   if (!proc) return false
   proc.write(text)
   return true
 }

 Call supervisor.setPtyBridge(writeToPty) after supervisor creation.

 Pass sessionPtyMap into the HandlerContext (line ~314).

 Update onSend route handler to dispatch group messages:
 onSend: (_clientId, frame) => {
   const text = frame.payload?.text as string
   const memberSessionIds = frame.payload?.memberSessionIds as string[] | undefined
   if (memberSessionIds?.length) {
     supervisor.sendToGroupMembers(memberSessionIds, text, 'user')
   } else if (frame.sessionId && text) {
     supervisor.handleUserMessage(frame.sessionId, text)
   }
 }

 Step 3: Populate/clean sessionPtyMap in PTY handler

 File: src/main/handlers/pty.ts

 In pty:create handler, after wirePtyEvents():
 if (options.sessionId) {
   ctx.sessionPtyMap.set(options.sessionId, options.id)
 }

 In pty:kill handler + onExit callback in wirePtyEvents():
 for (const [sessId, ptyId] of ctx.sessionPtyMap) {
   if (ptyId === id) { ctx.sessionPtyMap.delete(sessId); break }
 }

 Same for devcontainer path (createDevcontainerPty).

 Step 4: Supervisor — PTY bridge + new methods

 File: src/main/supervisor/index.ts

 Add:
 export type PtyBridgeFn = (sessionId: string, text: string) => boolean

 // In class Supervisor:
 private writeToPty: PtyBridgeFn | null = null
 private peerPermissions = new Map<string, Set<string>>()  // "from" → Set<"to"> approved pairs

 setPtyBridge(bridge: PtyBridgeFn): void {
   this.writeToPty = bridge
 }

 Update handleUserMessage() — add PTY write:
 handleUserMessage(sessionId: string, text: string): void {
   // ... existing log + emit ...
   this.writeToPty?.(sessionId, `${text}\n`)
 }

 Add sendToGroupMembers():
 sendToGroupMembers(memberSessionIds: string[], text: string, from: string): void {
   for (const memberId of memberSessionIds) {
     const event = { id: randomUUID(), sessionId: memberId, type: 'message', timestamp: Date.now(), data: { from, text, groupMessage: true } }
     appendTranscript(event)
     this.emit('agentEvent', event)
     this.writeToPty?.(memberId, `${text}\n`)
   }
 }

 Add sendDirective():
 sendDirective(sessionId: string, instruction: string): void {
   const event = { id: randomUUID(), sessionId, type: 'message', timestamp: Date.now(), data: { from: 'supervisor', text: instruction } }
   appendTranscript(event)
   this.emit('agentEvent', event)
   this.writeToPty?.(sessionId, `${instruction}\n`)
 }

 Update handlePeerMessage() — add permission gate + PTY write:
 handlePeerMessage(message: PeerMessage): void {
   const { from, to, text } = message
   const permKey = `${from}→${to}`

   // Check if this peer pair is already approved
   const approvedTargets = this.peerPermissions.get(from)
   if (approvedTargets?.has(to)) {
     // Already approved — deliver immediately
     this.deliverPeerMessage(message)
     return
   }

   // Not yet approved — create HITL decision
   const decisionId = `peer-${message.id}`
   const decision = {
     id: decisionId,
     sessionId: to,
     type: 'peer-communication' as const,
     summary: `Agent "${message.fromName || from}" wants to message agent "${to}": "${text.substring(0, 100)}"`,
     timestamp: Date.now(),
     peerMessage: message,
   }

   // Emit decision for UI / phone approval
   this.emit('decision', decision)

   // Listen for resolution
   this.once(`decision:${decisionId}`, (resolution: string) => {
     if (resolution === 'approve') {
       // Grant one-time permission for this pair
       if (!this.peerPermissions.has(from)) {
         this.peerPermissions.set(from, new Set())
       }
       this.peerPermissions.get(from)!.add(to)
       // Deliver the message
       this.deliverPeerMessage(message)
     } else {
       // Denied — notify sender
       this.emit('agentEvent', {
         id: randomUUID(),
         sessionId: from,
         type: 'message',
         timestamp: Date.now(),
         data: { from: 'supervisor', text: `Permission denied to message ${to}` },
       })
     }
   })
 }

 private deliverPeerMessage(message: PeerMessage): void {
   const event = { id: message.id, sessionId: message.to, type: 'message', timestamp: message.timestamp,
     data: { from: message.from, fromName: message.fromName, text: message.text, peerMessage: true } }
   appendTranscript(event)
   this.emit('peerMessage', { sessionId: message.to, from: message.from, fromName: message.fromName, text: message.text, timestamp: message.timestamp })
   // Queue for P2P polling (kept for direct check_messages)
   this.emit('peerMessageApproved', message)
   // Write to target agent's PTY
   const fromLabel = message.fromName || message.from
   this.writeToPty?.(message.to, `[From ${fromLabel}]: ${message.text}\n`)
 }

 Step 5: Wire permission approval back to peers adapter

 File: src/main/index.ts

 Add listener for approved peer messages to queue them:
 supervisor.on('peerMessageApproved', (message) => {
   queueMessageForPeer(message.to, message)
 })

 This keeps direct P2P polling working — check_messages still returns queued messages, but only after supervisor approval.

 Step 6: Update GroupChatView to pass memberSessionIds

 File: src/renderer/panels/agent/GroupChatView.tsx

 When sending a message, include memberSessionIds in the WS frame payload:
 send({
   id: randomUUID(),
   method: 'send',
   sessionId: session.id,
   payload: { text, memberSessionIds: session.memberSessionIds },
 })

 This replaces the current per-member send loop with a single frame that the supervisor dispatches.

 ---
 Files to Modify

 ┌─────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                    File                     │                                                            Change                                                            │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/handlers/types.ts                  │ Add sessionPtyMap to HandlerContext                                                                                          │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/index.ts                           │ Create sessionPtyMap, writeToPty bridge, wire to supervisor, update onSend for groups, add peerMessageApproved listener      │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/handlers/pty.ts                    │ Populate sessionPtyMap on pty:create, clean on pty:kill/onExit                                                               │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/main/supervisor/index.ts                │ Add setPtyBridge, peerPermissions, sendToGroupMembers, sendDirective, permission-gated handlePeerMessage, deliverPeerMessage │
 ├─────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │ src/renderer/panels/agent/GroupChatView.tsx │ Send single WS frame with memberSessionIds instead of per-member loop                                                        │
 └─────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 ---
 Verification

 1. Group Chat → Agent PTY: Type message in group chat → each member agent receives it in their terminal
 2. P2P with permission: Agent A calls send_message(to=B) → supervisor emits decision → approve in UI → Agent B receives in PTY + check_messages
 3. P2P after approval: Same pair sends again → goes through immediately (one-time permission granted)
 4. P2P denial: Deny the permission → Agent A gets "Permission denied" notification
 5. Supervisor directive: Call supervisor.sendDirective(sessionId, "review the PR") → agent receives in terminal
 6. Build: pnpm build passes
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
