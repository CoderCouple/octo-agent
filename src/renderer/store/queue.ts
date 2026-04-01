/**
 * Attention queue store: items needing user attention, priority sorted.
 */
import { create } from 'zustand'

export type AttentionPriority = 'high' | 'medium' | 'low'

export interface AttentionItem {
  id: string
  sessionId: string
  priority: AttentionPriority
  title: string
  description: string
  timestamp: number
  decisionId?: string
}

const PRIORITY_ORDER: Record<AttentionPriority, number> = { high: 0, medium: 1, low: 2 }

interface QueueStore {
  items: AttentionItem[]
  add: (item: AttentionItem) => void
  dismiss: (id: string) => void
  clear: () => void
  getTop: (count: number) => AttentionItem[]
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],

  add: (item) => {
    set((state) => {
      const items = [...state.items, item].sort(
        (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.timestamp - a.timestamp
      )
      return { items }
    })
  },

  dismiss: (id) => {
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }))
  },

  clear: () => set({ items: [] }),

  getTop: (count) => get().items.slice(0, count),
}))
