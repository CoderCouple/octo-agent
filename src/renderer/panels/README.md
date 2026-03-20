# Panels

Each subdirectory is a self-contained UI panel that owns its components, hooks, and utilities.

## Structure

- `system/` -- Panel registry infrastructure (types, registry, context)
- `sidebar/` -- Session list sidebar
- `explorer/` -- File tree, source control, search, recent files, review tabs
- `fileViewer/` -- Monaco editor, image viewer, markdown viewer, diff views
- `agent/` -- Terminal emulator for AI agent and user shells
- `settings/` -- Agent and repository configuration
- `tutorial/` -- Getting-started guide panel

## Conventions

1. **Self-wiring.** Each panel exports a `*Panel` component that subscribes to stores internally. The top-level App just renders `<ExplorerPanel />` etc. -- it does not thread props.

2. **Own your code.** If a component, hook, or utility is only used by one panel, it lives in that panel's folder.

3. **Standard tab interface.** Explorer tabs each implement `ExplorerTabDefinition` from `explorer/types.ts`.

4. **Never remount agents.** The agent panel renders all session terminals in a stack with CSS visibility toggling. React trees are never unmounted on session switch.
