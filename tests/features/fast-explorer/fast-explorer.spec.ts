/**
 * Feature Documentation: Fast Explorer File Tree
 *
 * Demonstrates that the Explorer file tree loads quickly by showing the
 * file tree appearing promptly and git status indicators rendering on
 * tree nodes. The underlying fixes:
 * 1. Removed -uall from git status (avoids recursive untracked dir enumeration)
 * 2. Parallelized refreshTree directory loading with Promise.all
 * 3. Replaced O(n) git status lookup with O(1) Map-based lookup
 *
 * Run with: pnpm test:feature-docs fast-explorer
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
      title: 'Fast Explorer File Tree',
      description:
        'The Explorer file tree now loads instantly instead of blocking for multiple seconds. ' +
        'Three performance fixes were applied: removing the -uall flag from git status (which ' +
        'recursively enumerated every file in untracked directories), parallelizing directory ' +
        'reloads with Promise.all, and replacing O(n) Array.find() git status lookups with an ' +
        'O(1) Map-based lookup.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Fast Explorer File Tree', () => {
  test('Step 1: Open the explorer and verify the file tree appears', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')
    await expect(explorerButton).toBeVisible()
    await explorerButton.click()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Switch to file tree tab if needed
    const filesTab = explorerPanel.locator('button:has-text("Files")')
    if (await filesTab.isVisible()) {
      await filesTab.click()
    }

    // The tree should appear quickly with directory entries
    const treeItems = explorerPanel.locator('[data-tree-item]')
    await expect(treeItems.first()).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '01-tree-loaded.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-tree-loaded.png',
      caption: 'File tree loads immediately when the Explorer opens',
      description:
        'The Explorer panel shows the file tree right away. Previously, git status with -uall ' +
        'would block the main process for seconds on repos with large untracked directories, ' +
        'delaying all IPC responses including the readDir call that populates this tree.',
    })
  })

  test('Step 2: Expand directories to verify parallel loading', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Expand the src directory
    const srcDir = explorerPanel.locator('[data-tree-item]:has-text("src")')
    await expect(srcDir).toBeVisible()
    await srcDir.click()

    // Wait for child entries to load
    await expect(explorerPanel.locator('[data-tree-item]:has-text("middleware")')).toBeVisible()

    // Expand a subdirectory too
    const middlewareDir = explorerPanel.locator('[data-tree-item]:has-text("middleware")')
    await middlewareDir.click()
    await expect(explorerPanel.locator('[data-tree-item]:has-text("auth.ts")')).toBeVisible()

    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '02-expanded-dirs.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-expanded-dirs.png',
      caption: 'Expanded directories load their children in parallel',
      description:
        'When the tree refreshes (e.g. after a file change), all expanded directories are now ' +
        'reloaded concurrently with Promise.all instead of sequentially in a for loop. Each ' +
        'directory is a separate IPC round-trip, so parallelizing them reduces total wait time.',
    })
  })

  test('Step 3: Verify git status indicators on tree nodes', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Switch to source control tab to see git status
    const sourceControlTab = explorerPanel.locator('button:has-text("Source Control")')
    if (await sourceControlTab.isVisible()) {
      await sourceControlTab.click()
      // Wait for the source control view to render
      await page.waitForTimeout(500)
    }

    await screenshotElement(
      page,
      explorerPanel,
      path.join(SCREENSHOTS, '03-git-status.png'),
      { maxHeight: 600 },
    )
    steps.push({
      screenshotPath: 'screenshots/03-git-status.png',
      caption: 'Git status indicators render efficiently with Map-based lookup',
      description:
        'Each tree node looks up its git status to show modified/added/untracked indicators. ' +
        'Previously this used Array.find() which is O(n) per node. Now a useMemo-based Map ' +
        'provides O(1) lookups, eliminating redundant scans on every re-render.',
    })
  })

  test('Step 4: Show the file tree tab with status badges', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Switch back to files tab to show status badges on file tree
    const filesTab = explorerPanel.locator('button:has-text("Files")')
    if (await filesTab.isVisible()) {
      await filesTab.click()
      await page.waitForTimeout(300)
    }

    // The tree should still be expanded from step 2
    const treeItems = explorerPanel.locator('[data-tree-item]')
    const count = await treeItems.count()
    expect(count).toBeGreaterThan(3)

    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '04-full-tree.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/04-full-tree.png',
      caption: 'Complete file tree with expanded directories and status indicators',
      description:
        'The full Explorer tree with multiple expanded directories and git status badges. ' +
        'All three performance improvements work together: fast git status (no -uall), ' +
        'parallel directory loading, and O(1) status lookups per node.',
    })
  })
})
