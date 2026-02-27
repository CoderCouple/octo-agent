/**
 * Helpers for persisting session state to disk and migrating legacy panel visibility fields.
 */
import { PANEL_IDS } from '../panels/types'
import type { Session, PanelVisibility } from './sessions'
import { scheduleSave } from './configPersistence'

// Re-export from configPersistence for backwards compatibility
export {
  setCurrentProfileId,
  getCurrentProfileId,
  setLoadedSessionCount,
  getLoadedSessionCount,
} from './configPersistence'

// Helper to sync legacy fields from panelVisibility
export function syncLegacyFields(session: Session): Session {
  return {
    ...session,
    showExplorer: session.panelVisibility[PANEL_IDS.EXPLORER] ?? false,
    showFileViewer: session.panelVisibility[PANEL_IDS.FILE_VIEWER] ?? false,
  }
}

// Helper to create panelVisibility from legacy fields
export function createPanelVisibilityFromLegacy(data: {
  showExplorer?: boolean
  showFileViewer?: boolean
  panelVisibility?: PanelVisibility
}): PanelVisibility {
  // If panelVisibility exists, use it
  if (data.panelVisibility) {
    return data.panelVisibility
  }
  // Otherwise, create from legacy fields
  return {
    [PANEL_IDS.EXPLORER]: data.showExplorer ?? false,
    [PANEL_IDS.FILE_VIEWER]: data.showFileViewer ?? false,
  }
}

// Debounced save — delegates to the unified configPersistence module.
// configPersistence reads current state from all stores when saving.
export const debouncedSave = () => {
  scheduleSave()
}
