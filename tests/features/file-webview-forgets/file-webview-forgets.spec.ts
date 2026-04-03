/**
 * Feature Documentation: Webview Preserved Across Session Switches
 *
 * Verifies that a URL opened in the file viewer's webview persists when
 * switching to another session and back. Previously, inactive sessions
 * used `display: none` which caused Electron webviews to lose their
 * renderer process.
 *
 * Run with: pnpm test:feature-docs file-webview-forgets
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

const TEST_URL = 'https://example.com'

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Webview Preserved Across Session Switches',
      description:
        'When a web page URL is open in the file viewer panel and the user ' +
        'switches to another session then switches back, the webview is preserved. ' +
        'The fix changes inactive session wrappers from display:none to visibility:hidden, ' +
        'preventing Electron webview elements from losing their renderer process.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Open a URL in the file viewer via store manipulation */
async function openUrlInFileViewer(p: Page, url: string) {
  await p.evaluate((targetUrl) => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => {
        activeSessionId: string
        sessions: Record<string, unknown>[]
        selectFile: (id: string, filePath: string) => void
      }
    }
    if (!store) return
    const state = store.getState()
    state.selectFile(state.activeSessionId, targetUrl)
  }, url)
}

test.describe.serial('Feature: Webview Preserved Across Session Switches', () => {
  test('Step 1: Open a URL in the file viewer webview', async () => {
    // Open a URL via the store (simulates clicking a PR link)
    await openUrlInFileViewer(page, TEST_URL)

    // File viewer should open with the webview
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    // The webview navigation bar should be visible (back/forward/reload + URL bar)
    const webview = fileViewer.locator('webview')
    await expect(webview).toBeVisible({ timeout: 10000 })

    // The URL bar should show the URL
    await expect(fileViewer.locator('text=example.com').first()).toBeVisible({ timeout: 5000 })

    // Wait for the webview to finish loading the page content
    await page.waitForFunction(() => {
      const wv = document.querySelector('webview') as Electron.WebviewTag | null
      return wv && !wv.isLoading()
    }, { timeout: 15000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-webview-open.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-webview-open.png',
      caption: 'Web page open in the file viewer webview',
      description:
        'A URL has been opened in the file viewer. The webview viewer shows ' +
        'a navigation bar with back/forward/reload buttons and the current URL, ' +
        'plus the rendered web page below.',
    })
  })

  test('Step 2: Switch to another session', async () => {
    // Click on the backend-api session in the sidebar
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '02-switched-session.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-switched-session.png',
      caption: 'Switched to the backend-api session',
      description:
        'After switching to backend-api, the previous session\'s file viewer is hidden ' +
        'with visibility:hidden (not display:none). This keeps the Electron webview ' +
        'renderer process alive.',
    })
  })

  test('Step 3: Switch back — webview is preserved', async () => {
    // Switch back to the octoagent session
    const octoagentSession = page.locator('.cursor-pointer:has-text("octoagent")')
    await octoagentSession.click()
    await expect(octoagentSession).toHaveClass(/bg-accent\/15/)

    // The file viewer should still show the webview with the URL
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 5000 })

    // The webview element should still be present
    const webview = fileViewer.locator('webview')
    await expect(webview).toBeVisible({ timeout: 5000 })

    // The URL should still be displayed
    await expect(fileViewer.locator('text=example.com').first()).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '03-webview-preserved.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-webview-preserved.png',
      caption: 'Webview preserved after switching back',
      description:
        'After switching back to the octoagent session, the webview is still showing the web page. ' +
        'The URL bar still displays example.com and the page content is intact. ' +
        'Previously, this would have shown a blank viewer or tried to load the URL as a file.',
    })
  })

  test('Step 4: Verify inactive wrapper uses visibility:hidden', async () => {
    // Switch to backend-api to verify the inactive wrapper CSS
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    const fileViewerPanel = page.locator('[data-panel-id="fileViewer"]')

    // Inactive session wrappers should use 'invisible' (visibility:hidden), not 'hidden' (display:none)
    const invisibleWrappers = fileViewerPanel.locator('.invisible.pointer-events-none')
    const invisibleCount = await invisibleWrappers.count()
    expect(invisibleCount).toBeGreaterThan(0)

    // No direct-child wrappers should use 'hidden' for session visibility
    const hiddenWrappers = fileViewerPanel.locator(':scope > div > .hidden')
    const hiddenCount = await hiddenWrappers.count()
    expect(hiddenCount).toBe(0)

    // Clean up: switch back and close file viewer
    const octoagentSession = page.locator('.cursor-pointer:has-text("octoagent")')
    await octoagentSession.click()
    await page.keyboard.press('Meta+3')
    await page.keyboard.press('Meta+3')
    await expect(fileViewerPanel).not.toBeVisible()

    steps.push({
      screenshotPath: 'screenshots/03-webview-preserved.png',
      caption: 'Inactive wrappers use visibility:hidden, not display:none',
      description:
        'The fix changes inactive session file viewer wrappers from the CSS ' +
        'class "hidden" (display:none) to "invisible pointer-events-none" ' +
        '(visibility:hidden). This prevents Electron webview elements from ' +
        'losing their renderer process when the session is not active.',
    })
  })
})
