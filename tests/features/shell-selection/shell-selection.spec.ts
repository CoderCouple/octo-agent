/**
 * Feature Documentation: Shell Selection
 *
 * Demonstrates the shell selection feature in Settings, and reproduces
 * a bug where the dropdown resets to the system default after closing
 * and reopening Settings.
 *
 * Run with: pnpm test:feature-docs shell-selection
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

test.setTimeout(60000)

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
      title: 'Shell Selection',
      description:
        'Users can choose which shell is used for terminal sessions via the Settings panel. ' +
        'This is especially useful on Windows where users may prefer Git Bash over PowerShell. ' +
        'This walkthrough also documents a bug where the dropdown resets to the system default ' +
        'after closing and reopening settings.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

/** Helper to open settings panel */
async function openSettings() {
  const settingsButton = page.locator('button[title^="Settings"]')
  await settingsButton.click()
  await page.waitForSelector('[data-panel-id="settings"]', { state: 'visible', timeout: 5000 })
  // Wait for shells to load (the async listShells call)
  await page.waitForSelector('[data-panel-id="settings"] select', { timeout: 5000 })
}

/** Helper to close settings panel */
async function closeSettings() {
  const settingsButton = page.locator('button[title^="Settings"]')
  await settingsButton.click()
  await page.waitForSelector('[data-panel-id="settings"]', { state: 'hidden', timeout: 5000 })
}

test.describe.serial('Feature: Shell Selection', () => {
  test('Step 1: Open settings — shell dropdown shows system default', async () => {
    await openSettings()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    const shellSelect = settingsPanel.locator('select')
    await expect(shellSelect).toBeVisible()

    // Verify the dropdown exists and shows the default shell
    const selectedValue = await shellSelect.inputValue()
    const options = await shellSelect.locator('option').allTextContents()
    expect(options.length).toBeGreaterThan(1)

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '01-initial-settings.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-initial-settings.png',
      caption: 'Settings panel with Terminal Shell dropdown showing system default',
      description:
        `The shell dropdown is visible with ${options.length} options. ` +
        `The currently selected shell is "${selectedValue}".`,
    })
  })

  test('Step 2: Change shell to Bash', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')
    const shellSelect = settingsPanel.locator('select')

    // Select Bash
    await shellSelect.selectOption('/bin/bash')
    await page.waitForTimeout(200)

    const selectedValue = await shellSelect.inputValue()
    expect(selectedValue).toBe('/bin/bash')

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '02-changed-to-bash.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-changed-to-bash.png',
      caption: 'Shell changed to Bash',
      description:
        'After selecting Bash from the dropdown, the value is now "/bin/bash". ' +
        'The store has been updated and a debounced save has been scheduled.',
    })
  })

  test('Step 3: Close settings and wait', async () => {
    await closeSettings()

    // Wait well beyond the 500ms save debounce
    await page.waitForTimeout(1500)

    steps.push({
      screenshotPath: 'screenshots/02-changed-to-bash.png', // reuse previous screenshot
      caption: 'Settings closed, waiting for save to complete',
      description:
        'Settings panel is closed. We wait 1.5 seconds to ensure the debounced save has completed.',
    })
  })

  test('Step 4: Reopen settings — BUG: dropdown shows system default instead of Bash', async () => {
    await openSettings()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    const shellSelect = settingsPanel.locator('select')
    await expect(shellSelect).toBeVisible()

    const selectedValue = await shellSelect.inputValue()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '03-reopened-bug.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-reopened-bug.png',
      caption: `BUG: After reopening, dropdown shows "${selectedValue}" instead of "/bin/bash"`,
      description:
        'After closing and reopening settings, the shell dropdown has reverted to showing ' +
        'the system default shell instead of the user\'s chosen "/bin/bash". ' +
        'The root cause: loadRepos() re-reads config on mount, and the select value expression ' +
        'falls back to availableShells.find((s) => s.isDefault) when defaultShell is empty.',
    })

    await closeSettings()
  })
})
