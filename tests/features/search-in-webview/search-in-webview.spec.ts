/**
 * Feature Documentation: Search in File Viewer
 *
 * Shows the find-in-page feature across different file viewer modes: Monaco code
 * editor and Markdown preview, using the toolbar search button and keyboard
 * shortcuts.
 *
 * Run with: pnpm test:feature-docs search-in-webview
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement } from '../_shared/screenshot-helpers'
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
  ;({ page } = await resetApp({ scenario: 'marketing' }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Search in File Viewer',
      description:
        'All file viewer modes now support find-in-page search. The toolbar shows a ' +
        'magnifying glass icon that opens the find UI for the active viewer. In Monaco ' +
        'code views, it triggers the built-in find widget. In Markdown preview, it opens ' +
        'a custom find bar with CSS Highlight API-based match highlighting and navigation. ' +
        'In webview mode (for PR links), it uses Electron\'s findInPage API. Cmd+F also ' +
        'works as a keyboard shortcut in all modes.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Ensure explorer is open and switch to Files tab */
async function ensureFileTree(p: Page) {
  const explorerPanel = p.locator('[data-panel-id="explorer"]')

  // Open explorer if not already visible
  if (!await explorerPanel.isVisible({ timeout: 500 }).catch(() => false)) {
    const explorerButton = p.locator('button:has-text("Explorer")')
    await expect(explorerButton).toBeVisible()
    await explorerButton.click()
    await expect(explorerPanel).toBeVisible()
  }

  // Switch to Files tab
  const filesTab = explorerPanel.locator('button[title="Files"]')
  await filesTab.click()

  return explorerPanel
}

test.describe.serial('Feature: Search in Monaco Editor', () => {
  test('Step 1: Open a TypeScript file in the file viewer', async () => {
    const explorerPanel = await ensureFileTree(page)

    // Expand src directory
    const srcFolder = explorerPanel.locator('text=src').first()
    await srcFolder.click()
    await expect(explorerPanel.locator('text=middleware').first()).toBeVisible()

    // Expand middleware and open auth.ts
    const middlewareFolder = explorerPanel.locator('text=middleware').first()
    await middlewareFolder.click()
    await expect(explorerPanel.locator('text=auth.ts').first()).toBeVisible()

    const authFile = explorerPanel.locator('text=auth.ts').first()
    await authFile.click()

    // File viewer should be visible with Monaco editor
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()
    await expect(fileViewer.locator('.monaco-editor textarea').first()).toBeAttached({ timeout: 10000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-code-file-open.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-code-file-open.png',
      caption: 'TypeScript file open in the code viewer',
      description:
        'A TypeScript file is open in the Monaco editor. The toolbar shows ' +
        'the search icon (magnifying glass) and the outline button.',
    })
  })

  test('Step 2: Click the search button to open Monaco find widget', async () => {
    const searchButton = page.locator('button[title="Find (Cmd+F)"]')
    await expect(searchButton).toBeVisible()

    await searchButton.click()

    // Monaco's find widget appears
    const findWidget = page.locator('.find-widget textarea[aria-label="Find"]')
    await expect(findWidget).toBeVisible({ timeout: 5000 })

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '02-monaco-find-widget.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-monaco-find-widget.png',
      caption: 'Monaco find widget opened via toolbar button',
      description:
        'Clicking the search icon in the toolbar opens Monaco\'s built-in find widget ' +
        'at the top of the editor. You can also use Cmd+F to open it.',
    })

    // Dismiss the find widget
    await page.keyboard.press('Escape')
  })
})

test.describe.serial('Feature: Search in Markdown Preview', () => {
  test('Step 3: Open README.md in markdown preview', async () => {
    const explorerPanel = await ensureFileTree(page)

    // Collapse src to see root-level files
    const srcFolder = explorerPanel.locator('text=src').first()
    if (await srcFolder.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Check if src is expanded (has visible children)
      const middleware = explorerPanel.locator('text=middleware').first()
      if (await middleware.isVisible({ timeout: 500 }).catch(() => false)) {
        await srcFolder.click() // collapse it
        await expect(middleware).not.toBeVisible()
      }
    }

    // Click README.md at root level
    const readmeFile = explorerPanel.locator('text=README.md').first()
    await expect(readmeFile).toBeVisible({ timeout: 5000 })
    await readmeFile.click()

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()

    // Select Preview viewer (may default to Code if previous file was code)
    const previewButton = fileViewer.locator('button[title="Preview"]')
    if (await previewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await previewButton.click()
    }

    // Wait for markdown content to render
    await expect(fileViewer.locator('.prose')).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '03-markdown-preview.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/03-markdown-preview.png',
      caption: 'README.md open in markdown preview mode',
      description:
        'The README.md file opens in the markdown preview viewer by default. ' +
        'The toolbar search button is available for searching within the rendered content.',
    })
  })

  test('Step 4: Open the find bar in markdown preview', async () => {
    const searchButton = page.locator('button[title="Find (Cmd+F)"]')
    await expect(searchButton).toBeVisible()
    await searchButton.click()

    // The custom find bar should appear
    const findInput = page.locator('[data-panel-id="fileViewer"] input[placeholder="Find in page..."]')
    await expect(findInput).toBeVisible({ timeout: 3000 })

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '04-markdown-find-bar.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/04-markdown-find-bar.png',
      caption: 'Find bar open in markdown preview',
      description:
        'The find bar appears below the toolbar with an input field, match count, ' +
        'and prev/next navigation buttons. Type to search within the rendered markdown.',
    })
  })

  test('Step 5: Search for text and see highlighted matches', async () => {
    const findInput = page.locator('[data-panel-id="fileViewer"] input[placeholder="Find in page..."]')
    await findInput.fill('the')

    // Wait for match count to appear
    const matchInfo = page.locator('[data-panel-id="fileViewer"]').locator('text=/\\d+\\/\\d+/')
    await expect(matchInfo).toBeVisible({ timeout: 3000 })

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '05-markdown-search-results.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/05-markdown-search-results.png',
      caption: 'Search matches highlighted in markdown preview',
      description:
        'Matching text is highlighted using the CSS Custom Highlight API. The match count ' +
        'shows the current position and total matches. Use Enter/Shift+Enter or the arrow ' +
        'buttons to navigate between matches.',
    })
  })

  test('Step 6: Close the find bar with Escape', async () => {
    await page.keyboard.press('Escape')

    // Find bar should be hidden
    const findInput = page.locator('[data-panel-id="fileViewer"] input[placeholder="Find in page..."]')
    await expect(findInput).not.toBeVisible()

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer.locator('.prose')).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '06-markdown-find-closed.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/06-markdown-find-closed.png',
      caption: 'Find bar dismissed, highlights cleared',
      description:
        'Pressing Escape closes the find bar and clears all highlights, returning ' +
        'the markdown preview to its normal state.',
    })
  })
})
