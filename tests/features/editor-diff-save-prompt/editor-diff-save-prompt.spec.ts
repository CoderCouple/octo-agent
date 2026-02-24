/**
 * Feature Documentation: Save Prompt Before Diff View
 *
 * When a user has unsaved edits in the editor and clicks the Diff button,
 * a dialog prompts them to Save, Discard, or Cancel. This prevents losing
 * unsaved work when switching view modes.
 *
 * Run with: pnpm test:feature-docs editor-diff-save-prompt
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
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

let electronApp: ElectronApplication
let page: Page
const steps: FeatureStep[] = []

test.setTimeout(90000)

/** Navigate the explorer panel to the source-control tab */
async function openSourceControl() {
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await page.waitForTimeout(300)
    }
  }

  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await page.waitForTimeout(500)
}

/** Type into the Monaco editor to make it dirty */
async function makeEditorDirty() {
  const fileViewer = page.locator('[data-panel-id="fileViewer"]')
  const textArea = fileViewer.locator('.monaco-editor textarea').first()
  await textArea.focus()
  await page.waitForTimeout(300)
  await page.keyboard.press('End')
  await page.keyboard.type(' UNSAVED_EDIT')
  await page.waitForTimeout(500)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Save Prompt Before Diff View',
      description:
        'When a user has unsaved edits in the file editor and clicks the Diff button, ' +
        'a dialog appears asking them to Save, Discard, or Cancel. This prevents ' +
        'accidentally losing work when switching from the editor to the diff view.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Save Prompt Before Diff View', () => {
  test('Step 1: Open a modified file from source control', async () => {
    await openSourceControl()

    // Click README.md (which is reported as modified in E2E mock)
    const readmeEntry = page.locator('text=README.md').first()
    await expect(readmeEntry).toBeVisible()
    await readmeEntry.click()
    await page.waitForTimeout(1500)

    // File viewer should appear in diff mode (since opened from source control)
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-file-open-diff.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-file-open-diff.png',
      caption: 'Modified file opened in diff view from source control',
      description:
        'README.md is opened from the source control panel. It opens in diff mode ' +
        'showing changes between HEAD and the working copy.',
    })
  })

  test('Step 2: Switch to Code view and make an edit', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Switch to Code view
    const codeButton = fileViewer.locator('button[title="Code"]').first()
    await expect(codeButton).toBeVisible({ timeout: 5000 })
    await codeButton.click()
    await page.waitForTimeout(1000)

    // Wait for Monaco editor
    const monacoEditor = fileViewer.locator('.monaco-editor').first()
    await expect(monacoEditor).toBeVisible({ timeout: 10000 })

    // Type to make dirty
    await makeEditorDirty()

    // Verify the Save button appears in toolbar (indicates dirty state)
    await expect(fileViewer.locator('button:has-text("Save")')).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '02-editor-dirty.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-editor-dirty.png',
      caption: 'File edited with unsaved changes — Save button visible in toolbar',
      description:
        'After typing in the editor, the file is marked as dirty. The Save button ' +
        'appears in the toolbar. Previously, clicking Diff at this point would silently lose these edits.',
    })
  })

  test('Step 3: Click Diff — dialog appears', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Click the Diff button
    const diffButton = fileViewer.locator('button[title="Diff"]')
    await expect(diffButton).toBeVisible()
    await diffButton.click()
    await page.waitForTimeout(300)

    // The unsaved changes dialog should appear
    const dialog = page.locator('text="Unsaved Changes"')
    await expect(dialog).toBeVisible()

    await screenshotElement(page, page.locator('.bg-bg-secondary.border.border-border.rounded-lg.shadow-xl'), path.join(SCREENSHOTS, '03-unsaved-dialog.png'))
    steps.push({
      screenshotPath: 'screenshots/03-unsaved-dialog.png',
      caption: 'Unsaved Changes dialog with Save, Discard, and Cancel options',
      description:
        'Clicking Diff while the editor has unsaved changes shows a confirmation dialog. ' +
        'The user can choose to Save (persist edits then view diff), Discard (lose edits and view diff), ' +
        'or Cancel (stay in the editor with edits intact).',
    })
  })

  test('Step 4: Cancel — stay in editor with edits', async () => {
    // Click Cancel
    const cancelButton = page.locator('button:has-text("Cancel")').last()
    await cancelButton.click()
    await page.waitForTimeout(300)

    // Dialog should be gone
    const dialog = page.locator('text="Unsaved Changes"')
    await expect(dialog).not.toBeVisible()

    // Still in Code view with edits preserved
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    const monacoEditor = fileViewer.locator('.monaco-editor').first()
    await expect(monacoEditor).toBeVisible()

    // Verify the edit is still there
    const hasUnsavedEdit = await page.evaluate(() => {
      const lines = document.querySelectorAll('[data-panel-id="fileViewer"] .view-line')
      for (const line of lines) {
        if (line.textContent?.includes('UNSAVED_EDIT')) return true
      }
      return false
    })
    expect(hasUnsavedEdit).toBe(true)

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '04-cancel-edits-preserved.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/04-cancel-edits-preserved.png',
      caption: 'After Cancel — still in editor with edits preserved',
      description:
        'Clicking Cancel dismisses the dialog and keeps the user in the editor. ' +
        'All unsaved edits are intact.',
    })
  })

  test('Step 5: Click Diff again and Discard — switches to diff view', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Click Diff again
    const diffButton = fileViewer.locator('button[title="Diff"]')
    await diffButton.click()
    await page.waitForTimeout(300)

    // Dialog should appear again
    await expect(page.locator('text="Unsaved Changes"')).toBeVisible()

    // Click Discard
    const discardButton = page.locator('button:has-text("Discard")')
    await discardButton.click()
    await page.waitForTimeout(1000)

    // Should now be in diff view
    const diffEditor = page.locator('.monaco-diff-editor').first()
    await expect(diffEditor).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '05-discard-diff-view.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/05-discard-diff-view.png',
      caption: 'After Discard — diff view shows without unsaved edits',
      description:
        'Clicking Discard drops the unsaved edits and switches to the diff view. ' +
        'The diff shows the original file changes (HEAD vs working copy) without the discarded edits.',
    })
  })

  test('Step 6: Switch back to Code, re-edit, then Save', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Switch back to Code view
    const codeButton = fileViewer.locator('button[title="Code"]').first()
    await codeButton.click()
    await page.waitForTimeout(1000)

    const monacoEditor = fileViewer.locator('.monaco-editor').first()
    await expect(monacoEditor).toBeVisible({ timeout: 10000 })

    // Make another edit
    await makeEditorDirty()
    await page.waitForTimeout(300)

    // Click Diff
    const diffButton = fileViewer.locator('button[title="Diff"]')
    await diffButton.click()
    await page.waitForTimeout(300)

    // Dialog appears
    await expect(page.locator('text="Unsaved Changes"')).toBeVisible()

    // Click Save
    // Use the dialog's Save button (last one, inside the dialog overlay)
    const saveButton = page.locator('.fixed.inset-0 button:has-text("Save")')
    await saveButton.click()
    await page.waitForTimeout(1000)

    // Should now be in diff view after save
    const diffEditor = page.locator('.monaco-diff-editor').first()
    await expect(diffEditor).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '06-save-then-diff.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/06-save-then-diff.png',
      caption: 'After Save — edits saved and diff view shown',
      description:
        'Clicking Save persists the edits to disk, then switches to the diff view. ' +
        'The diff now reflects the saved changes.',
    })
  })

  test('Step 7: No dialog when switching without edits', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Switch to Code view (no edits)
    const codeButton = fileViewer.locator('button[title="Code"]').first()
    await codeButton.click()
    await page.waitForTimeout(1000)

    // Verify not dirty — no Save button
    await expect(fileViewer.locator('button:has-text("Save")')).not.toBeVisible()

    // Click Diff — should switch immediately without dialog
    const diffButton = fileViewer.locator('button[title="Diff"]')
    await diffButton.click()
    await page.waitForTimeout(500)

    // No dialog
    await expect(page.locator('text="Unsaved Changes"')).not.toBeVisible()

    // Should be in diff view
    const diffEditor = page.locator('.monaco-diff-editor').first()
    await expect(diffEditor).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '07-no-dialog-clean.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/07-no-dialog-clean.png',
      caption: 'Switching to Diff without edits — no dialog, immediate switch',
      description:
        'When there are no unsaved changes, clicking Diff switches to the diff view ' +
        'immediately without showing any dialog. The prompt only appears when edits would be lost.',
    })
  })
})
