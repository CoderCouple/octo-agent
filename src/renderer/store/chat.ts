/**
 * Chat store: messages per session, unread tracking, active contact selection.
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
  unreadCounts: Record<string, number> // sessionId → unread count
  activeContactId: string | null // currently viewed contact (sessionId or groupId)
  addMessage: (msg: ChatMessage) => void
  getMessages: (sessionId: string) => ChatMessage[]
  clearSession: (sessionId: string) => void
  incrementUnread: (sessionId: string) => void
  clearUnread: (sessionId: string) => void
  setActiveContact: (id: string | null) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: {},
  unreadCounts: {},
  activeContactId: null,

  addMessage: (msg) => {
    set((state) => {
      const sessionMsgs = [...(state.messages[msg.sessionId] || []), msg]
      const updates: Partial<ChatStore> = {
        messages: { ...state.messages, [msg.sessionId]: sessionMsgs },
      }
      // Auto-increment unread if this session is not the active contact
      if (msg.sessionId !== state.activeContactId && msg.type !== 'user') {
        updates.unreadCounts = {
          ...state.unreadCounts,
          [msg.sessionId]: (state.unreadCounts[msg.sessionId] || 0) + 1,
        }
      }
      return updates as ChatStore
    })
  },

  getMessages: (sessionId) => {
    return get().messages[sessionId] || []
  },

  clearSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.messages
      const { [sessionId]: __, ...unreadRest } = state.unreadCounts
      return { messages: rest, unreadCounts: unreadRest }
    })
  },

  incrementUnread: (sessionId) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [sessionId]: (state.unreadCounts[sessionId] || 0) + 1,
      },
    }))
  },

  clearUnread: (sessionId) => {
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [sessionId]: 0 },
    }))
  },

  setActiveContact: (id) => {
    set({ activeContactId: id })
    // Clear unread when switching to a contact
    if (id) {
      set((state) => ({
        unreadCounts: { ...state.unreadCounts, [id]: 0 },
      }))
    }
  },
}))
