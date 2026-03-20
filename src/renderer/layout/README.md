# Layout

The application's top-level layout shell that orchestrates panel rendering.

## What it does

Renders a title bar with toolbar buttons, then a horizontal arrangement of sidebar, explorer, center content area, and tutorial panel. Each boundary between panels is a draggable divider that persists layout sizes. Keyboard shortcuts (Cmd+1-6) toggle panels, and Ctrl+Tab cycles focus.

## Files

- `Layout.tsx` -- Main layout component with drag-to-resize panel regions
- `LayoutContentArea.tsx` -- Center area that stacks file viewer and terminal panels
- `LayoutToolbar.tsx` -- Title bar with panel toggle buttons and profile chip
- `Divider.tsx` -- Draggable divider between panels

## Dependencies

- `panels/system/` -- Panel registry for toolbar button rendering
- `shared/hooks/` -- Layout keyboard, divider resize, and layout clamp hooks
- `shared/components/PanelErrorBoundary` -- Error isolation per panel
- `store/sessions` -- Layout sizes and panel visibility types
