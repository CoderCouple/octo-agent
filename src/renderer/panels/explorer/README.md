# Explorer Panel

Tabbed panel for browsing files, source control, search, recent files, and review.

## What it does

Renders a tab bar with five tabs, each implemented as a separate module in `tabs/`. The active tab's component is rendered below the tab bar. Each tab implements its own data fetching and UI.

## Tabs

- `tabs/files/` -- File tree browser with expand/collapse and file selection
- `tabs/source-control/` -- Git status, branch management, commit, push/pull, PR banners
- `tabs/search/` -- File content search across the repository
- `tabs/recent/` -- Recently opened files list
- `tabs/review/` -- Markdown-based code review panel (.octoagent/review.md)

## Adding a new tab

1. Create a folder under `tabs/` with your tab component
2. Add an icon to `icons.tsx`
3. Import and wire the tab in `ExplorerPanel.tsx`

## Store dependencies

- `store/sessions` -- Active session, explorer filter, selected file, panel visibility
