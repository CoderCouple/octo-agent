/**
 * Persona card stub: shows session name + agent type.
 * Full form in Phase 7: agent type picker, persona, repo dir, initial prompt.
 */
export function PersonaCard({ name, agentType }: { name: string; agentType?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
        <span className="text-accent text-sm font-medium">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">{name}</div>
        <div className="text-xs text-text-secondary">{agentType || 'claude-code'}</div>
      </div>
    </div>
  )
}
