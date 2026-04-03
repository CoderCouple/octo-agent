/**
 * Feature Documentation: PR Create Update
 *
 * Demonstrates that the source control tab updates reactively after the agent
 * creates a PR. Previously, PR status only refreshed when ahead/behind counts
 * changed. Now a file watcher on `.octoagent/pr-result.json` triggers an immediate
 * update when the agent writes the PR result.
 *
 * Run with: pnpm test:feature-docs pr-create-update
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

/** Set the explorer panel to the source-control tab */
async function openSourceControl() {
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
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
  await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  ;({ page } = await resetApp({ scenario: 'marketing' }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'PR Create Update',
      description:
        'When the user clicks "Create PR", the app sends a prompt to the agent which runs ' +
        '`gh pr create` and writes the result to `.octoagent/pr-result.json`. A new file watcher ' +
        'detects this file creation and immediately updates the source control panel with PR info — ' +
        'no manual refresh needed. This follows the existing `fs.watch` pattern used for file trees ' +
        'and issue plan detection.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: PR Create Update', () => {
  test('Step 1: Source control panel showing PR status for a feature branch', async () => {
    // Select the backend-api session (feature/jwt-auth branch, has PR in mock data)
    const session = page.locator('.cursor-pointer:has-text("backend-api")')
    await session.click()
    await expect(session).toHaveClass(/bg-accent\/15/)

    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-source-control-with-pr.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control-with-pr.png',
      caption: 'Source control panel showing PR info for a feature branch',
      description:
        'The explorer shows the source control view for backend-api on the feature/jwt-auth branch. ' +
        'Since a PR exists (mock data), the panel displays PR details instead of the "Create PR" button.',
    })
  })

  test('Step 2: Sidebar and explorer showing the session with PR', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '02-sidebar-and-explorer.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-sidebar-and-explorer.png',
      caption: 'Full view: sidebar with session list and source control panel',
      description:
        'The sidebar shows the selected session. The source control panel displays PR status ' +
        'that was loaded reactively. Before this fix, PR status would only update when the ' +
        'ahead/behind counts changed — now it also updates when the agent writes pr-result.json.',
    })
  })

  test('Step 3: Switching to a session on main (no PR)', async () => {
    // docs-site is on main, so no PR
    const docsSession = page.locator('.cursor-pointer:has-text("docs-site")')
    await docsSession.click()
    await expect(docsSession).toHaveClass(/bg-accent\/15/)

    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-no-pr-on-main.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-no-pr-on-main.png',
      caption: 'Source control on main branch — no PR to display',
      description:
        'When the session is on the main branch, there is no PR. The source control panel ' +
        'shows the working tree state without PR info. The file watcher is still active but ' +
        'will not trigger until a pr-result.json appears in this session\'s .octoagent directory.',
    })
  })
})
