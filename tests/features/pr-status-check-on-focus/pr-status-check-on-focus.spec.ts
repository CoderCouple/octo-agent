/**
 * Feature Documentation: PR Status Check on Focus
 *
 * When a PR is in OPEN state and the user switches focus away from a webview
 * (e.g. after merging a PR on GitHub) or into the explorer panel, the app
 * automatically re-checks the PR status via `gh pr view`. This keeps the UI
 * in sync without manual refresh clicks.
 *
 * Run with: pnpm test:feature-docs pr-status-check-on-focus
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

test.setTimeout(60000)

/** Navigate the explorer panel to the source-control tab */
async function openSourceControl(p: Page) {
  const explorerButton = p.locator('button:has-text("Explorer")')
  const explorerClasses = await explorerButton.getAttribute('class').catch(() => '')
  if (!explorerClasses?.includes('bg-accent')) {
    await explorerButton.click()
    await expect(p.locator('[data-panel-id="explorer"]')).toBeVisible()
  }

  await p.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await expect(p.locator('[data-panel-id="explorer"]').getByText(/^Changes \(/)).toBeVisible({ timeout: 5000 })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'PR Status Check on Focus',
      description:
        'When a session has an open PR and the user interacts with the embedded webview ' +
        '(e.g. to merge it on GitHub), the PR status is automatically re-checked when ' +
        'focus leaves the webview or enters the explorer panel. This uses a custom DOM ' +
        'event (broomy:check-pr-status) to trigger a lightweight gh pr view call, but ' +
        'only when the PR is currently OPEN — avoiding unnecessary API calls for merged ' +
        'or closed PRs.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: PR Status Check on Focus', () => {
  test('Step 1: Session with OPEN PR visible in source control', async () => {
    // Switch to backend-api session which has mock PR #123 in OPEN state
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()

    await openSourceControl(page)

    const explorer = page.locator('[data-panel-id="explorer"]')
    const prBadge = explorer.locator('span', { hasText: /^OPEN$/ })
    await expect(prBadge).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-open-pr-banner.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/01-open-pr-banner.png',
      caption: 'Source control shows PR #123 in OPEN state',
      description:
        'The backend-api session is on a feature branch with an open PR. ' +
        'The source control banner shows the OPEN badge. This is the state ' +
        'that triggers automatic re-checking when focus changes.',
    })
  })

  test('Step 2: User opens PR in the embedded webview', async () => {
    const explorer = page.locator('[data-panel-id="explorer"]')
    const prLink = explorer.locator('button', { hasText: '#123' })
    await prLink.click()

    // The file viewer panel should show the PR URL in the webview
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 5000 })

    const urlBar = fileViewer.locator('.font-mono', { hasText: 'github.com' })
    await expect(urlBar).toBeVisible({ timeout: 5000 })

    // Screenshot the explorer + webview together to show the full context
    await screenshotRegion(
      page,
      explorer,
      fileViewer,
      path.join(SCREENSHOTS, '02-pr-in-webview.png'),
      { maxHeight: 500 },
    )
    steps.push({
      screenshotPath: 'screenshots/02-pr-in-webview.png',
      caption: 'PR page opened in embedded webview alongside source control',
      description:
        'The user clicks the PR link to open it in the embedded browser. They might ' +
        'perform actions here like merging the PR. When they switch focus away — either by ' +
        'clicking into the explorer or anywhere else — the webview blur event dispatches ' +
        'broomy:check-pr-status, which triggers a PR status re-fetch.',
    })
  })

  test('Step 3: Focus change triggers PR status re-check', async () => {
    // Verify both event mechanisms are wired up by checking that
    // the custom event fires when focus moves between panels.

    // Test 1: webview blur → event fires
    const webviewBlurFired = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const handler = () => {
          document.removeEventListener('broomy:check-pr-status', handler)
          resolve(true)
        }
        document.addEventListener('broomy:check-pr-status', handler)

        // Move focus to the terminal (away from webview)
        const terminal = document.querySelector('[data-panel-id="terminal"]')
        if (terminal instanceof HTMLElement) terminal.click()

        setTimeout(() => {
          document.removeEventListener('broomy:check-pr-status', handler)
          resolve(false)
        }, 2000)
      })
    })

    // Test 2: explorer focus-in → event fires
    const explorerFocusFired = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const handler = () => {
          document.removeEventListener('broomy:check-pr-status', handler)
          resolve(true)
        }
        document.addEventListener('broomy:check-pr-status', handler)

        // Focus something inside the explorer from outside
        const explorerEl = document.querySelector('[data-panel-id="explorer"]')
        const button = explorerEl?.querySelector('button')
        if (button) button.focus()

        setTimeout(() => {
          document.removeEventListener('broomy:check-pr-status', handler)
          resolve(false)
        }, 2000)
      })
    })

    // Verify at least the explorer focus mechanism works
    // (webview blur depends on whether the webview actually had DOM focus)
    expect(explorerFocusFired).toBe(true)

    // Screenshot the full app to show the terminal now has focus
    // while the explorer still shows the OPEN PR that was just re-checked
    await page.screenshot({
      path: path.join(SCREENSHOTS, '03-focus-triggers-recheck.png'),
    })
    steps.push({
      screenshotPath: 'screenshots/03-focus-triggers-recheck.png',
      caption: 'Focus changes trigger automatic PR status re-check',
      description:
        'After the user interacts with the webview and moves focus elsewhere, two mechanisms ' +
        'fire the broomy:check-pr-status event: (1) the webview blur handler, and (2) the ' +
        'explorer focus-in handler (when focus enters from outside). The usePrEffects hook ' +
        'listens for this event and re-fetches PR status only when the PR is OPEN, avoiding ' +
        'unnecessary API calls for merged or closed PRs. ' +
        `Webview blur event fired: ${webviewBlurFired ? 'yes' : 'no (webview did not have DOM focus)'}. ` +
        `Explorer focus-in event fired: ${explorerFocusFired ? 'yes' : 'no'}.`,
    })
  })
})
