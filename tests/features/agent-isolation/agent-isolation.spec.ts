/**
 * Feature Documentation: Repo-Level Docker Isolation
 *
 * Demonstrates per-repo Docker isolation and auto-approve settings.
 * Exercises the settings UI flow (repo settings, agent auto-approve flag)
 * and the mixed local/container terminal tabs.
 *
 * Run with: pnpm test:feature-docs agent-isolation
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

/** Helper to open settings panel */
async function openSettings() {
  const settingsButton = page.locator('button[title^="Settings"]')
  await settingsButton.click()
  await page.waitForSelector('[data-panel-id="settings"]', { state: 'visible', timeout: 5000 })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Repo-Level Docker Isolation',
      description:
        'Broomy supports optional Docker-based container isolation configured per repository. ' +
        'When enabled, agent sessions run inside Docker containers with access only to the repo ' +
        'directory. Agents can define an auto-approve flag that gets appended to the command when ' +
        'the repo has auto-approve enabled. Terminal tabs can be either local or container-based.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Repo-Level Docker Isolation', () => {
  test('Step 1: Open settings — view agents with auto-approve flag field', async () => {
    await openSettings()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    // Wait for agents section to render
    await expect(settingsPanel.locator('text=Agents')).toBeVisible()

    // Verify agents exist
    await expect(settingsPanel.locator('text=Claude Code')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '01-settings-agents.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/01-settings-agents.png',
      caption: 'Agent list in settings — isolation is now configured per-repo, not per-agent',
      description:
        'The settings panel shows all configured agents. Agent rows show an "auto" badge ' +
        'when the agent has a skip-approval flag defined. Isolation settings have moved to ' +
        'per-repo configuration below.',
    })
  })

  test('Step 2: Edit agent to see skip-approval flag field', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Click the edit button on Claude Code agent row
    const claudeRow = settingsPanel.locator('div:has(> div > div > .font-medium:text-is("Claude Code"))')
    const editButton = claudeRow.locator('button[title="Edit agent"]')
    await editButton.click()

    // Wait for edit form to appear
    await expect(settingsPanel.locator('input[value="Claude Code"]')).toBeVisible({ timeout: 3000 })

    // Verify the auto-approve flag input is visible
    await expect(settingsPanel.locator('text=Auto-approve flag')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '02-agent-edit-form.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/02-agent-edit-form.png',
      caption: 'Agent edit form with auto-approve flag text input',
      description:
        'The agent edit form now has a simple text input for the auto-approve flag ' +
        '(e.g., "--dangerously-skip-permissions"). This flag is appended to the command ' +
        'when the repo has auto-approve enabled. Isolation checkboxes have been removed ' +
        'from the agent form — they live in repo settings now.',
    })

    // Cancel the edit
    const cancelButton = settingsPanel.locator('button:text-is("Cancel")')
    await cancelButton.click()
  })

  test('Step 3: Scroll to repos section and click edit on a repo', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Wait for repos section
    await expect(settingsPanel.locator('text=Repositories')).toBeVisible()

    // Find the edit button for the demo-project repo
    const editButton = settingsPanel.locator('button[title="Edit repo settings"]').first()
    await expect(editButton).toBeVisible()
    await editButton.click()

    // Wait for repo settings editor to appear
    await expect(settingsPanel.locator('text=Run agent in isolated Docker container')).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '03-repo-settings.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/03-repo-settings.png',
      caption: 'Repo settings editor with Docker isolation and auto-approve checkboxes',
      description:
        'Clicking edit on a repository opens the repo settings editor. Below the default agent ' +
        'selector and push-to-main checkbox, two new isolation settings appear: ' +
        '"Run agent in isolated Docker container" and "Auto-approve agent commands".',
    })
  })

  test('Step 4: Enable Docker isolation — image input and status appear', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Check the Docker isolation checkbox
    const isolationCheckbox = settingsPanel.locator('label:has-text("Run agent in isolated Docker container") input[type="checkbox"]')
    await isolationCheckbox.check()

    // Docker image input should appear
    const imageInput = settingsPanel.locator('input[placeholder="broomy/isolation:latest"]')
    await expect(imageInput).toBeVisible({ timeout: 3000 })

    // Docker status indicator should appear (mocked as available in E2E)
    await expect(settingsPanel.locator('text=Docker available')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '04-isolation-enabled.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/04-isolation-enabled.png',
      caption: 'Docker isolation enabled — image input and green status indicator',
      description:
        'After checking "Run agent in isolated Docker container", a Docker image input field appears ' +
        'with a placeholder of "broomy/isolation:latest". A green status dot shows ' +
        '"Docker available", confirming Docker is detected on the system.',
    })
  })

  test('Step 5: Enable auto-approve with isolation — no warning shown', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Check auto-approve
    const skipCheckbox = settingsPanel.locator('label:has-text("Auto-approve agent commands") input[type="checkbox"]')
    await skipCheckbox.check()

    // No warning should show since Docker isolation is also enabled
    await expect(settingsPanel.locator('text=unrestricted access')).not.toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '05-auto-approve-safe.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/05-auto-approve-safe.png',
      caption: 'Auto-approve enabled with Docker isolation — safe, no warning',
      description:
        'With both Docker isolation and auto-approve enabled, no warning is shown. ' +
        'This is the recommended safe configuration: agents run at full speed inside ' +
        'a sandboxed container.',
    })
  })

  test('Step 6: Uncheck Docker — warning appears for unsafe auto-approve', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Uncheck Docker isolation while auto-approve remains checked
    const isolationCheckbox = settingsPanel.locator('label:has-text("Run agent in isolated Docker container") input[type="checkbox"]')
    await isolationCheckbox.uncheck()

    // Warning should appear
    await expect(settingsPanel.locator('text=unrestricted access')).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '06-warning.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/06-warning.png',
      caption: 'Warning when auto-approve is enabled without Docker isolation',
      description:
        'Disabling Docker isolation while auto-approve remains checked triggers a ' +
        'yellow warning: agents will have unrestricted access to the machine. ' +
        'This guides users toward enabling container isolation for safe auto-approval.',
    })

    // Re-enable isolation and cancel
    await isolationCheckbox.check()
    const cancelButton = settingsPanel.locator('button:text-is("Cancel")')
    await cancelButton.click()
  })
})
