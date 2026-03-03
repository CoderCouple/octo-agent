Scaffold a new panel in the panel system.

## Arguments

$ARGUMENTS should include a panel name and position. Format: `<PanelName> <position>` (e.g., `Metrics right` or `History center-left`). If position is omitted, default to `right`.

Valid positions: `sidebar`, `left`, `center-top`, `center-left`, `center-main`, `center-bottom`, `right`, `overlay`.

## Steps

1. **Parse arguments.** Extract the panel name (e.g., `Metrics`) and position from $ARGUMENTS. Derive the panel ID in SCREAMING_SNAKE_CASE (e.g., `METRICS`) and the camelCase key (e.g., `metrics`).

2. **Read existing panel definitions.** Read `src/renderer/panels/types.ts` and `src/renderer/panels/builtinPanels.tsx` to understand the current setup.

3. **Add the panel ID** to `PANEL_IDS` in `src/renderer/panels/types.ts`:
   ```ts
   export const PANEL_IDS = {
     // ... existing
     MY_PANEL: 'myPanel',
   } as const
   ```

4. **Create the panel component.** Create a new component file at `src/renderer/components/<PanelName>.tsx` with a basic structure. Keep it minimal — just a container with a header and placeholder content. Follow the patterns of existing panel components.

5. **Add the panel definition** in `src/renderer/panels/builtinPanels.tsx`:
   - Use an appropriate icon (check what Lucide icons are already imported, or add one)
   - Set `defaultVisible: false`
   - Set `defaultInToolbar: true`
   - Add `resizable: true` with sensible `minSize`/`maxSize` if the position supports resizing
   - Set `isGlobal` only if the panel should share state across sessions

6. **Add rendering in Layout.** Read `src/renderer/components/Layout.tsx` and add the panel rendering in the appropriate position region. Follow the pattern used by other panels in the same position.

7. **Set default visibility.** In `src/renderer/store/sessionCoreActions.ts`:
   - Add to `DEFAULT_PANEL_VISIBILITY` if per-session
   - Or add to `DEFAULT_GLOBAL_PANEL_VISIBILITY` if global

8. **Verify.** Run `pnpm typecheck` to confirm everything compiles. Run `pnpm lint` to check for issues.

## Rules

- Follow the patterns in `docs/panel-system.md` exactly.
- Reference panels by `PANEL_IDS` constants, never raw strings.
- Don't add complex logic to the initial component — just get the panel plumbed in. The user will fill in the real content.
- If adding a resizable panel, include the drag divider in Layout.tsx following the pattern of existing resizable panels.
