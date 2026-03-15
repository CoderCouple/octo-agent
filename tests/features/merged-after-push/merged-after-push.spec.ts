/**
 * Feature Documentation: Merged After Push
 *
 * Demonstrates that a session transitions out of "merged" state when new work
 * is done on the branch after a PR was merged. This enables developers to keep
 * working on the same branch and create multiple PRs over time.
 *
 * Run with: pnpm test:feature-docs
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { ElectronApplication, Page } from '@playwright/test'
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
let electronApp: ElectronApplication
const steps: FeatureStep[] = []

/** Open the explorer panel and switch to source control view */
async function openSourceControl(p: Page): Promise<void> {
  const explorerButton = p.locator('button:has-text("Explorer")')
  const explorerClasses = await explorerButton.getAttribute('class').catch(() => '')
  if (!explorerClasses?.includes('bg-accent')) {
    await explorerButton.click()
    await expect(p.locator('[data-panel-id="explorer"]')).toBeVisible()
  }

  await p.evaluate(() => {
    // @ts-expect-error — accessing Zustand store from devtools global
    const store = window.__zustand_session_store
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  // Wait for either "Changes" or the PR banner to appear (depends on git state)
  await expect(
    p.locator('[data-panel-id="explorer"]').locator('.border-b').first()
  ).toBeVisible({ timeout: 5000 })
}

/** Set mock env vars on the main process without reloading */
async function setMockEnv(app: ElectronApplication, env: Record<string, string>): Promise<void> {
  await app.evaluate((_electron, envVars) => {
    for (const [key, val] of Object.entries(envVars)) {
      if (val) process.env[key] = val
      else delete process.env[key]
    }
  }, env)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Merged After Push — New PR Lifecycle',
      description:
        'When a PR has been merged, any subsequent changes on the same branch transition the session ' +
        'out of "merged" state back into a normal working state. This allows developers to keep working ' +
        'on a long-lived branch and create multiple PRs over time, rather than being stuck in a ' +
        'permanent "merged" state.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Merged After Push', () => {
  test('Step 1: PR is open — normal working state with OPEN badge', async () => {
    // Start with marketing scenario: backend-api on feature/jwt-auth with OPEN PR
    ;({ page, electronApp } = await resetApp({
      scenario: 'marketing',
      mockPrState: 'OPEN',
      mockGitClean: true,
      mockHasBranchCommits: true,
      mockGitTracking: 'origin/feature/jwt-auth',
    }))

    // Select the backend-api session (first session in marketing scenario)
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toBeVisible()
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    await openSourceControl(page)

    // Verify the OPEN PR badge is visible
    const explorer = page.locator('[data-panel-id="explorer"]')
    const openBadge = explorer.locator('span', { hasText: /^OPEN$/ })
    await expect(openBadge).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-pr-open.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-pr-open.png',
      caption: 'PR is open — normal working state',
      description:
        'The source control view shows the PR with an OPEN badge. ' +
        'The session is in a normal working state with the PR linked.',
    })
  })

  test('Step 2: PR is merged — session shows MERGED badge', async () => {
    // Simulate: PR was merged on GitHub, branch content is now in main
    ;({ page, electronApp } = await resetApp({
      scenario: 'marketing',
      mockPrState: 'MERGED',
      mockIsMerged: true,
      mockHasBranchCommits: true,
      mockGitClean: true,
      mockGitTracking: 'origin/feature/jwt-auth',
    }))

    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    await openSourceControl(page)

    const explorer = page.locator('[data-panel-id="explorer"]')
    // Wait for PR loading to complete and show the MERGED badge
    const mergedBadge = explorer.locator('span', { hasText: /^MERGED$/ }).first()
    await expect(mergedBadge).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-pr-merged.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-pr-merged.png',
      caption: 'PR was merged — session shows MERGED state',
      description:
        'After the PR is merged on GitHub, the source control view shows a MERGED badge. ' +
        'The session is in "merged" state. Previously, the session would stay stuck here permanently.',
    })
  })

  test('Step 3: New work after merge — session transitions to in-progress with Create PR available', async () => {
    // Simulate: developer makes new commits on the same branch after the merge
    // The GitHub API still returns the old merged PR, but the branch has new work
    ;({ page, electronApp } = await resetApp({
      scenario: 'marketing',
      mockPrState: 'MERGED',        // GitHub still returns old merged PR
      mockIsMerged: false,           // New commits mean branch HEAD is not in main
      mockHasBranchCommits: true,
      mockGitClean: false,           // Use scenario's default files (uncommitted changes)
      mockGitTracking: 'origin/feature/jwt-auth',
    }))

    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    await openSourceControl(page)

    const explorer = page.locator('[data-panel-id="explorer"]')

    // The old merged PR banner still shows for reference
    const mergedBadge = explorer.locator('span', { hasText: /^MERGED$/ }).first()
    await expect(mergedBadge).toBeVisible({ timeout: 10000 })

    // But now the Create PR button should be available since no-pr treats MERGED as no active PR
    const createPrButton = explorer.locator('button', { hasText: 'Create PR' })
    await expect(createPrButton).toBeVisible({ timeout: 10000 })

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-new-work-create-pr.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-new-work-create-pr.png',
      caption: 'New work after merge — Create PR button appears',
      description:
        'After making new changes on the branch, the session transitions out of "merged" state. ' +
        'The old merged PR is still shown for reference, but the "Create PR" button is now available, ' +
        'allowing the developer to create a new PR for the additional work. ' +
        'This enables a workflow where developers keep working on the same branch and create multiple PRs.',
    })
  })
})
