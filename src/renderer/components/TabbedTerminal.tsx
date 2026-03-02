/**
 * Tabbed container for agent and user terminal instances within a session.
 *
 * The first tab is always the "Agent" tab — it runs the configured AI agent command
 * and cannot be closed, renamed, or reordered. Additional user terminal tabs can be
 * added, closed, renamed, drag-to-reordered, etc. Tab state (names, order, active tab)
 * is persisted in the session store. Context menu provides rename, close, close-others,
 * and close-to-right actions for user tabs.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import Terminal from './Terminal'
import TerminalTabBar from './TerminalTabBar'
import DockerInfoPanel from './DockerInfoPanel'
import PanelErrorBoundary from './PanelErrorBoundary'
import { useSessionStore } from '../store/sessions'
import type { TerminalTab } from '../store/sessions'

const AGENT_TAB_ID = '__agent__'

/** Drag-and-drop state and handlers for terminal tab reordering. */
function useTabDragDrop(sessionId: string, userTabs: TerminalTab[], reorderTerminalTabs: (sid: string, tabs: TerminalTab[]) => void) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    if (tabId === AGENT_TAB_ID) { e.preventDefault(); return }
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedTabId(null)
    setDragOverTabId(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (tabId === AGENT_TAB_ID) return
    if (tabId !== draggedTabId) {
      setDragOverTabId(tabId)
    }
  }, [draggedTabId])

  const handleDragLeave = useCallback(() => {
    setDragOverTabId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    setDragOverTabId(null)
    if (targetTabId === AGENT_TAB_ID) return
    if (!draggedTabId || draggedTabId === targetTabId) return
    const draggedIndex = userTabs.findIndex((t) => t.id === draggedTabId)
    const targetIndex = userTabs.findIndex((t) => t.id === targetTabId)
    if (draggedIndex === -1 || targetIndex === -1) return
    const newTabs = [...userTabs]
    const [draggedTab] = newTabs.splice(draggedIndex, 1)
    newTabs.splice(targetIndex, 0, draggedTab)
    reorderTerminalTabs(sessionId, newTabs)
    setDraggedTabId(null)
  }, [sessionId, draggedTabId, userTabs, reorderTerminalTabs])

  return { dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop }
}

/** Dropdown menu for choosing between local and container terminal tabs. */
function AddTabMenu({ onAddLocal, onAddContainer, menuRef }: {
  onAddLocal: () => void
  onAddContainer: () => void
  menuRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-0.5 bg-bg-secondary border border-border rounded shadow-lg z-50 min-w-36"
    >
      <button
        className="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        onClick={onAddLocal}
      >
        Local Terminal
      </button>
      <button
        className="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        onClick={onAddContainer}
      >
        Container Terminal
      </button>
    </div>
  )
}

const DOCKER_TAB_ID = '__docker__'

interface TabbedTerminalProps {
  sessionId: string
  cwd: string
  isActive: boolean
  agentCommand?: string
  agentEnv?: Record<string, string>
  isolation?: { isolated: boolean; dockerImage?: string; repoRootDir?: string }
}

