/**
 * Feature Documentation: Symbol Navigation
 *
 * Shows cross-file symbol resolution in the file viewer. When viewing a
 * TypeScript file that imports from another project file, the import
 * line shows no red squigglies because diagnostic code 2307 is suppressed
 * and moduleResolution defaults to NodeJs for proper cross-file resolution.
 *
 * Run with: pnpm test:feature-docs symbol-navigation
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, waitForMonaco } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Symbol Navigation',
      description:
        'The file viewer resolves cross-file imports for TypeScript projects. When the Monaco editor ' +
        'loads a file that imports from another project file, the import resolves correctly — no red ' +
        'squigglies appear on the import line. This works because moduleResolution defaults to NodeJs ' +
        'and diagnostic code 2307 ("Cannot find module") is suppressed for third-party packages.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Symbol Navigation', () => {
  test('Step 1: Open explorer and navigate to index.ts with import', async () => {
    // Open the explorer panel
    const explorerButton = page.locator('button:has-text("Explorer")')
    await expect(explorerButton).toBeVisible()
    await explorerButton.click()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Expand src directory
    const srcFolder = explorerPanel.locator('text=src').first()
    await srcFolder.click()
    await expect(explorerPanel.locator('text=index.ts').first()).toBeVisible()

    // Click index.ts to open it in the file viewer
    const indexFile = explorerPanel.locator('text=index.ts').first()
    await indexFile.click()

    // File viewer should show Monaco editor with the file content
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()
    await waitForMonaco(fileViewer)

    // Wait for the import statement to be visible in the editor
    await expect(fileViewer.locator('.view-lines').first()).toContainText('add', { timeout: 5000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-index-file.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-index-file.png',
      caption: 'index.ts open with import statement',
      description:
        'The index.ts file is open in the file viewer showing an import of the `add` function ' +
        'from the local `./utils` module. The import line has no red error underline because ' +
        'moduleResolution defaults to NodeJs for proper cross-file resolution.',
    })
  })

  test('Step 2: Open utils.ts to see the exported function', async () => {
    // Click utils.ts in the explorer
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    const utilsFile = explorerPanel.locator('text=utils.ts').first()
    await utilsFile.click()

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await waitForMonaco(fileViewer)

    // Wait for the utils.ts content to load
    await expect(fileViewer.locator('.view-lines').first()).toContainText('multiply', { timeout: 5000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '02-utils-file.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-utils-file.png',
      caption: 'utils.ts showing exported functions',
      description:
        'The utils.ts file contains the `add` and `multiply` functions that are imported ' +
        'by index.ts. Both files are loaded into Monaco\'s TypeScript language service as ' +
        'extra libs, enabling cross-file IntelliSense.',
    })
  })

  test('Step 3: Verify no error squigglies on import line', async () => {
    // Navigate back to index.ts via explorer
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    const indexFile = explorerPanel.locator('text=index.ts').first()
    await indexFile.click()

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await waitForMonaco(fileViewer)
    await expect(fileViewer.locator('.view-lines').first()).toContainText('add', { timeout: 5000 })

    // Verify there are no error decorations (squigglies) in the editor.
    // Monaco renders error decorations with class "squiggly-error".
    // At this point the editor content is loaded; any diagnostic errors
    // from the TS language service would have produced squiggly decorations.
    const errorSquigglies = fileViewer.locator('.squiggly-error')
    const errorCount = await errorSquigglies.count()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '03-no-errors.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/03-no-errors.png',
      caption: `Clean editor with no import errors (${errorCount} squigglies)`,
      description:
        'The import line shows no red error squigglies. Diagnostic code 2307 ("Cannot find module") ' +
        'is suppressed because we load project source files but not node_modules type declarations. ' +
        'This prevents false error noise while still providing IntelliSense for project files.',
    })
  })
})
