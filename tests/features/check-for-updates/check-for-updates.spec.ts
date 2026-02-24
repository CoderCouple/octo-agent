/**
 * Feature Documentation: Check for Updates
 *
 * Exercises the update notification flow: sidebar banner, toolbar button,
 * update popover, download progress, and ready-to-install state.
 *
 * Run with: pnpm test:feature-docs check-for-updates
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
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

let electronApp: ElectronApplication
let page: Page
const steps: FeatureStep[] = []


test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
      SCREENSHOT_MODE: 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })

  // Wait for UI to initialize and update check to complete
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Check for Updates',
      description:
        'When an update is available, users see an update banner in the sidebar ' +
        'and an Update button in the toolbar. Clicking either opens a popover with ' +
        'release notes, download progress, and a restart button.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Check for Updates', () => {
  test('Step 1: Update banner appears in sidebar', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // The update banner should be visible with version info
    const banner = sidebar.locator('text=v0.9.0 available')
    await expect(banner).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-sidebar-banner.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-sidebar-banner.png',
      caption: 'Update banner appears at the top of the sidebar',
      description:
        'When a new version is available, a compact banner appears between the search box ' +
        'and the session list. It shows the new version number with View and Update buttons.',
    })
  })

  test('Step 2: Update button appears in toolbar', async () => {
    // The toolbar Update button should be visible
    const updateButton = page.locator('button:has-text("Update")', {
      hasText: 'Update',
    }).first()
    await expect(updateButton).toBeVisible()

    // Screenshot the toolbar area showing the Update button
    const toolbar = page.locator('[data-panel-id="sidebar"]').locator('..')
    await screenshotElement(page, updateButton, path.join(SCREENSHOTS, '02-toolbar-button.png'), {
      padding: 12,
    })
    steps.push({
      screenshotPath: 'screenshots/02-toolbar-button.png',
      caption: 'Update button in the toolbar with notification dot',
      description:
        'The toolbar shows a compact "Update" button with an accent-colored dot, ' +
        'indicating a new version is available.',
    })
  })

  test('Step 3: Clicking Update opens the popover', async () => {
    // Click the toolbar Update button to open the popover
    const updateButton = page.locator('button:has-text("Update")').first()
    await updateButton.click()
    await page.waitForTimeout(300)

    // The popover should show version info and release notes
    const popover = page.locator('.shadow-xl:has-text("Current version")')
    await expect(popover).toBeVisible()
    await expect(popover.locator('text=v0.9.0')).toBeVisible()

    await screenshotElement(page, popover, path.join(SCREENSHOTS, '03-update-popover.png'), {
      padding: 8,
    })
    steps.push({
      screenshotPath: 'screenshots/03-update-popover.png',
      caption: 'Update popover showing version info and release notes',
      description:
        'The popover displays the current version, the new version available, ' +
        'release notes, and a "Download Update" button.',
    })

    // Close the popover
    await page.locator('.fixed.inset-0.z-40').click()
    await page.waitForTimeout(300)
  })

  test('Step 4: Download progress state', async () => {
    // Simulate download in progress via the update store
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__updateStore as {
        setState: (state: Record<string, unknown>) => void
      }
      if (store) {
        store.setState({
          updateState: { status: 'downloading', percent: 42 },
        })
      }
    })
    await page.waitForTimeout(300)

    // The sidebar banner should show download progress
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const progressText = sidebar.locator('text=Downloading...')
    await expect(progressText).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '04-download-progress.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/04-download-progress.png',
      caption: 'Download progress shown in sidebar banner',
      description:
        'While the update downloads, the sidebar banner shows a progress bar with percentage. ' +
        'The toolbar popover also reflects this state.',
    })
  })

  test('Step 5: Ready to install state', async () => {
    // Simulate download complete
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__updateStore as {
        setState: (state: Record<string, unknown>) => void
      }
      if (store) {
        store.setState({
          updateState: { status: 'ready' },
        })
      }
    })
    await page.waitForTimeout(300)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const restartButton = sidebar.locator('text=Restart')
    await expect(restartButton).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '05-ready-to-install.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/05-ready-to-install.png',
      caption: 'Update downloaded and ready to install',
      description:
        'Once the download completes, the sidebar banner changes to show "Ready to install" ' +
        'with a "Restart" button. Clicking it restarts the app to apply the update.',
    })
  })
})
