# File Viewer Panel

Plugin-based file content viewer supporting Monaco editor, images, markdown, and webviews.

## What it does

Loads file content via IPC, determines the best viewer plugin using the `viewers/` registry, and renders it with a toolbar for switching viewers and toggling diff mode. Supports latest vs. diff view, inline editing with dirty-state tracking, and scroll-to-line navigation.

## Viewers (plugin system)

Each viewer in `viewers/` implements the `FileViewerPlugin` interface:

- `MonacoViewer` -- Code editor (fallback for text files)
- `ImageViewer` -- Image display
- `MarkdownViewer` -- Rendered markdown with GFM support
- `WebviewViewer` -- URL-based webview (highest priority for URLs)
- `MonacoDiffViewer` -- Side-by-side diff view
- `ImageDiffViewer` -- Image comparison view

### Adding a new viewer

1. Create a file in `viewers/` implementing `FileViewerPlugin`
2. Add it to the `viewers` array in `viewers/index.ts`
3. The registry automatically picks the highest-priority viewer that can handle each file

## Hooks

- `useFileViewer` -- Orchestrates file loading, diff, watching, and viewer selection
- `useFileLoading` -- File content loading via IPC
- `useFileDiff` -- Git diff content loading
- `useFileWatcher` -- File change detection for reload prompts
- `useFileNavigation` -- Navigation with unsaved-changes guards
- `useMonacoComments` -- Inline review comment decorations

## Store dependencies

- `store/sessions` -- Selected file path, file viewer position, dirty state
