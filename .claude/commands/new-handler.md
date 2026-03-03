Scaffold a new IPC handler with all required wiring.

## Arguments

$ARGUMENTS should be in the format `namespace:action` (e.g., `git:cherryPick` or `docker:build`). Optionally include a brief description after the name (e.g., `git:cherryPick Cherry-pick a commit onto the current branch`).

## Steps

1. **Parse the arguments.** Extract the namespace (e.g., `git`), action name (e.g., `cherryPick`), and optional description from $ARGUMENTS.

2. **Find the right handler file.** Look in `src/main/handlers/` for an existing file matching the namespace. For example, `git:cherryPick` would go in one of the `git*.ts` files. If no matching file exists, create a new handler module following the pattern in `docs/ipc-guide.md`.

3. **Read existing patterns.** Read the target handler file and a few neighboring handlers to understand the local conventions (parameter types, error handling shape, mock data style).

4. **Add the handler function.** Add a new async function following the established pattern:
   - Accept `ctx: HandlerContext` as the first parameter
   - Check `ctx.isE2ETest` first and return deterministic mock data
   - Wrap real logic in try/catch, returning `{ success: false, error: String(error) }` on failure
   - Register via the module's `register()` function

5. **Add preload wiring.** Find the matching API file in `src/preload/apis/` (e.g., `git.ts` for git handlers). Add:
   - The method to the API type definition
   - The implementation that calls `ipcRenderer.invoke('namespace:action', ...args)`

6. **Update the Window type.** If you created a new namespace (not extending an existing one), add it to the `Window` interface declaration in `src/preload/index.ts`.

7. **Add the unit test mock.** In `src/test/setup.ts`, add a mock for the new method in the appropriate mock object with a sensible default return value.

8. **Verify.** Run `pnpm typecheck` to confirm everything wires up correctly.

## Rules

- Follow the exact patterns from the existing handler file — don't introduce new conventions.
- The E2E mock data should be realistic but deterministic (no random values, no timestamps).
- Error returns must use `String(error)` for safe IPC serialization.
- If the namespace is new, follow the full "new namespace" pattern from `docs/ipc-guide.md` (new handler file, new preload API file, new Window type entry).
