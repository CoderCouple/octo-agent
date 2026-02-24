import { useSessionStore } from '../store/sessions'

const AGENT_TAB_ID = '__agent__'

/**
 * Switch to the agent terminal tab and focus its xterm input.
 * Uses requestAnimationFrame to ensure the DOM has updated after any state changes.
 */
export function focusAgentTerminal(): void {
  // Switch to the agent tab first
  const state = useSessionStore.getState()
  const sessionId = state.activeSessionId
  if (sessionId) {
    state.setActiveTerminalTab(sessionId, AGENT_TAB_ID)
  }

  // Double-rAF ensures React has committed the re-render (removing 'hidden'
  // from the agent tab) before we try to focus the textarea inside it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const container = document.querySelector('[data-panel-id="terminal"]')
      if (!container) return
      const textarea = container.querySelector<HTMLElement>('.xterm-helper-textarea')
      textarea?.focus()
    })
  })
}

/**
 * Focus the explorer search input.
 * Uses requestAnimationFrame to ensure the DOM has updated after any state changes.
 */
export function focusSearchInput(): void {
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>('[data-explorer-search]')
    input?.focus()
  })
}
