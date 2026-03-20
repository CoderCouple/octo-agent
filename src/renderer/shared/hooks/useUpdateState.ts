/**
 * Tracks application update state (idle, available, downloading, ready) and listens for update events from the main process.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type { UpdateCheckResult } from '../../../preload/apis/shell'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready' }

type UpdateStore = {
  updateState: UpdateState
  currentVersion: string | null
  popoverOpen: boolean
  setUpdateState: (state: UpdateState) => void
  setCurrentVersion: (v: string) => void
  setPopoverOpen: (open: boolean) => void
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  updateState: { status: 'idle' },
  currentVersion: null,
  popoverOpen: false,
  setUpdateState: (state) => set({ updateState: state }),
  setCurrentVersion: (v) => set({ currentVersion: v }),
  setPopoverOpen: (open) => set({ popoverOpen: open }),
}))

let initialized = false

export function useUpdateState() {
  const {
    updateState, currentVersion, popoverOpen,
    setUpdateState, setCurrentVersion, setPopoverOpen,
  } = useUpdateStore()

  useEffect(() => {
    if (initialized) return
    initialized = true

    void window.app.getVersion().then(setCurrentVersion)

    void window.update.checkForUpdates().then((result: UpdateCheckResult) => {
      if (result.updateAvailable && result.version) {
        setUpdateState({
          status: 'available',
          version: result.version,
        })
      }
    })
  }, [setCurrentVersion, setUpdateState])

  // Listen for menu-triggered update available event
  useEffect(() => {
    const remove = window.update.onUpdateAvailable((info) => {
      setUpdateState({
        status: 'available',
        version: info.version,
      })
      setPopoverOpen(true)
    })
    return remove
  }, [setUpdateState, setPopoverOpen])

  // Listen for download progress and completion
  useEffect(() => {
    const removeProgress = window.update.onDownloadProgress((percent) => {
      setUpdateState({ status: 'downloading', percent })
    })
    const removeDownloaded = window.update.onUpdateDownloaded(() => {
      setUpdateState({ status: 'ready' })
    })
    return () => {
      removeProgress()
      removeDownloaded()
    }
  }, [setUpdateState])

  const handleDownload = async () => {
    setUpdateState({ status: 'downloading', percent: 0 })
    await window.update.downloadUpdate()
  }

  const handleInstall = () => {
    window.update.installUpdate()
  }

  return {
    updateState,
    currentVersion,
    popoverOpen,
    setPopoverOpen,
    handleDownload,
    handleInstall,
  }
}

/** Reset module-level state for testing */
export function _resetForTesting() {
  initialized = false
  useUpdateStore.setState({
    updateState: { status: 'idle' },
    currentVersion: null,
    popoverOpen: false,
  })
}
