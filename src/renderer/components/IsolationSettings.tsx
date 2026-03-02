/**
 * Shared isolation settings UI for Docker container isolation and auto-approve.
 * Used by RepoSettingsEditor, CloneView, AddExistingRepoView, and RepoSettingsView.
 */
import type { DockerStatus } from '../../preload/index'

export function IsolationSettings({ isolated, dockerImage, skipApproval, dockerStatus, onIsolatedChange, onDockerImageChange, onSkipApprovalChange }: {
  isolated: boolean; dockerImage: string; skipApproval: boolean; dockerStatus: DockerStatus | null
  onIsolatedChange: (v: boolean) => void; onDockerImageChange: (v: string) => void; onSkipApprovalChange: (v: boolean) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isolated} onChange={(e) => onIsolatedChange(e.target.checked)} className="rounded border-border" />
          <span className="text-xs text-text-secondary">Run agent in isolated Docker container</span>
        </label>
        {isolated && (
          <div className="ml-6 space-y-2">
            <input
              type="text" value={dockerImage} onChange={(e) => onDockerImageChange(e.target.value)}
              placeholder="broomy/isolation:latest"
              className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary font-mono placeholder-text-secondary focus:outline-none focus:border-accent"
            />
            {dockerStatus && (
              <div className={`text-xs flex items-center gap-1.5 ${dockerStatus.available ? 'text-green-400' : 'text-yellow-400'}`}>
                <span className={`w-2 h-2 rounded-full ${dockerStatus.available ? 'bg-green-400' : 'bg-yellow-400'}`} />
                {dockerStatus.available ? 'Docker available' : (dockerStatus.error || 'Docker not available')}
                {!dockerStatus.available && dockerStatus.installUrl && (
                  <button onClick={() => void window.shell.openExternal(dockerStatus.installUrl!)} className="underline hover:text-text-primary transition-colors ml-1">Install</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={skipApproval} onChange={(e) => onSkipApprovalChange(e.target.checked)} className="rounded border-border" />
          <span className="text-xs text-text-secondary">Auto-approve agent commands</span>
        </label>
        {skipApproval && !isolated && (
          <p className="text-xs text-yellow-400 ml-6">
            Warning: Auto-approving without container isolation gives agents unrestricted access to your machine.
            Enable &quot;Run agent in isolated Docker container&quot; above for safe auto-approval.
          </p>
        )}
      </div>
    </>
  )
}
