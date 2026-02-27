/**
 * Feature Documentation: Issue Search in New Session Dialog
 *
 * Exercises the flow of searching for issues in the new session dialog,
 * capturing screenshots at each stage to document the feature.
 *
 * Run with: pnpm test:feature-docs search-issues
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

  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Issue Search in New Session Dialog',
      description:
        'The issues view in the new session dialog includes a search input. ' +
        'When empty, it shows issues assigned to you. When a query is typed, ' +
        'it searches all open issues in the repository via the GitHub CLI.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Issue Search', () => {
  test('Step 1: Open new session dialog and navigate to Issues', async () => {
    const newSessionButton = page.locator('button:has-text("+ New Session")')
    await newSessionButton.click()

    const dialog = page.locator('.fixed.inset-0.z-50 > div')
    await expect(dialog).toBeVisible()

    const issuesButton = dialog.locator('button:has-text("Issues")')
    await expect(issuesButton).toBeVisible()
    await issuesButton.click()

    // Wait for issues to load
    const issueRow = dialog.locator('button:has-text("#42")')
    await expect(issueRow).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-issues-view-default.png'))
    steps.push({
      screenshotPath: 'screenshots/01-issues-view-default.png',
      caption: 'Issues view showing assigned issues with search input',
      description:
        'The issues view now has a search input at the top. By default, it shows issues ' +
        'assigned to you. The subtitle reads "Assigned to me".',
    })
  })

  test('Step 2: Search input is visible', async () => {
    const dialog = page.locator('.fixed.inset-0.z-50 > div')

    const searchInput = dialog.locator('input[placeholder="Search issues..."]')
    await expect(searchInput).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-search-input.png'))
    steps.push({
      screenshotPath: 'screenshots/02-search-input.png',
      caption: 'Search input ready for queries',
      description:
        'The search input allows typing a query to search across all open issues ' +
        'in the repository, not just those assigned to you.',
    })
  })

  test('Step 3: Type a search query and see results', async () => {
    const dialog = page.locator('.fixed.inset-0.z-50 > div')
    const searchInput = dialog.locator('input[placeholder="Search issues..."]')

    await searchInput.fill('dark mode')

    // Wait for search results (debounced)
    const resultRow = dialog.locator('button:has-text("dark mode")')
    await expect(resultRow).toBeVisible()

    // Subtitle should show "Search results"
    await expect(dialog.locator('text=Search results')).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-search-results.png'))
    steps.push({
      screenshotPath: 'screenshots/03-search-results.png',
      caption: 'Search results for "dark mode"',
      description:
        'After typing a query, the subtitle changes to "Search results" and the list shows ' +
        'matching issues from across the repository. Results are fetched with a 300ms debounce.',
    })
  })

  test('Step 4: Clear search to return to assigned issues', async () => {
    const dialog = page.locator('.fixed.inset-0.z-50 > div')
    const searchInput = dialog.locator('input[placeholder="Search issues..."]')

    await searchInput.fill('')

    // Should show assigned issues again
    await expect(dialog.locator('text=Assigned to me')).toBeVisible()
    const issueRow = dialog.locator('button:has-text("#42")')
    await expect(issueRow).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '04-cleared-search.png'))
    steps.push({
      screenshotPath: 'screenshots/04-cleared-search.png',
      caption: 'Clearing search restores assigned issues',
      description:
        'When the search input is cleared, the view reverts to showing issues ' +
        'assigned to you with the "Assigned to me" subtitle.',
    })
  })
})
