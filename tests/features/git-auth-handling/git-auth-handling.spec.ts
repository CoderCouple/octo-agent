/**
 * Feature Documentation: Git Authentication Error Handling
 *
 * Shows how OctoAgent guides users through git authentication failures.
 * When a push, pull, or clone fails due to missing credentials,
 * the UI shows a "Set up Git Authentication" button that opens an
 * inline terminal for `gh auth login`. This flow is available in
 * the New Branch dialog, Clone dialog, and source control panel.
 *
 * Run with: pnpm test:feature-docs git-auth-handling
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, ElectronApplication } from '@playwright/test'
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

/** Replace an IPC handler in the main process to return a custom response. */
async function overrideIpcHandler(channel: string, response: unknown) {
  await electronApp.evaluate(({ ipcMain }, { ch, resp }) => {
    ipcMain.removeHandler(ch)
    ipcMain.handle(ch, () => resp)
  }, { ch: channel, resp: response })
}

/** Restore an IPC handler to its original E2E mock (returns { success: true }). */
async function restoreIpcHandler(channel: string) {
  await electronApp.evaluate(({ ipcMain }, ch) => {
    ipcMain.removeHandler(ch)
    ipcMain.handle(ch, () => ({ success: true }))
  }, channel)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  // Restore overridden handlers
  await restoreIpcHandler('git:pushNewBranch')
  await restoreIpcHandler('git:clone')

  await generateFeaturePage(
    {
      title: 'Git Authentication Error Handling',
      description:
        'When git operations fail due to authentication issues (missing credentials, ' +
        'terminal prompts disabled), OctoAgent shows a friendly "Set up Git Authentication" button ' +
        'instead of a raw error. Clicking it opens an inline terminal to run `gh auth login`. ' +
        'When git identity (user.name/email) or merge mode is not configured, an inline form ' +
        'lets the user set these values. This guidance appears in the New Branch dialog, Clone dialog, and source control panel.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

// Helper to open the New Session dialog
async function openNewSessionDialog() {
  const newSessionBtn = page.locator('button:has-text("+ New Session")')
  await newSessionBtn.click()
  await expect(page.locator('h2:has-text("New Session")')).toBeVisible()
}

test.describe.serial('Feature: Git Auth Error Handling', () => {
  test('Step 1: New Branch dialog shows auth guidance on push failure', async () => {
    // Navigate to New Branch view
    await openNewSessionDialog()
    await page.locator('button[title="Create a new branch worktree"]').click()
    await expect(page.locator('h2:has-text("New Branch")')).toBeVisible()

    // Type a branch name
    const branchInput = page.locator('input[placeholder*="feature/"]')
    await branchInput.fill('feature/my-fix')

    // Override pushNewBranch IPC handler to return an auth error
    await overrideIpcHandler('git:pushNewBranch', {
      success: false,
      error: "Pushing to https://github.com/user/repo.git\nfatal: could not read Username for 'https://github.com': terminal prompts disabled",
    })

    // Click Create Branch to trigger the error
    await page.locator('button:has-text("Create Branch")').click()

    // Wait for the auth setup button to appear
    await expect(page.locator('button:has-text("Set up Git Authentication")')).toBeVisible({ timeout: 5000 })

    // Screenshot the dialog showing the error and auth button
    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-new-branch-auth-error.png'))
    steps.push({
      screenshotPath: 'screenshots/01-new-branch-auth-error.png',
      caption: 'New Branch dialog with authentication error and setup button',
      description:
        'When pushing a new branch fails due to missing git credentials, the dialog shows ' +
        'a yellow "Set up Git Authentication" button below the error. Clicking it opens an ' +
        'inline terminal to run gh auth login.',
    })

    // Restore handler and close the dialog
    await restoreIpcHandler('git:pushNewBranch')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })

  test('Step 2: New Branch dialog shows identity setup on identity error', async () => {
    // Navigate to New Branch view
    await openNewSessionDialog()
    await page.locator('button[title="Create a new branch worktree"]').click()
    await expect(page.locator('h2:has-text("New Branch")')).toBeVisible()

    // Type a branch name
    const branchInput = page.locator('input[placeholder*="feature/"]')
    await branchInput.fill('feature/identity-test')

    // Override pushNewBranch to return an identity error
    await overrideIpcHandler('git:pushNewBranch', {
      success: false,
      error: "fatal: Please tell me who you are.\n\nRun\n  git config --global user.email \"you@example.com\"\n  git config --global user.name \"Your Name\"",
    })

    // Click Create Branch to trigger the error
    await page.locator('button:has-text("Create Branch")').click()

    // Wait for the identity form to appear
    await expect(page.locator('input[placeholder="Your Name"]')).toBeVisible({ timeout: 5000 })

    // Screenshot the dialog with identity form
    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-identity-error.png'))
    steps.push({
      screenshotPath: 'screenshots/02-identity-error.png',
      caption: 'New Branch dialog with git identity setup form',
      description:
        'When git operations fail because user.name and user.email are not set, the dialog shows ' +
        'an inline form for entering git identity. Saving writes git config --global values.',
    })

    // Restore handler and close the dialog
    await restoreIpcHandler('git:pushNewBranch')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })

  test('Step 3: Clone dialog shows auth guidance on clone failure', async () => {
    // Navigate to Clone view
    await openNewSessionDialog()
    await page.locator('button:has-text("Clone")').click()
    await expect(page.locator('h2:has-text("Clone Repository")')).toBeVisible()

    // Fill in the URL
    const urlInput = page.locator('input[placeholder*="https://github.com"]')
    await urlInput.fill('https://github.com/user/private-repo.git')

    // Override clone IPC handler to return auth error
    await overrideIpcHandler('git:clone', {
      success: false,
      error: "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
    })

    // Click Clone to trigger the error
    await page.locator('button:has-text("Clone")').click()

    // Wait for the auth setup button
    await expect(page.locator('button:has-text("Set up Git Authentication")')).toBeVisible({ timeout: 5000 })

    // Screenshot the clone dialog with auth error
    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-clone-auth-error.png'))
    steps.push({
      screenshotPath: 'screenshots/02-clone-auth-error.png',
      caption: 'Clone dialog with authentication error and setup button',
      description:
        'The Clone dialog shows the same authentication guidance. The "Set up Git Authentication" ' +
        'button and "Retry Clone" flow help users who have not yet configured git credentials ' +
        'on a fresh machine.',
    })

    // Restore handler and close the dialog
    await restoreIpcHandler('git:clone')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })
})
