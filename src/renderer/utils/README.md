# Utils

Pure utility functions and lightweight registries used across the Broomy renderer. These modules have no React dependencies (except `monacoProjectContext.ts` which uses the Monaco editor API) and are designed for easy unit testing.

## How It Connects

Components and stores import individual utilities as needed. The terminal utilities are used by `Terminal.tsx` and `Layout.tsx`. The git utilities are used by the Explorer component and session store. The file utilities are used by `FileViewer.tsx` and the explorer. The Monaco utility is loaded when a session's project root changes.

## Files

### Terminal

| File | Description |
|------|-------------|
| `stripAnsi.ts` | Strips ANSI escape sequences and control characters from terminal output using a comprehensive regex pipeline. |
| `terminalActivityDetector.ts` | Pure-function state machine for determining agent working/idle status from terminal output timing, with warmup and input-suppression windows. |
| `terminalBufferRegistry.ts` | Global Map-based registry that lets components outside `Terminal.tsx` read terminal buffer content by session ID. |

### Git

| File | Description |
|------|-------------|
| `branchStatus.ts` | Computes a `BranchStatus` enum (`in-progress`, `pushed`, `empty`, `open`, `merged`, `closed`) from git state and persisted PR info using a priority-based rule chain. |
| `explorerHelpers.ts` | Display helpers for git file statuses: human-readable labels, Tailwind color classes, badge letters, staged/unstaged splitting, and PR state badge styling. |
| `gitStatusNormalizer.ts` | Normalizes git status responses between the old flat-array format and the new object format with `files`, `ahead`, `behind`, `tracking`, and `current` fields. |

### File

| File | Description |
|------|-------------|
| `fileNavigation.ts` | State machine for file navigation: resolves whether to update scroll position, navigate immediately, or queue a pending navigation when the file viewer has unsaved changes. |
| `textDetection.ts` | Heuristic check for whether file content is text or binary, based on null-byte presence and printable character ratio. |
| `monacoProjectContext.ts` | Loads a project's TypeScript configuration and source files into Monaco's language service as extra libs, enabling cross-file IntelliSense. Manages disposable lifecycle. |

### Text

| File | Description |
|------|-------------|
| `slugify.ts` | Converts a GitHub issue (number + title) into a branch name by lowercasing, stripping special characters, and joining the first four words with hyphens. |
| `commonWords.ts` | List of ~1000 most common English words sorted by frequency. Used to filter noise words from branch names. |

### Agent Prompts

| File | Description |
|------|-------------|
| `prPromptBuilder.ts` | Builds the agent prompt for creating a pull request from the current branch, including diff analysis and PR template discovery. |

### UI Helpers

| File | Description |
|------|-------------|
| `focusHelpers.ts` | Utilities for programmatically focusing terminal inputs and explorer search, using store state to switch tabs before focusing. |
| `gitOperationProgress.ts` | Keeps a session's agent status as "working" during long-running git operations by periodically calling `updateAgentMonitor` to override idle detection. |
| `knownErrors.ts` | Maps raw error messages to human-friendly display messages using a priority-ordered regex rule chain. Falls back to the raw message if no rule matches. |

### Test Files

| File | Description |
|------|-------------|
| `branchStatus.test.ts` | Unit tests for branch status computation. |
| `explorerHelpers.test.ts` | Unit tests for explorer display helpers. |
| `fileNavigation.test.ts` | Unit tests for file navigation state machine. |
| `gitStatusNormalizer.test.ts` | Unit tests for git status normalization. |
| `slugify.test.ts` | Unit tests for issue-to-branch slugification. |
| `terminalActivityDetector.test.ts` | Unit tests for terminal activity detection. |
| `terminalBufferRegistry.test.ts` | Unit tests for the terminal buffer registry. |
| `textDetection.test.ts` | Unit tests for binary vs text detection. |
| `stripAnsi.test.ts` | Unit tests for ANSI stripping. |
| `monacoProjectContext.test.ts` | Unit tests for Monaco project context loading. |
| `prPromptBuilder.test.ts` | Unit tests for PR prompt builder. |
| `gitOperationProgress.test.ts` | Unit tests for git operation progress tracking. |
| `knownErrors.test.ts` | Unit tests for known error message mapping. |
