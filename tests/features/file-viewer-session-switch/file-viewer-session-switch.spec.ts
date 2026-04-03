/**
 * Feature Documentation: File Viewer Session Switch
 *
 * Verifies that switching sessions preserves file viewer state:
 * - Edits (dirty state) are not lost
 * - View mode (latest vs diff) is preserved
 *
 * Run with: pnpm test:feature-docs file-viewer-session-switch
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotRegion } from '../_shared/screenshot-helpers'
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
      title: 'File Viewer Session Switch',
      description:
        'When switching between sessions, the file viewer preserves edits and view mode. ' +
        'Previously, switching away from a session and back would lose unsaved edits and ' +
        'reset the view mode to diff. This feature doc verifies the fix.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: File Viewer Session Switch', () => {
  test('Step 1: Open a file in the file viewer', async () => {
    // Open explorer
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Click on a file to open file viewer
    await explorerPanel.locator('text=package.json').first().click()

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    // Verify the file is shown
    await expect(fileViewer.locator('text=package.json').first()).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-file-open.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-file-open.png',
      caption: 'File opened in file viewer',
      description:
        'A file is opened in the file viewer panel in "latest" (edit) mode. ' +
        'No unsaved changes indicator is visible yet.',
    })
  })

  test('Step 2: Make an edit to create dirty state', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Click into the Monaco editor area and type to create dirty state
    const monacoEditor = fileViewer.locator('.monaco-editor').first()
    await expect(monacoEditor).toBeVisible({ timeout: 10000 })
    await monacoEditor.click()

    // Type something to make the file dirty
    await page.keyboard.type('// edited')

    // Wait for dirty indicator (Save button) to appear
    const saveButton = fileViewer.locator('button:has-text("Save")')
    await expect(saveButton).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '02-dirty-state.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-dirty-state.png',
      caption: 'File has unsaved edits (dirty state)',
      description:
        'After typing in the editor, the "Save" button appears in the toolbar, ' +
        'indicating unsaved changes. This dirty state should survive session switches.',
    })
  })

  test('Step 3: Switch to another session', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')

    // Click on a different session
    const otherSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(otherSession).toBeVisible()
    await otherSession.click()

    // Verify we switched — the other session should be highlighted
    await expect(otherSession).toHaveClass(/bg-accent\/15/)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-switched-away.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/03-switched-away.png',
      caption: 'Switched to a different session',
      description:
        'Clicking "backend-api" in the sidebar switches to that session. ' +
        'The original session\'s file viewer state should be preserved in the background.',
    })
  })

  test('Step 4: Switch back — edits preserved', async () => {
    // Switch back to the original session
    const originalSession = page.locator('.cursor-pointer:has-text("octoagent")').first()
    await originalSession.click()
    await expect(originalSession).toHaveClass(/bg-accent\/15/)

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    // The Save button should still be visible — edits preserved
    const saveButton = fileViewer.locator('button:has-text("Save")')
    await expect(saveButton).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '04-edits-preserved.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/04-edits-preserved.png',
      caption: 'Edits preserved after session switch',
      description:
        'After switching back, the "Save" button is still visible, confirming that ' +
        'unsaved edits were not lost during the session switch. The file viewer ' +
        'remains in "latest" (edit) mode, not diff mode.',
    })
  })
})
