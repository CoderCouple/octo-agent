import type { ExplorerProps } from './types'
import { FileTreeIcon, SourceControlIcon, SearchIcon, RecentIcon } from './icons'
import { FileTree } from './FileTree'
import { SourceControl } from './SourceControl'
import { SearchPanel } from './SearchPanel'
import { RecentFiles } from './RecentFiles'

export default function Explorer({
  directory,
  onFileSelect,
  selectedFilePath,
  gitStatus = [],
  syncStatus,
  filter,
  onFilterChange,
  onGitStatusRefresh,
  recentFiles = [],
  sessionId: _sessionId,
  pushedToMainAt,
  pushedToMainCommit,
  onRecordPushToMain,
  onClearPushToMain,
  planFilePath,
  branchStatus,
  onUpdatePrState,
  repoId,
  agentPtyId,
  onOpenReview,
  issueNumber,
  issuePlanExists,
}: ExplorerProps) {
  if (!directory) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Select a session to view files
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Explorer</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onFilterChange('files')}
            className={`p-1 rounded transition-colors ${
              filter === 'files'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Files"
          >
            <FileTreeIcon />
          </button>
          <button
            onClick={() => onFilterChange('source-control')}
            className={`p-1 rounded transition-colors ${
              filter === 'source-control'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Source Control"
          >
            <SourceControlIcon />
          </button>
          <button
            onClick={() => onFilterChange('search')}
            className={`p-1 rounded transition-colors ${
              filter === 'search'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Search"
          >
            <SearchIcon />
          </button>
          <button
            onClick={() => onFilterChange('recent')}
            className={`p-1 rounded transition-colors ${
              filter === 'recent'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
            title="Recent Files"
          >
            <RecentIcon />
          </button>
        </div>
      </div>

      {/* Plan chip - shown at top when plan file is detected */}
      {planFilePath && (
        <div className="px-3 py-1.5 border-b border-border">
          <button
            onClick={() => onFileSelect?.({ filePath: planFilePath, openInDiffMode: false })}
            className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              selectedFilePath === planFilePath
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-accent/20'
            }`}
            title={planFilePath}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            Plan
          </button>
        </div>
      )}

      {/* Issue plan chip */}
      {issuePlanExists ? (
        <div className="px-3 py-1.5 border-b border-border">
          <button
            onClick={() => onFileSelect?.({ filePath: `${directory}/.broomy/plan.md`, openInDiffMode: false })}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-accent/20"
            title="Show issue plan"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            Show plan
          </button>
        </div>
      ) : issueNumber ? (
        <div className="px-3 py-1.5 border-b border-border">
          <button
            onClick={() => {
              if (!agentPtyId) return
              const command = `Read issue #${issueNumber} using \`gh issue view ${issueNumber}\`. Before doing anything, ask me any questions about the issue to clarify requirements and resolve ambiguities. Then write a plan to .broomy/plan.md that includes: a detailed description of what you will do, and any open questions or assumptions.`
              void window.pty.write(agentPtyId, command)
            }}
            disabled={!agentPtyId}
            className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              agentPtyId
                ? 'bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-accent/20'
                : 'bg-bg-tertiary text-text-secondary/50 cursor-not-allowed'
            }`}
            title={agentPtyId ? 'Ask agent to plan this issue' : 'No agent terminal available'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Ask agent to plan this issue
          </button>
        </div>
      ) : null}

      {/* Tab content - scrollable area below pinned toolbar */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filter === 'files' && (
          <FileTree
            directory={directory}
            onFileSelect={onFileSelect}
            selectedFilePath={selectedFilePath}
            gitStatus={gitStatus}
          />
        )}

        {filter === 'source-control' && (
          <SourceControl
            directory={directory}
            gitStatus={gitStatus}
            syncStatus={syncStatus}
            onFileSelect={onFileSelect}
            onGitStatusRefresh={onGitStatusRefresh}
            branchStatus={branchStatus}
            repoId={repoId}
            agentPtyId={agentPtyId}
            onUpdatePrState={onUpdatePrState}
            pushedToMainAt={pushedToMainAt}
            pushedToMainCommit={pushedToMainCommit}
            onRecordPushToMain={onRecordPushToMain}
            onClearPushToMain={onClearPushToMain}
            onOpenReview={onOpenReview}
          />
        )}

        {filter === 'search' && (
          <SearchPanel
            directory={directory}
            onFileSelect={onFileSelect}
          />
        )}

        {filter === 'recent' && (
          <RecentFiles
            recentFiles={recentFiles}
            onFileSelect={onFileSelect}
            selectedFilePath={selectedFilePath}
            directory={directory}
          />
        )}
      </div>
    </div>
  )
}
