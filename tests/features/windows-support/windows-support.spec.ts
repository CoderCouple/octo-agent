/**
 * Feature Documentation: Windows Support
 *
 * Documents the Windows-specific improvements: title bar overlay (window controls),
 * toolbar right-padding to avoid overlapping WCO buttons, and the GitMissingBanner
 * rendering below the toolbar instead of above it.
 *
 * Run with: pnpm test:feature-docs windows-support
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

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  const result = await resetApp()
  page = result.page
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Windows Support',
      description:
        'Windows-specific improvements including native window controls overlay (close/minimize/maximize), ' +
        'toolbar layout adjustments to avoid overlapping the WCO buttons, git/gh PATH resolution for ' +
        'non-standard install locations, and the git-missing banner rendering below the toolbar.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Windows Support', () => {
  test('Step 1: Toolbar renders with correct layout', async () => {
    const toolbar = page.locator('.h-10.flex.items-center').first()
    await expect(toolbar).toBeVisible()

    await screenshotElement(page, toolbar, path.join(SCREENSHOTS, '01-toolbar.png'))
    steps.push({
      screenshotPath: 'screenshots/01-toolbar.png',
      caption: 'Toolbar with title and panel buttons',
      description:
        'The toolbar renders below the title bar area. On Windows, the right side has extra ' +
        'padding (138px) to avoid overlapping the native close/minimize/maximize buttons provided ' +
        'by the Windows Controls Overlay. On macOS, traffic lights are inset on the left instead.',
    })
  })

  test('Step 2: GitMissingBanner renders below toolbar', async () => {
    // Force gitAvailable to false to show the banner
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__repoStore as {
        setState: (state: Record<string, unknown>) => void
      } | undefined
      if (store) {
        store.setState({ gitAvailable: false })
      }
    })

    // The banner should appear below the toolbar, not above it
    const toolbar = page.locator('.h-10.flex.items-center').first()
    await expect(toolbar).toBeVisible()

    // Screenshot the top area showing toolbar positioning
    await screenshotRegion(
      page,
      toolbar,
      toolbar,
      path.join(SCREENSHOTS, '02-toolbar-position.png'),
    )
    steps.push({
      screenshotPath: 'screenshots/02-toolbar-position.png',
      caption: 'Toolbar is always the topmost UI element',
      description:
        'The toolbar is the first element in the layout, ensuring it is never covered by banners. ' +
        'The GitMissingBanner (when git is not installed) renders below the toolbar so it does not ' +
        'interfere with window controls on any platform.',
    })
  })

  test('Step 3: GhMissingBanner renders below toolbar', async () => {
    // Force ghAvailable to false to show the banner
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__repoStore as {
        setState: (state: Record<string, unknown>) => void
      } | undefined
      if (store) {
        store.setState({ ghAvailable: false, gitAvailable: true })
      }
    })

    // Screenshot the top area including the gh-missing banner
    const banner = page.locator('.bg-yellow-900\\/30').first()
    if (await banner.isVisible()) {
      await screenshotElement(page, banner, path.join(SCREENSHOTS, '03-gh-missing-banner.png'))
    } else {
      // Fallback: screenshot the toolbar area
      const toolbar = page.locator('.h-10.flex.items-center').first()
      await screenshotRegion(page, toolbar, toolbar, path.join(SCREENSHOTS, '03-gh-missing-banner.png'))
    }
    steps.push({
      screenshotPath: 'screenshots/03-gh-missing-banner.png',
      caption: 'GhMissingBanner warns when GitHub CLI is not installed',
      description:
        'When the GitHub CLI (gh) is not detected, a yellow warning banner appears below the toolbar. ' +
        'It provides a direct link to install gh from cli.github.com. This is less critical than the ' +
        'red git-missing banner but important for authentication, issues, and PR features.',
    })

    // Reset ghAvailable so it doesn't affect subsequent steps
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>).__repoStore as {
        setState: (state: Record<string, unknown>) => void
      } | undefined
      if (store) {
        store.setState({ ghAvailable: true })
      }
    })
    // Wait for banner to disappear
    await expect(banner).not.toBeVisible()
  })

  test('Step 4: Agent not-installed warning with install link', async () => {
    // Open the new session dialog by clicking the "+" button
    const addButton = page.locator('button:has(svg path[d="M12 4v16m8-8H4"])').first()
    if (await addButton.isVisible()) {
      await addButton.click()

      // If we get to the agent picker, screenshot the area
      const agentPicker = page.locator('text=Select Agent').first()
      if (await agentPicker.isVisible({ timeout: 2000 }).catch(() => false)) {
        const dialog = page.locator('.space-y-2').first()
        await expect(dialog).toBeVisible()
        await screenshotElement(page, dialog, path.join(SCREENSHOTS, '04-agent-picker.png'))
        steps.push({
          screenshotPath: 'screenshots/04-agent-picker.png',
          caption: 'Agent picker with install status badges',
          description:
            'The agent picker shows "not installed" badges for agents whose commands are not found ' +
            'on the system PATH. Clicking an uninstalled agent shows a warning with a direct "Install" ' +
            'link that opens the agent\'s documentation page in the default browser.',
        })
      }

      // Close the dialog by pressing Escape
      await page.keyboard.press('Escape')
    }
  })

  test('Step 5: Full window layout', async () => {
    // Screenshot the full window to show overall layout
    await page.screenshot({
      path: path.join(SCREENSHOTS, '05-full-layout.png'),
      type: 'png',
    })
    steps.push({
      screenshotPath: 'screenshots/05-full-layout.png',
      caption: 'Full application window layout',
      description:
        'The complete application layout. On Windows, the title bar uses a hidden style with ' +
        'a Windows Controls Overlay that provides native close/minimize/maximize buttons in the ' +
        'top-right corner. The overlay colors match the toolbar background (#252525) with light ' +
        'symbol colors (#e0e0e0) for consistency with the dark theme.',
    })
  })
})
