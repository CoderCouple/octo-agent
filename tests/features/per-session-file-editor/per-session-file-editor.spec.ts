/**
 * Feature Documentation: Per-Session File Editor
 *
 * Demonstrates that each session has its own independent file editor instance.
 * Unsaved changes are preserved when switching sessions, and the "Unsaved Changes"
 * dialog does not appear when switching to a different session.
 *
 * Run with: pnpm test:feature-docs per-session-file-editor
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
      title: 'Per-Session File Editor',
      description:
        'Each session gets its own independent file editor (Monaco) instance. ' +
        'Unsaved changes are preserved when switching between sessions, and switching ' +
        'away from a session with unsaved edits does not trigger the "Unsaved Changes" dialog. ' +
        'This follows the same pattern used for terminals — all instances stay mounted, ' +
        'with inactive ones hidden via CSS.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

})

/** Ensure explorer panel is open */
async function openExplorer() {
  const explorerButton = page.locator('button:has-text("Explorer")').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
    }
  }
  const explorerPanel = page.locator('[data-panel-id="explorer"]')
  await expect(explorerPanel).toBeVisible()
  return explorerPanel
}

test.describe.serial('Feature: Per-Session File Editor', () => {
  test('Step 1: Open a file in the first session', async () => {
    // Ensure we're on the first session (octoagent)
    const octoagentSession = page.locator('.cursor-pointer:has-text("octoagent")')
    await expect(octoagentSession).toBeVisible()
    await expect(octoagentSession).toHaveClass(/bg-accent\/15/)

    // Open explorer and click README.md to open file viewer
    const explorerPanel = await openExplorer()
    const readmeEntry = explorerPanel.locator('text=README.md').first()
    await expect(readmeEntry).toBeVisible()
    await readmeEntry.click()

    // File viewer should appear
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    await screenshotRegion(
      page,
      page.locator('[data-panel-id="explorer"]'),
      page.locator('[data-panel-id="fileViewer"]'),
      path.join(SCREENSHOTS, '01-session-a-file-open.png'),
      { maxHeight: 500 },
    )
    steps.push({
      screenshotPath: 'screenshots/01-session-a-file-open.png',
      caption: 'README.md opened in the octoagent session',
      description:
        'The file viewer shows README.md content for the "octoagent" session. ' +
        'The explorer panel on the left shows the file tree, and the file viewer ' +
        'displays the file content above the terminal.',
    })
  })

  test('Step 2: Switch to Code view and make an edit', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Switch to Code view using the toolbar icon button (title="Code")
    const codeButton = fileViewer.locator('button[title="Code"]').first()
    if (await codeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await codeButton.click()
    }

    // Wait for Monaco editor to appear (longer timeout for initial load)
    const monacoEditor = fileViewer.locator('.monaco-editor').first()
    await expect(monacoEditor).toBeVisible({ timeout: 10000 })

    // Click into the editor and type to make it dirty
    const textArea = fileViewer.locator('.monaco-editor textarea').first()
    await textArea.focus()
    await page.keyboard.press('End')
    await page.keyboard.type(' UNSAVED_EDIT')
    await expect(fileViewer.locator('button:has-text("Save")')).toBeVisible()

    // Take screenshot showing dirty state
    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '02-session-a-dirty.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-session-a-dirty.png',
      caption: 'Unsaved edit in the octoagent session file editor',
      description:
        'After typing in the Monaco editor, the file is marked as dirty. ' +
        'The toolbar shows the modified indicator and a Save button appears. ' +
        'In the old behavior, switching sessions would lose this edit.',
    })
  })

  test('Step 3: Switch to a different session — no save dialog', async () => {
    // Switch to backend-api session
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()

    // Verify we switched — backend-api should be highlighted
    await expect(backendSession).toHaveClass(/bg-accent/, { timeout: 10000 })

    // Crucially, NO save dialog should have appeared
    const saveDialog = page.locator('text="Unsaved Changes"')
    await expect(saveDialog).not.toBeVisible()

    // The sidebar shows the switch
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-switched-no-dialog.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-switched-no-dialog.png',
      caption: 'Switched to backend-api without a save dialog',
      description:
        'Clicking "backend-api" switches sessions immediately. No "Unsaved Changes" ' +
        'dialog appears — the dirty state in the octoagent session is preserved silently ' +
        'because each session has its own independent file editor instance.',
    })
  })

  test('Step 4: Open a file in the second session', async () => {
    // Open explorer in the backend-api session
    const explorerPanel = await openExplorer()

    // Click README.md in this session too
    const readmeEntry = explorerPanel.locator('text=README.md').first()
    await expect(readmeEntry).toBeVisible()
    await readmeEntry.click()

    // File viewer should show content for the backend-api session
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '04-session-b-file-open.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/04-session-b-file-open.png',
      caption: 'README.md opened independently in backend-api session',
      description:
        'The backend-api session has its own file viewer showing README.md. ' +
        'This is a separate instance — edits here do not affect the octoagent session\'s editor.',
    })
  })

  test('Step 5: Switch back — unsaved edits are preserved', async () => {
    // Switch back to octoagent
    const octoagentSession = page.locator('.cursor-pointer:has-text("octoagent")')
    await octoagentSession.click()

    await expect(octoagentSession).toHaveClass(/bg-accent/, { timeout: 10000 })

    // No save dialog
    const saveDialog = page.locator('text="Unsaved Changes"')
    await expect(saveDialog).not.toBeVisible()

    // The file viewer should still be visible with our edits
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()

    // Check that the editor still has our edit text visible in the DOM
    const hasUnsavedEdit = await page.evaluate(() => {
      const lines = document.querySelectorAll('[data-panel-id="fileViewer"] .view-line')
      for (const line of lines) {
        if (line.textContent?.includes('UNSAVED_EDIT')) return true
      }
      return false
    })
    expect(hasUnsavedEdit).toBe(true)

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '05-session-a-edit-preserved.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/05-session-a-edit-preserved.png',
      caption: 'Unsaved edits preserved after switching back',
      description:
        'After switching back to the "octoagent" session, the file editor still shows ' +
        'our unsaved edit (UNSAVED_EDIT text). The dirty indicator remains in the toolbar. ' +
        'Each session\'s file editor instance stays mounted (hidden via CSS) when inactive, ' +
        'preserving all state including cursor position, scroll position, and unsaved changes.',
    })
  })
})
