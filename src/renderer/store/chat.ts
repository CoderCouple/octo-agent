/**
 * Chat store: messages per session, add/resolve decisions.
 */
import { create } from 'zustand'

export type ChatMessageType = 'agent' | 'user' | 'decision' | 'system' | 'report' | 'memory'

export interface ChatMessage {
  id: string
  sessionId: string
  type: ChatMessageType
  timestamp: number
  text: string
  data?: Record<string, unknown>
}

interface ChatStore {
  messages: Record<string, ChatMessage[]> // sessionId → messages
  addMessage: (msg: ChatMessage) => void
  getMessages: (sessionId: string) => ChatMessage[]
  clearSession: (sessionId: string) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: {},

  addMessage: (msg) => {
    set((state) => {
      const sessionMsgs = [...(state.messages[msg.sessionId] || []), msg]
      return { messages: { ...state.messages, [msg.sessionId]: sessionMsgs } }
    })
  },

  getMessages: (sessionId) => {
    return get().messages[sessionId] || []
  },

  clearSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.messages
      return { messages: rest }
    })
  },
}))
