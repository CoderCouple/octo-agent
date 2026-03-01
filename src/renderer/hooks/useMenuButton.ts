/**
 * Hook for the hamburger menu button on non-macOS platforms.
 * Calls window.menu.appMenuPopup() and dispatches results to the appropriate handlers.
 */
import { useEffect, useState, useCallback } from 'react'
import { useTutorialStore } from '../store/tutorial'

export function useMenuButton(deps: {
  setShowPanelPicker: (v: boolean) => void
  setShowHelpModal: (v: boolean) => void
  setShowShortcutsModal: (v: boolean) => void
}) {
  const [platform, setPlatform] = useState<string>('darwin')

  useEffect(() => {
    void window.app.platform().then(setPlatform)
  }, [])

  const isMac = platform === 'darwin'

  const handleMenuButtonClick = useCallback(async () => {
    const result = await window.menu.appMenuPopup()
    if (!result) return
    switch (result) {
      case 'configure-toolbar':
        deps.setShowPanelPicker(true)
        break
      case 'help:getting-started':
        deps.setShowHelpModal(true)
        break
      case 'help:shortcuts':
        deps.setShowShortcutsModal(true)
        break
      case 'help:reset-tutorial':
        useTutorialStore.getState().resetProgress()
        break
      case 'check-for-updates':
        void window.update.checkForUpdates()
        break
    }
  }, [deps.setShowPanelPicker, deps.setShowHelpModal, deps.setShowShortcutsModal])

  return { isMac, handleMenuButtonClick }
}
