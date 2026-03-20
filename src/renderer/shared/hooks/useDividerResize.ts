/**
 * Manages drag-to-resize interactions for panel dividers including sidebar, explorer, file viewer, and tutorial panels.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import type { LayoutSizes, FileViewerPosition } from '../../store/sessions'

type DividerType = 'sidebar' | 'explorer' | 'fileViewer' | 'tutorial' | null

// Panel minimum/maximum size constants (px)
export const SIDEBAR_MIN = 150
export const SIDEBAR_MAX = 400
export const EXPLORER_MIN = 150
export const EXPLORER_MAX = 500
export const FILE_VIEWER_MIN_HEIGHT = 100
export const FILE_VIEWER_MIN_WIDTH = 200
export const TUTORIAL_MIN = 200
export const TUTORIAL_MAX = 500
export const AGENT_MIN_WIDTH = 200

interface UseDividerResizeParams {
  fileViewerPosition: FileViewerPosition
  sidebarWidth: number
  showSidebar: boolean
  showExplorer: boolean
  showTutorial: boolean
  explorerWidth: number
  tutorialWidth: number
  onSidebarWidthChange: (width: number) => void
  onLayoutSizeChange: (key: keyof LayoutSizes, value: number) => void
}

export function useDividerResize({
  fileViewerPosition,
  sidebarWidth,
  showSidebar,
  showExplorer,
  showTutorial,
  explorerWidth,
  tutorialWidth,
  onSidebarWidthChange,
  onLayoutSizeChange,
}: UseDividerResizeParams) {
  const [draggingDivider, setDraggingDivider] = useState<DividerType>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mainContentRef = useRef<HTMLDivElement>(null)

  // Handle drag for resizing panels
  const handleMouseDown = useCallback((divider: DividerType) => (e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingDivider(divider)
  }, [])

  useEffect(() => {
    if (!draggingDivider) return

    const handleMouseMove = (e: MouseEvent) => {
      const mainRect = mainContentRef.current?.getBoundingClientRect()
      const centerRect = containerRef.current?.getBoundingClientRect()

      // Calculate how much width is consumed by panels other than the one being dragged,
      // so we can ensure the agent terminal area keeps its minimum width.
      const calcAgentAvailable = (mainWidth: number, newPanelWidth: number, panelKey: 'sidebar' | 'explorer' | 'tutorial') => {
        let used = newPanelWidth
        if (panelKey !== 'sidebar' && showSidebar) used += sidebarWidth
        if (panelKey !== 'explorer' && showExplorer) used += explorerWidth
        if (panelKey !== 'tutorial' && showTutorial) used += tutorialWidth
        return mainWidth - used
      }

      switch (draggingDivider) {
        case 'sidebar': {
          if (!mainRect) return
          let newWidth = e.clientX - mainRect.left
          newWidth = Math.max(SIDEBAR_MIN, Math.min(newWidth, SIDEBAR_MAX))
          // Clamp to protect agent minimum width
          const agentAvail = calcAgentAvailable(mainRect.width, newWidth, 'sidebar')
          if (agentAvail < AGENT_MIN_WIDTH) {
            newWidth = Math.max(SIDEBAR_MIN, newWidth - (AGENT_MIN_WIDTH - agentAvail))
          }
          onSidebarWidthChange(newWidth)
          break
        }
        case 'explorer': {
          if (!mainRect) return
          const offset = showSidebar ? sidebarWidth : 0
          let newWidth = e.clientX - mainRect.left - offset
          newWidth = Math.max(EXPLORER_MIN, Math.min(newWidth, EXPLORER_MAX))
          const agentAvail = calcAgentAvailable(mainRect.width, newWidth, 'explorer')
          if (agentAvail < AGENT_MIN_WIDTH) {
            newWidth = Math.max(EXPLORER_MIN, newWidth - (AGENT_MIN_WIDTH - agentAvail))
          }
          onLayoutSizeChange('explorerWidth', newWidth)
          break
        }
        case 'fileViewer': {
          if (!centerRect) return
          if (fileViewerPosition === 'top') {
            const newHeight = e.clientY - centerRect.top
            const maxHeight = centerRect.height - FILE_VIEWER_MIN_HEIGHT
            onLayoutSizeChange('fileViewerSize', Math.max(FILE_VIEWER_MIN_HEIGHT, Math.min(newHeight, maxHeight)))
          } else {
            const newWidth = e.clientX - centerRect.left
            const maxWidth = centerRect.width - AGENT_MIN_WIDTH
            onLayoutSizeChange('fileViewerSize', Math.max(FILE_VIEWER_MIN_WIDTH, Math.min(newWidth, maxWidth)))
          }
          break
        }
        case 'tutorial': {
          if (!mainRect) return
          let newWidth = mainRect.right - e.clientX
          newWidth = Math.max(TUTORIAL_MIN, Math.min(newWidth, TUTORIAL_MAX))
          const agentAvail = calcAgentAvailable(mainRect.width, newWidth, 'tutorial')
          if (agentAvail < AGENT_MIN_WIDTH) {
            newWidth = Math.max(TUTORIAL_MIN, newWidth - (AGENT_MIN_WIDTH - agentAvail))
          }
          onLayoutSizeChange('tutorialPanelWidth', newWidth)
          break
        }
      }
    }

    const handleMouseUp = () => {
      setDraggingDivider(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingDivider, fileViewerPosition, sidebarWidth, showSidebar, showExplorer, showTutorial, explorerWidth, tutorialWidth, onSidebarWidthChange, onLayoutSizeChange])

  return {
    draggingDivider,
    containerRef,
    mainContentRef,
    handleMouseDown,
  }
}

export type { DividerType }
