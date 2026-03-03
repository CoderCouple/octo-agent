Build a screenshot-based feature walkthrough for a feature.

## Arguments

$ARGUMENTS should be a feature slug (e.g., `session-switching`). If not provided, derive one from the current git branch name.

## Steps

1. **Determine the feature slug.** Use $ARGUMENTS if provided. Otherwise, get the current branch name with `git branch --show-current` and derive a slug from it (strip prefixes like `feature/`, convert to kebab-case).

2. **Understand the feature.** Look at recent commits on this branch (`git log main..HEAD --oneline`) and read the changed files to understand what the feature does and what UI flows it involves.

3. **Check for an existing spec.** Look for `tests/features/<slug>/<slug>.spec.ts`. If it exists, read it and update it rather than creating from scratch.

4. **Create the feature directory** if it doesn't exist: `tests/features/<slug>/`.

5. **Write the spec file** at `tests/features/<slug>/<slug>.spec.ts` following these patterns from the reference example (`tests/features/session-switching/session-switching.spec.ts`):

   - Import `test`, `expect`, `resetApp` from `../_shared/electron-fixture`
   - Import `screenshotElement`, `screenshotRegion` from `../_shared/screenshot-helpers`
   - Import `generateFeaturePage`, `generateIndex`, `FeatureStep` from `../_shared/template`
   - Set up `FEATURE_DIR`, `SCREENSHOTS`, `FEATURES_ROOT` constants
   - In `beforeAll`: create screenshots dir, call `resetApp()` to get a fresh page
   - In `afterAll`: call `generateFeaturePage()` then `generateIndex()`
   - Use `test.describe.serial` with sequential test steps
   - Each step: navigate to the right UI state, assert what's visible, capture a cropped screenshot, push to `steps[]` with caption and description
   - Name screenshots with numeric prefixes: `01-initial.png`, `02-after-click.png`, etc.

6. **Screenshot guidelines:**
   - Crop to the relevant UI region — use `screenshotElement()` for single elements, `screenshotRegion()` for spanning areas
   - Write captions that explain what the user should notice, not just what's on screen
   - Cover the full feature flow: initial state → user actions → result states
   - Use the E2E mock data (the app runs with `E2E_TEST=true`) — never depend on real repos or APIs

7. **Run the feature doc.** Execute `pnpm test:feature-docs <slug>` and verify it generates screenshots and HTML successfully. If the test fails, fix the spec and re-run.

## Rules

- Only the `.spec.ts` file is committed — screenshots and HTML are gitignored.
- Don't screenshot the entire window unless the entire window is relevant.
- Each step should test something meaningful, not just take a screenshot.
- If the feature involves multiple distinct flows, consider breaking them into separate `test.describe.serial` blocks.
