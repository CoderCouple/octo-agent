/**
 * Zustand store for the supervisor chat panel.
 * Receives messages from the gateway WebSocket and tracks task progress.
 */
import { create } from 'zustand'

export type SupervisorMessageType = 'user' | 'assistant' | 'system' | 'action'

export interface BrainAction {
  type: string
  sessionId?: string
  text?: string
  sourceSessionIds?: string[]
  parentTaskId?: string
  dependencies?: string[]
}

export interface SupervisorMessage {
  id: string
  type: SupervisorMessageType
  content: string
  timestamp: number
  actions?: BrainAction[]
  thinking?: string
}

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'done' | 'failed' | 'blocked'

export interface TaskProgress {
  id: string
  description: string
  status: TaskStatus
  assignedTo: string[]
  subtaskIds: string[]
  parentTaskId?: string
}

interface SupervisorChatStore {
  messages: SupervisorMessage[]
  tasks: TaskProgress[]
  isThinking: boolean

  addMessage: (msg: SupervisorMessage) => void
  setTasks: (tasks: TaskProgress[]) => void
  setThinking: (thinking: boolean) => void
  clearMessages: () => void
}

let messageCounter = 0

export const useSupervisorChatStore = create<SupervisorChatStore>((set) => ({
  messages: [],
  tasks: [],
  isThinking: false,

  addMessage: (msg) => {
    set((state) => ({
      messages: [...state.messages, { ...msg, id: msg.id || `sup-${++messageCounter}` }],
      isThinking: false,
    }))
  },

  setTasks: (tasks) => {
    set({ tasks })
  },

  setThinking: (thinking) => {
    set({ isThinking: thinking })
  },

  clearMessages: () => {
    set({ messages: [], isThinking: false })
  },
}))
