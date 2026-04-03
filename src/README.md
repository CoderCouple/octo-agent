# Source

All application source code, organized by Electron process boundary.

## How It Connects

OctoAgent is an Electron app with three process contexts. The **main** process runs Node.js and owns all privileged operations (PTY, git, filesystem, config). The **renderer** process runs the React UI in a browser context. The **preload** layer bridges the two — it defines typed API objects and exposes them on `window.*` via Electron's context bridge, so the renderer never touches Node.js directly. The **test** directory provides Vitest setup files that mock the preload APIs for unit testing without an Electron process.

## Directories

| Directory | Description |
|-----------|-------------|
| `main/` | Main (Node.js) process — IPC handlers for PTY, git, GitHub CLI, filesystem, config persistence, auto-updates, and window lifecycle. |
| `preload/` | Preload script — context bridge wiring, typed API definitions, and the `Window` interface augmentation that makes `window.*` APIs available throughout the renderer. |
| `renderer/` | Renderer (React) process — components, Zustand stores, custom hooks, utility modules, the panel system, and file viewer plugins. All styling via Tailwind CSS. |
| `test/` | Vitest setup files that mock all `window.*` APIs so renderer code can be unit-tested without Electron. |
