# Shared

Components, hooks, and utilities used by two or more panels or features.

## Conventions

1. **Graduation rule.** Code starts in the panel or feature that owns it. It moves here only when a second consumer appears.

2. **No business logic.** Shared code should be generic UI building blocks (error boundaries, banners, modals) or pure utility functions. Domain-specific logic belongs in the panel or feature it serves.

3. **Flat structure.** Each subdirectory (components, hooks, utils) is flat -- no nesting. If shared code gets complex enough to need subdirectories, it probably deserves to be a feature.

## Subdirectories

- `components/` -- Reusable UI components (ErrorBoundary, PanelErrorBoundary, ErrorBanner, ActionButtons, modals)
- `hooks/` -- Reusable React hooks (layout keyboard, divider resize, app callbacks)
- `utils/` -- Pure utility functions (file navigation, focus helpers, slug generation, text detection)
