/**
 * Manages file navigation state including diff mode, scroll-to-line, search highlights, and dirty-file save coordination across sessions.
 */
import { useState, useCallback, useRef } from 'react'
import { resolveNavigation, applyPendingNavigation, type NavigationTarget } from '../shared/utils/fileNavigation'

export function useFileNavigation({
  activeSessionId,
  activeSessionSelectedFilePath,
  selectFile,
}: {
  activeSessionId: string | null
  activeSessionSelectedFilePath: string | null
  selectFile: (sessionId: string, filePath: string) => void
}) {
  const [openFileInDiffMode, setOpenFileInDiffMode] = useState(false)
  const [scrollToLine, setScrollToLine] = useState<number | undefined>(undefined)
  const [searchHighlight, setSearchHighlight] = useState<string | undefined>(undefined)
  const [diffBaseRef, setDiffBaseRef] = useState<string | undefined>(undefined)
  const [diffCurrentRef, setDiffCurrentRef] = useState<string | undefined>(undefined)
  const [diffLabel, setDiffLabel] = useState<string | undefined>(undefined)
  const [pendingNavigation, setPendingNavigation] = useState<NavigationTarget | null>(null)

  // Per-session dirty state and save function maps
  const dirtyMapRef = useRef<Record<string, boolean>>({})
  const saveMapRef = useRef<Record<string, (() => Promise<void>) | null>>({})

  const setIsFileViewerDirty = useCallback((sessionId: string, dirty: boolean) => {
    dirtyMapRef.current[sessionId] = dirty
  }, [])

  const registerSaveFunction = useCallback((sessionId: string, fn: (() => Promise<void>) | null) => {
    saveMapRef.current[sessionId] = fn
  }, [])

  const unregisterSaveFunction = useCallback((sessionId: string) => {
    saveMapRef.current[sessionId] = null
  }, [])

  // Navigate to a file, checking for unsaved changes first
  const navigateToFile = useCallback((target: NavigationTarget) => {
    if (!activeSessionId) return
    const isDirty = dirtyMapRef.current[activeSessionId] ?? false
    const result = resolveNavigation(target, activeSessionSelectedFilePath, isDirty)

    if (result.action === 'update-scroll' || result.action === 'navigate') {
      setOpenFileInDiffMode(result.state.openFileInDiffMode)
      setScrollToLine(result.state.scrollToLine)
      setSearchHighlight(result.state.searchHighlight)
      setDiffBaseRef(result.state.diffBaseRef)
      setDiffCurrentRef(result.state.diffCurrentRef)
      setDiffLabel(result.state.diffLabel)
    }
    if (result.action === 'navigate') {
      selectFile(activeSessionId, result.filePath)
    }
    if (result.action === 'pending') {
      setPendingNavigation(result.target)
    }
  }, [activeSessionId, activeSessionSelectedFilePath, selectFile])

  const handlePendingSave = useCallback(async () => {
    if (activeSessionId) {
      const saveFn = saveMapRef.current[activeSessionId]
      if (saveFn) {
        await saveFn()
      }
    }
    if (pendingNavigation && activeSessionId) {
      const { state, filePath } = applyPendingNavigation(pendingNavigation)
      setOpenFileInDiffMode(state.openFileInDiffMode)
      setScrollToLine(state.scrollToLine)
      setSearchHighlight(state.searchHighlight)
      setDiffBaseRef(state.diffBaseRef)
      setDiffCurrentRef(state.diffCurrentRef)
      setDiffLabel(state.diffLabel)
      selectFile(activeSessionId, filePath)
    }
    setPendingNavigation(null)
    if (activeSessionId) {
      dirtyMapRef.current[activeSessionId] = false
    }
  }, [pendingNavigation, activeSessionId, selectFile])

  const handlePendingDiscard = useCallback(() => {
    if (pendingNavigation && activeSessionId) {
      const { state, filePath } = applyPendingNavigation(pendingNavigation)
      setOpenFileInDiffMode(state.openFileInDiffMode)
      setScrollToLine(state.scrollToLine)
      setSearchHighlight(state.searchHighlight)
      setDiffBaseRef(state.diffBaseRef)
      setDiffCurrentRef(state.diffCurrentRef)
      setDiffLabel(state.diffLabel)
      if (activeSessionId) {
        dirtyMapRef.current[activeSessionId] = false
      }
      selectFile(activeSessionId, filePath)
    }
    setPendingNavigation(null)
  }, [pendingNavigation, activeSessionId, selectFile])

  const handlePendingCancel = useCallback(() => {
    setPendingNavigation(null)
  }, [])

  return {
    openFileInDiffMode,
    scrollToLine,
    searchHighlight,
    diffBaseRef,
    diffCurrentRef,
    diffLabel,
    pendingNavigation,
    navigateToFile,
    handlePendingSave,
    handlePendingDiscard,
    handlePendingCancel,
    setIsFileViewerDirty,
    registerSaveFunction,
    unregisterSaveFunction,
  }
}
