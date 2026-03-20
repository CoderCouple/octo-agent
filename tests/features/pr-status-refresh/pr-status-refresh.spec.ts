/**
 * Feature Documentation: PR Status Refresh
 *
 * Documents the always-visible PR status banner with refresh button.
 * The banner now appears in all states (PR open, issue linked, no PR)
 * and includes a refresh button for manual re-fetching.
 *
 * Run with: pnpm test:feature-docs pr-status-refresh
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

  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'PR Status Refresh',
      description:
        'The PR status banner in the source control panel is now always visible, even when there is ' +
        'no pull request. Each state (open PR, linked issue, no PR) shows a refresh button on the right ' +
        'side. PR status is also automatically refreshed on app startup and when an agent finishes work.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: PR Status Refresh', () => {
  test('Step 1: PR banner with an open PR — shows refresh button', async () => {
    // backend-api session is on feature/auth, which has an OPEN PR in mock data
    const session = page.locator('.cursor-pointer:has-text("backend-api")')
    await session.click()
    await expect(session).toHaveClass(/bg-accent\/15/)

    await openSourceControl()

    // Verify the PR status banner is visible with OPEN badge
    const explorer = page.locator('[data-panel-id="explorer"]')
    const prBanner = explorer.locator('.bg-bg-secondary').first()
    await expect(prBanner).toBeVisible()
    await expect(prBanner.locator('text=OPEN')).toBeVisible()

    // Verify the refresh button is present
    const refreshBtn = prBanner.locator('button[title="Refresh PR status"]')
    await expect(refreshBtn).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-open-pr-with-refresh.png'), {
      maxHeight: 350,
    })
    steps.push({
      screenshotPath: 'screenshots/01-open-pr-with-refresh.png',
      caption: 'PR status banner showing an OPEN pull request with refresh button',
      description:
        'The source control panel for the backend-api session shows PR #123 with an OPEN badge. ' +
        'A refresh icon button is visible on the right side of the banner, allowing manual re-fetching.',
    })
  })

  test('Step 2: Session with issue but no PR — banner always visible', async () => {
    // broomy session has an issue linked but is on main (no PR)
    const session = page.locator('.cursor-pointer:has-text("broomy")')
    await session.click()
    await expect(session).toHaveClass(/bg-accent\/15/)

    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    const prBanner = explorer.locator('.bg-bg-secondary').first()
    await expect(prBanner).toBeVisible()

    // Should show ISSUE badge since this session has an issue linked
    await expect(prBanner.locator('text=ISSUE')).toBeVisible()

    // Refresh button still present
    const refreshBtn = prBanner.locator('button[title="Refresh PR status"]')
    await expect(refreshBtn).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-issue-badge-with-refresh.png'), {
      maxHeight: 350,
    })
    steps.push({
      screenshotPath: 'screenshots/02-issue-badge-with-refresh.png',
      caption: 'PR banner showing linked issue with refresh button',
      description:
        'When a session has a linked issue but no PR, the banner shows an ISSUE badge with the issue title. ' +
        'The refresh button is still visible — clicking it re-checks whether a PR has been created.',
    })
  })

  test('Step 3: Session with no PR and no issue — "No pull request" shown', async () => {
    // docs-site session is on main, no issue linked
    const session = page.locator('.cursor-pointer:has-text("docs-site")')
    await session.click()
    await expect(session).toHaveClass(/bg-accent\/15/)

    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    const prBanner = explorer.locator('.bg-bg-secondary').first()
    await expect(prBanner).toBeVisible()

    // Should show "No pull request" text instead of an empty gap
    await expect(prBanner.locator('text=No pull request')).toBeVisible()

    // Refresh button still present
    const refreshBtn = prBanner.locator('button[title="Refresh PR status"]')
    await expect(refreshBtn).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-no-pr-with-refresh.png'), {
      maxHeight: 350,
    })
    steps.push({
      screenshotPath: 'screenshots/03-no-pr-with-refresh.png',
      caption: 'PR banner shows "No pull request" instead of empty gap',
      description:
        'Previously, sessions with no PR would show an empty gap in the UI. Now the banner always ' +
        'renders with "No pull request" text and a refresh button, giving a consistent layout.',
    })
  })

  test('Step 4: Side-by-side comparison — all three states', async () => {
    // Go back to backend-api to show the OPEN PR state alongside the sidebar
    const session = page.locator('.cursor-pointer:has-text("backend-api")')
    await session.click()
    await expect(session).toHaveClass(/bg-accent\/15/)

    await openSourceControl()

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '04-sidebar-and-source-control.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/04-sidebar-and-source-control.png',
      caption: 'Sidebar session list alongside source control with PR status',
      description:
        'The full view showing the session list with branch status chips in the sidebar, and the ' +
        'source control panel with the always-visible PR status banner and refresh button.',
    })
  })
})
