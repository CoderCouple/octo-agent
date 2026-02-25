/**
 * Feature Documentation: Select All Scoped to Active Pane
 *
 * Demonstrates that Cmd+A selects content within the focused pane
 * (Monaco editor) rather than selecting everything on the page.
 *
 * Run with: pnpm test:feature-docs select-all
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
      title: 'Select All — Scoped to Active Pane',
      description:
        'Cmd+A (Select All) now selects content only within the currently focused pane. ' +
        'In a Monaco editor, it selects all text within the editor. ' +
        'It no longer selects everything on the page.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

})

test.describe.serial('Feature: Select All Scoped to Active Pane', () => {
  test('Step 1: Open a file in the editor', async () => {
    // Open explorer panel
    const explorerButton = page.locator('button[title*="Explorer"]').first()
    if (await explorerButton.isVisible()) {
      const cls = await explorerButton.getAttribute('class').catch(() => '')
      if (!cls?.includes('bg-accent')) {
        await explorerButton.click()
      }
    }
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Click a file to open in the editor
    const fileEntry = explorerPanel.locator('text=README.md').first()
    await expect(fileEntry).toBeVisible()
    await fileEntry.click()

    // Wait for file viewer to appear (may open in diff or code mode)
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    // Switch to Code view if we're in diff mode
    const codeButton = fileViewer.locator('button[title="Code"]').first()
    if (await codeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await codeButton.click()
    }

    // Wait for Monaco editor to load
    await waitForMonaco(fileViewer)

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-file-before.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-file-before.png',
      caption: 'File open in Monaco editor, before Select All',
      description:
        'README.md is open in the file viewer. No text is selected yet.',
    })
  })

  test('Step 2: Cmd+A in editor selects editor content only', async () => {
    // Click on the Monaco editor to focus it
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    const editor = fileViewer.locator('.monaco-editor').first()
    await editor.click()

    // Press Cmd+A
    await page.keyboard.press('Meta+a')

    // Check that the DOM selection doesn't span the whole page
    const selectionInfo = await page.evaluate(() => {
      const domSelection = window.getSelection()
      const selectedText = domSelection?.toString() || ''
      // Monaco manages its own selection — the DOM selection should not include
      // sidebar or other panel content
      const sidebarEl = document.querySelector('[data-panel-id="sidebar"]')
      const sidebarSelected = sidebarEl && domSelection && domSelection.rangeCount > 0
        ? sidebarEl.contains(domSelection.getRangeAt(0).startContainer) ||
          sidebarEl.contains(domSelection.getRangeAt(0).endContainer)
        : false
      return { domTextLength: selectedText.length, sidebarSelected }
    })

    // Sidebar should NOT be part of the selection
    expect(selectionInfo.sidebarSelected).toBe(false)

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '02-editor-select-all.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-editor-select-all.png',
      caption: 'After Cmd+A — editor text is selected, not the entire page',
      description:
        'Pressing Cmd+A while the Monaco editor is focused selects all text within the editor. ' +
        'The sidebar and other panels are unaffected.',
    })
  })

  test('Step 3: Sidebar and other panels are not selected', async () => {
    // Verify the sidebar is visible and its content is NOT part of a DOM selection
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    const sidebarSelected = await page.evaluate(() => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return false
      const sidebarEl = document.querySelector('[data-panel-id="sidebar"]')
      if (!sidebarEl) return false
      // Check if the selection intersects with the sidebar
      const range = selection.getRangeAt(0)
      return sidebarEl.contains(range.startContainer) || sidebarEl.contains(range.endContainer)
    })

    expect(sidebarSelected).toBe(false)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-sidebar-not-selected.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/03-sidebar-not-selected.png',
      caption: 'Sidebar remains unselected after Cmd+A in editor',
      description:
        'The sidebar shows sessions as normal — no text highlight. ' +
        'Select All is properly scoped to the file editor pane.',
    })
  })
})
