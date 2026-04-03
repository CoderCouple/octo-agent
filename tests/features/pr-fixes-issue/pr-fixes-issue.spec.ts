/**
 * Feature Documentation: PR Fixes Issue & Template Variables
 *
 * Shows how the "Create PR" action automatically includes "Fixes #N" in the
 * PR body when a session is linked to a GitHub issue, and how the commands
 * editor documents available template variables via a clickable hint popup.
 *
 * Run with: pnpm test:feature-docs pr-fixes-issue
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

/** Navigate the explorer panel to the source-control tab */
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

/** Open the commands editor via the session store */
async function openCommandsEditor() {
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => {
        activeSessionId: string
        sessions: { id: string; directory: string }[]
        openCommandsEditor: (sessionId: string, directory: string) => void
      }
    }
    if (!store) return
    const state = store.getState()
    const session = state.sessions.find((s: { id: string }) => s.id === state.activeSessionId)
    if (session) state.openCommandsEditor(state.activeSessionId, session.directory)
  })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'PR Fixes Issue & Template Variables Hint',
      description:
        'When a session is created from a GitHub issue, the "Create PR" action automatically ' +
        'includes "Fixes #<issue>" at the top of the PR body so GitHub links and auto-closes ' +
        'the issue. The commands editor also shows a "Template variables" hint below each ' +
        'prompt textarea — clicking it reveals a popup listing all available variables ' +
        '({main}, {branch}, {directory}, {issueNumber}).',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: PR Fixes Issue & Template Variables', () => {
  test('Step 1: Session linked to issue — source control shows issue badge', async () => {
    // Session 1 (octoagent) has issueNumber: 42
    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    const issueBadge = explorer.locator('span', { hasText: /^ISSUE$/ })
    await expect(issueBadge).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-issue-linked-session.png'), {
      maxHeight: 350,
    })
    steps.push({
      screenshotPath: 'screenshots/01-issue-linked-session.png',
      caption: 'Session linked to issue #42 in source control',
      description:
        'The "octoagent" session was created from GitHub issue #42. The source control ' +
        'banner shows an ISSUE badge with the issue number and title. When this session ' +
        'creates a PR, the {issueNumber} template variable resolves to "42".',
    })
  })

  test('Step 2: Open commands editor and find Create PR action', async () => {
    await openCommandsEditor()

    // Wait for the commands editor to load and show action cards
    const createPrHeader = page.locator('[data-testid="action-header-create-pr"]')
    await expect(createPrHeader).toBeVisible({ timeout: 5000 })

    // Screenshot the commands editor showing the action list
    const editorPanel = page.locator('[data-panel-id="fileViewer"]')
    await screenshotElement(page, editorPanel, path.join(SCREENSHOTS, '02-commands-editor.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-commands-editor.png',
      caption: 'Commands editor with action list including Create PR',
      description:
        'The commands editor shows all configured actions. Each card displays the action ' +
        'label, type badge (agent/shell), and style. The "Create PR" action is an agent-type ' +
        'action whose prompt now includes the {issueNumber} template variable.',
    })
  })

  test('Step 3: Expand Create PR to see Fixes #{issueNumber} instruction', async () => {
    // Expand the Create PR action card
    const createPrHeader = page.locator('[data-testid="action-header-create-pr"]')
    await createPrHeader.click()

    // Expand the generic prompt variant
    const genericVariant = page.locator('[data-testid="variant-generic-create-pr"]')
    await expect(genericVariant).toBeVisible()
    await genericVariant.click()

    // The prompt textarea should contain {issueNumber}
    const promptTextarea = page.locator('[data-testid="action-prompt-create-pr"]')
    await expect(promptTextarea).toBeVisible()
    const promptValue = await promptTextarea.inputValue()
    expect(promptValue).toContain('Fixes #{issueNumber}')

    // Screenshot the expanded prompt area
    const actionCard = createPrHeader.locator('xpath=ancestor::div[contains(@class, "rounded border")]').first()
    await screenshotElement(page, actionCard, path.join(SCREENSHOTS, '03-create-pr-prompt.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-create-pr-prompt.png',
      caption: 'Create PR prompt with Fixes #{issueNumber} instruction',
      description:
        'The expanded "Create PR" prompt instructs the agent to check for a linked issue. ' +
        'When {issueNumber} is present, the first line of the PR body must be ' +
        '"Fixes #<number>" — GitHub auto-closes the issue when the PR is merged.',
    })
  })

  test('Step 4: Click template variables hint to see available variables', async () => {
    // Find and click the template variables hint
    const hint = page.locator('[data-testid="template-vars-hint"]').first()
    await expect(hint).toBeVisible()
    await hint.click()

    // The popup should show all four template variables
    await expect(page.locator('td:text-is("{main}")')).toBeVisible()
    await expect(page.locator('td:text-is("{branch}")')).toBeVisible()
    await expect(page.locator('td:text-is("{directory}")')).toBeVisible()
    await expect(page.locator('td:text-is("{issueNumber}")')).toBeVisible()

    // Screenshot the popup
    const popup = page.locator('.shadow-lg:has(table)').first()
    await screenshotElement(page, popup, path.join(SCREENSHOTS, '04-template-vars-popup.png'))
    steps.push({
      screenshotPath: 'screenshots/04-template-vars-popup.png',
      caption: 'Template variables popup listing all available variables',
      description:
        'Clicking "Template variables" below the prompt textarea reveals a popup listing ' +
        'the four available variables: {main} (default branch), {branch} (current branch), ' +
        '{directory} (repo path), and {issueNumber} (linked issue, empty if none). ' +
        'These are replaced at runtime before the prompt is sent to the agent.',
    })
  })

  test('Step 5: Template variables hint in context below prompt', async () => {
    // Close the popup by clicking elsewhere
    await page.mouse.click(10, 10)

    // Wait for popup to close, then verify hint link is still visible
    await expect(page.locator('.shadow-lg:has(table)')).not.toBeVisible()
    const hint = page.locator('[data-testid="template-vars-hint"]').first()
    await expect(hint).toBeVisible()

    // Screenshot the bottom of the expanded card showing the hint link
    const createPrHeader = page.locator('[data-testid="action-header-create-pr"]')
    const actionCard = createPrHeader.locator('xpath=ancestor::div[contains(@class, "rounded border")]').first()
    await screenshotElement(page, actionCard, path.join(SCREENSHOTS, '05-hint-in-context.png'), {
      maxHeight: 350,
    })
    steps.push({
      screenshotPath: 'screenshots/05-hint-in-context.png',
      caption: 'Template variables hint link below the prompt textarea',
      description:
        'The "Template variables" link appears as subtle hint text below every prompt ' +
        'textarea in the commands editor — for both agent prompts and shell commands. ' +
        'This helps users discover available variables when writing custom action prompts.',
    })
  })
})
