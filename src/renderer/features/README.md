# Features

Cross-cutting domain logic that spans multiple panels.

## Structure

- `git/` -- Git integration: branch status computation, status normalization, explorer helpers, git polling, plan detection
- `sessions/` -- Session lifecycle: new session dialog wizard, session creation/restoration
- `profiles/` -- Multi-window profile management: profile chip, profile dropdown
- `commands/` -- Commands configuration: config loading, condition evaluation, action execution, template variable resolution

## Conventions

1. **Feature, not panel.** Code goes here when it serves 2+ panels but isn't generic enough for `shared/`. Git status computation is used by explorer, sidebar, and App.tsx -- it's a feature. A pure `slugify()` function is generic -- it's shared.

2. **Own your hooks.** Each feature can have a `hooks/` subdirectory for React hooks that encapsulate the feature's state management.

3. **No UI coupling.** Features should export data and logic, not React components, where possible. The session wizard is an exception because it's a self-contained multi-step flow.
