/**
 * Provides memoized keyboard callback handlers for session navigation, panel toggling, archiving, and terminal tab switching.
 */
import { useCallback } from 'react'
import { PANEL_IDS } from '../../panels'
import type { Session } from '../../store/sessions'

const AGENT_TAB_ID = '__agent__'

interface SessionKeyboardCallbacksDeps {
  sessions: Session[]
  activeSessionId: string | null
  globalPanelVisibility: Record<string, boolean>
  toggleGlobalPanel: (panelId: string) => void
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  handleSelectSession: (id: string) => void
  setShowShortcutsModal: (show: boolean) => void
  setActiveTerminalTab: (sessionId: string, tabId: string) => void
}

export function useSessionKeyboardCallbacks({
  sessions,
  activeSessionId,
  globalPanelVisibility,
  toggleGlobalPanel,
  archiveSession,
  unarchiveSession,
  handleSelectSession,
  setShowShortcutsModal,
  setActiveTerminalTab,
}: SessionKeyboardCallbacksDeps) {
  const handleNextSession = useCallback(() => {
    const active = sessions.filter((s) => !s.isArchived)
    if (active.length === 0) return
    const currentIndex = active.findIndex((s) => s.id === activeSessionId)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % active.length
    handleSelectSession(active[nextIndex].id)
  }, [sessions, activeSessionId, handleSelectSession])

  const handlePrevSession = useCallback(() => {
    const active = sessions.filter((s) => !s.isArchived)
    if (active.length === 0) return
    const currentIndex = active.findIndex((s) => s.id === activeSessionId)
    const prevIndex = currentIndex <= 0 ? active.length - 1 : currentIndex - 1
    handleSelectSession(active[prevIndex].id)
  }, [sessions, activeSessionId, handleSelectSession])

  const handleFocusSessionList = useCallback(() => {
    if (!globalPanelVisibility[PANEL_IDS.SIDEBAR]) {
      toggleGlobalPanel(PANEL_IDS.SIDEBAR)
    }
    requestAnimationFrame(() => {
      const activeCard = document.querySelector<HTMLElement>(`[data-panel-id="${PANEL_IDS.SIDEBAR}"] [tabindex="0"].bg-accent\\/15`)
      if (activeCard) {
        activeCard.focus()
      } else {
        const firstCard = document.querySelector<HTMLElement>(`[data-panel-id="${PANEL_IDS.SIDEBAR}"] [tabindex="0"]`)
        firstCard?.focus()
      }
    })
  }, [globalPanelVisibility, toggleGlobalPanel])

  const handleFocusSessionSearch = useCallback(() => {
    if (!globalPanelVisibility[PANEL_IDS.SIDEBAR]) {
      toggleGlobalPanel(PANEL_IDS.SIDEBAR)
    }
    requestAnimationFrame(() => {
      const searchInput = document.querySelector<HTMLInputElement>('[data-session-search]')
      searchInput?.focus()
    })
  }, [globalPanelVisibility, toggleGlobalPanel])

  const handleArchiveSession = useCallback(() => {
    if (!activeSessionId) return
    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return
    if (session.isArchived) {
      unarchiveSession(activeSessionId)
    } else {
      archiveSession(activeSessionId)
    }
  }, [activeSessionId, sessions, archiveSession, unarchiveSession])

  const handleToggleSettings = useCallback(() => {
    toggleGlobalPanel(PANEL_IDS.SETTINGS)
  }, [toggleGlobalPanel])

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsModal(true)
  }, [setShowShortcutsModal])

  const cycleTerminalTab = useCallback((direction: 1 | -1) => {
    if (!activeSessionId) return
    const session = sessions.find((s) => s.id === activeSessionId)
    if (!session) return
    const userTabs = session.terminalTabs.tabs
    const allTabIds = [AGENT_TAB_ID, ...userTabs.map((t) => t.id)]
    if (allTabIds.length <= 1) return
    const currentId = session.terminalTabs.activeTabId ?? AGENT_TAB_ID
    const currentIndex = allTabIds.indexOf(currentId)
    const nextIndex = (currentIndex + direction + allTabIds.length) % allTabIds.length
    setActiveTerminalTab(activeSessionId, allTabIds[nextIndex])
  }, [activeSessionId, sessions, setActiveTerminalTab])

  const handleNextTerminalTab = useCallback(() => cycleTerminalTab(1), [cycleTerminalTab])
  const handlePrevTerminalTab = useCallback(() => cycleTerminalTab(-1), [cycleTerminalTab])

  return {
    handleNextSession,
    handlePrevSession,
    handleFocusSessionList,
    handleFocusSessionSearch,
    handleArchiveSession,
    handleToggleSettings,
    handleShowShortcuts,
    handleNextTerminalTab,
    handlePrevTerminalTab,
  }
}
