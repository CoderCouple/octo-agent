# Panel System Infrastructure

Core infrastructure for the panel registry, type definitions, and React context.

## What it does

Defines the panel abstraction used throughout OctoAgent. Each panel (sidebar, explorer, file viewer, agent terminal, settings, tutorial) is registered here with its ID, icon, position, and default visibility. The React context makes the registry and toolbar configuration available to all components.

## Public interface

- `PanelDefinition` -- interface every panel conforms to
- `PANEL_IDS` -- constants for type-safe panel references
- `PanelProvider` -- React context provider (wraps the app)
- `usePanelContext()` -- access registry, toolbar panels, shortcut keys
- `usePanelVisibility(panelId)` -- check if a panel is visible
- `usePanelToggle(panelId)` -- get a toggle callback for a panel

## Panel positions

| Position | Location | Example panels |
|----------|----------|----------------|
| `sidebar` | Left edge, always-visible strip | Sessions list |
| `left` | Left of center content | Explorer |
| `center-top` | Above the terminal area | File viewer (top mode) |
| `center-left` | Left of the terminal area | File viewer (left mode) |
| `center-main` | Main terminal area | Agent terminal |
| `center-bottom` | Below main terminal | User terminal |
| `right` | Right edge | Tutorial/guide |
| `overlay` | Replaces center content entirely | Settings |

## Store dependencies

None. The panel system is a pure registry -- it does not read from or write to Zustand stores. Panel visibility state lives in the session store.

## Adding a new panel

1. Add an ID to `PANEL_IDS` in `types.ts`
2. Add a `PanelDefinition` entry in `builtinPanels.tsx`
3. Create the panel's folder under `panels/`
4. Wire the panel's component into `App.tsx`'s panel map
