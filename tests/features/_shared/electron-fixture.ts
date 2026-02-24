/**
 * Shared Electron fixture for feature documentation tests.
 *
 * Launches one Electron instance per Playwright worker and reuses it across
 * feature specs. Each feature calls `resetApp(page)` in beforeAll to reload
 * the renderer, giving a fresh React/Zustand state without the ~5s cost of
 * a full Electron relaunch.
 *
 * Usage in feature specs:
 *
 *   import { test, expect, electronApp, appPage, resetApp } from '../_shared/electron-fixture'
 *
 *   let page: Page
 *   test.beforeAll(async () => {
 *     page = await resetApp()
 *   })
 */
import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let sharedApp: ElectronApplication | null = null
let sharedPage: Page | null = null

/**
 * Launch the shared Electron app (once per worker).
 */
async function getOrLaunchApp(): Promise<{ electronApp: ElectronApplication; page: Page }> {
  if (sharedApp && sharedPage) {
    return { electronApp: sharedApp, page: sharedPage }
  }

  sharedApp = await electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  sharedPage = await sharedApp.firstWindow()
  await sharedPage.setViewportSize({ width: 1400, height: 900 })
  await sharedPage.waitForLoadState('domcontentloaded')
  await sharedPage.waitForSelector('#root > div', { timeout: 15000 })
  // Wait for sessions to load (sidebar renders session cards with cursor-pointer)
  await sharedPage.waitForSelector('.cursor-pointer', { timeout: 10000 })

  return { electronApp: sharedApp, page: sharedPage }
}

/**
 * Reload the renderer to get fresh app state for a new feature.
 * Returns the page for convenience.
 */
let isFirstCall = true

export async function resetApp(): Promise<{ electronApp: ElectronApplication; page: Page }> {
  const { electronApp, page } = await getOrLaunchApp()

  if (isFirstCall) {
    // First call — app is already fresh from launch, no reload needed
    isFirstCall = false
  } else {
    // Subsequent calls — reload renderer to reset React/Zustand state
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#root > div', { timeout: 15000 })
    // Wait for sessions to load from main process (sidebar renders session cards)
    await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
  }

  return { electronApp, page }
}

/**
 * Close the shared Electron app. Called automatically by global teardown,
 * but can also be called manually.
 */
export async function closeApp(): Promise<void> {
  if (sharedApp) {
    await sharedApp.close()
    sharedApp = null
    sharedPage = null
  }
}

// Re-export test and expect for convenience
export { base as test, electron }
export { expect } from '@playwright/test'
export type { ElectronApplication, Page } from '@playwright/test'