export default function TabbedTerminal({ sessionId, cwd, isActive, agentCommand, agentEnv, isolation }: TabbedTerminalProps) {
  // Targeted selector: only re-render when this session's terminalTabs change
  const terminalTabs = useSessionStore((state) => {
    const session = state.sessions.find((s) => s.id === sessionId)
    return session?.terminalTabs
  })
  const addTerminalTab = useSessionStore((state) => state.addTerminalTab)
  const removeTerminalTab = useSessionStore((state) => state.removeTerminalTab)
  const renameTerminalTab = useSessionStore((state) => state.renameTerminalTab)
  const reorderTerminalTabs = useSessionStore((state) => state.reorderTerminalTabs)
  const setActiveTerminalTab = useSessionStore((state) => state.setActiveTerminalTab)
  const closeOtherTerminalTabs = useSessionStore((state) => state.closeOtherTerminalTabs)
  const closeTerminalTabsToRight = useSessionStore((state) => state.closeTerminalTabsToRight)

  const userTabs = terminalTabs?.tabs ?? []
  const storedActiveTabId = terminalTabs?.activeTabId ?? null

  // Build the combined tab list: Agent tab first, then optional Docker tab, then user tabs
  const agentTab = { id: AGENT_TAB_ID, name: 'Agent' }
  const dockerTab = isolation?.isolated ? { id: DOCKER_TAB_ID, name: '(docker)' } : null
  const allTabs = [agentTab, ...(dockerTab ? [dockerTab] : []), ...userTabs]
  const activeTabId = storedActiveTabId ?? AGENT_TAB_ID

  // Check if the agent command is installed
  const [agentInstalled, setAgentInstalled] = useState(true) // default true to avoid flash
  useEffect(() => {
    if (!agentCommand) return
    let cancelled = false
    window.agents.isInstalled(agentCommand).then((installed) => {
      if (!cancelled) setAgentInstalled(installed)
    }).catch(() => {
      // If the check fails, assume installed to avoid false positives
    })
    return () => { cancelled = true }
  }, [agentCommand])

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  const editInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  const { dragOverTabId, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop } =
    useTabDragDrop(sessionId, userTabs, reorderTerminalTabs)

  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Close dropdown/add-menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false)
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setShowAddMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Detect tab overflow
  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return
    const checkOverflow = () => setIsOverflowing(container.scrollWidth > container.clientWidth)
    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(container)
    return () => observer.disconnect()
  }, [allTabs.length])

  // Focus edit input when editing
  useEffect(() => { if (editingTabId && editInputRef.current) { editInputRef.current.focus(); editInputRef.current.select() } }, [editingTabId])

  const handleAddTab = useCallback(() => { if (isolation?.isolated) { setShowAddMenu(prev => !prev) } else { addTerminalTab(sessionId) } }, [sessionId, addTerminalTab, isolation])
  const handleAddLocalTab = useCallback(() => { addTerminalTab(sessionId); setShowAddMenu(false) }, [sessionId, addTerminalTab])
  const handleAddContainerTab = useCallback(() => { addTerminalTab(sessionId, undefined, true); setShowAddMenu(false) }, [sessionId, addTerminalTab])
  const handleTabClick = useCallback((tabId: string) => { setActiveTerminalTab(sessionId, tabId) }, [sessionId, setActiveTerminalTab])

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => { e.stopPropagation(); if (tabId !== AGENT_TAB_ID && tabId !== DOCKER_TAB_ID) removeTerminalTab(sessionId, tabId) }, [sessionId, removeTerminalTab])

  const handleContextMenu = useCallback(async (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    if (tabId === AGENT_TAB_ID || tabId === DOCKER_TAB_ID) return
    const tabIndex = userTabs.findIndex((t) => t.id === tabId)
    const hasTabsToRight = tabIndex !== -1 && tabIndex < userTabs.length - 1
    const action = await window.menu.popup([
      { id: 'rename', label: 'Rename' },
      { id: 'close', label: 'Close', enabled: true },
      { id: 'sep', label: '', type: 'separator' },
      { id: 'close-others', label: 'Close Others', enabled: userTabs.length > 1 },
      { id: 'close-right', label: 'Close to the Right', enabled: hasTabsToRight },
    ])
    switch (action) {
      case 'rename': {
        const tab = userTabs.find((t) => t.id === tabId)
        if (tab) { setEditingTabId(tabId); setEditingName(tab.name) }
        break
      }
      case 'close': removeTerminalTab(sessionId, tabId); break
      case 'close-others': closeOtherTerminalTabs(sessionId, tabId); break
      case 'close-right': closeTerminalTabsToRight(sessionId, tabId); break
    }
  }, [sessionId, userTabs, removeTerminalTab, closeOtherTerminalTabs, closeTerminalTabsToRight])

  const handleRenameSubmit = useCallback(() => {
    if (editingTabId && editingName.trim()) renameTerminalTab(sessionId, editingTabId, editingName.trim())
    setEditingTabId(null); setEditingName('')
  }, [sessionId, editingTabId, editingName, renameTerminalTab])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit()
    else if (e.key === 'Escape') { setEditingTabId(null); setEditingName('') }
  }, [handleRenameSubmit])

  const handleDropdownSelect = useCallback((tabId: string) => { setActiveTerminalTab(sessionId, tabId); setShowDropdown(false) }, [sessionId, setActiveTerminalTab])
  const handleDoubleClick = useCallback((tabId: string) => { if (tabId === AGENT_TAB_ID) return; const tab = userTabs.find((t) => t.id === tabId); if (tab) { setEditingTabId(tabId); setEditingName(tab.name) } }, [userTabs])

  return (
    <div className="h-full w-full flex flex-col">
      {/* Tab bar */}
      <div className="relative">
        <TerminalTabBar
          tabs={allTabs}
          activeTabId={activeTabId}
          editingTabId={editingTabId}
          editingName={editingName}
          dragOverTabId={dragOverTabId}
          isOverflowing={isOverflowing}
          showDropdown={showDropdown}
          agentTabId={AGENT_TAB_ID}
          handleTabClick={handleTabClick}
          handleCloseTab={handleCloseTab}
          handleContextMenu={handleContextMenu}
          handleDoubleClick={handleDoubleClick}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
          handleRenameSubmit={handleRenameSubmit}
          handleRenameKeyDown={handleRenameKeyDown}
          handleDropdownSelect={handleDropdownSelect}
          handleAddTab={handleAddTab}
          setEditingName={setEditingName}
          setShowDropdown={setShowDropdown}
          editInputRef={editInputRef}
          dropdownRef={dropdownRef}
          tabsContainerRef={tabsContainerRef}
        />

        {showAddMenu && (
          <AddTabMenu onAddLocal={handleAddLocalTab} onAddContainer={handleAddContainerTab} menuRef={addMenuRef} />
        )}
      </div>

      {/* Terminal container */}
      <div className="flex-1 relative min-h-0">
        {/* Agent terminal — always rendered */}
        <div
          className={`absolute inset-0 ${activeTabId === AGENT_TAB_ID ? '' : 'invisible pointer-events-none'}`}
        >
          <PanelErrorBoundary name="Agent Terminal">
            <Terminal
              sessionId={sessionId}
              cwd={cwd}
              command={agentCommand}
              env={agentEnv}
              isAgentTerminal={!!agentCommand}
              isActive={isActive && activeTabId === AGENT_TAB_ID}
              agentNotInstalled={!!agentCommand && !agentInstalled}
              isolated={isolation?.isolated}
              dockerImage={isolation?.dockerImage}
              repoRootDir={isolation?.repoRootDir}
            />
          </PanelErrorBoundary>
        </div>

        {/* Docker info panel */}
        {isolation?.isolated && (
          <div
            className={`absolute inset-0 ${activeTabId === DOCKER_TAB_ID ? '' : 'invisible pointer-events-none'}`}
          >
            <DockerInfoPanel repoDir={isolation?.repoRootDir || cwd} />
          </div>
        )}

        {/* User terminals */}
        {userTabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTabId ? '' : 'invisible pointer-events-none'}`}
          >
            <PanelErrorBoundary name={`Terminal ${tab.name}`}>
              <Terminal
                sessionId={`user-${sessionId}-${tab.id}`}
                cwd={cwd}
                isActive={isActive && tab.id === activeTabId}
                isolated={tab.isolated}
                dockerImage={tab.isolated ? isolation?.dockerImage : undefined}
                repoRootDir={tab.isolated ? isolation?.repoRootDir : undefined}
              />
            </PanelErrorBoundary>
          </div>
        ))}
      </div>
    </div>
  )
}
