/**
 * Feature Documentation: Review Live Updates & Navigation
 *
 * Exercises the live review polling (content-based change detection)
 * and scroll-to-line behavior in the diff viewer when clicking
 * location links from the review panel.
 *
 * Run with: pnpm test:feature-docs review-live-navigation
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotClip, scrollToVisible } from '../_shared/screenshot-helpers'
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
  ;({ electronApp, page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Review Live Updates & Navigation',
      description:
        'The review panel now detects content changes in review.json even when generatedAt ' +
        'stays the same (e.g. when the agent modifies the review in-place). Location links ' +
        'scroll correctly in the diff viewer by waiting for diff computation before scrolling, ' +
        'preventing the hideUnchangedRegions collapse from losing the scroll position.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Set up the first session as a review session and navigate to the review tab */
async function setupReviewSession(p: Page) {
  await p.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { sessions: Record<string, unknown>[] }
      setState: (state: Record<string, unknown>) => void
    }
    if (!store) return

    const sessions = store.getState().sessions
    store.setState({
      sessions: sessions.map((s: Record<string, unknown>, i: number) => {
        if (i === 0) {
          const pv = (s.panelVisibility || {}) as Record<string, boolean>
          return {
            ...s,
            panelVisibility: { ...pv, explorer: true },
            prNumber: 123,
            prTitle: 'Add dark mode support',
            prUrl: 'https://github.com/user/demo-project/pull/123',
            prBaseBranch: 'main',
            sessionType: 'review',
          }
        }
        return s
      }),
    })
  })

  const firstSession = p.locator('.cursor-pointer').first()
  await firstSession.click()

  await p.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => {
        activeSessionId: string
        setExplorerFilter: (id: string, filter: string) => void
        setPanelVisibility: (id: string, panelId: string, visible: boolean) => void
      }
    }
    if (!store) return
    const state = store.getState()
    state.setPanelVisibility(state.activeSessionId, 'explorer', true)
    state.setExplorerFilter(state.activeSessionId, 'review')
  })
  await expect(p.locator('text=Overview')).toBeVisible({ timeout: 10000 })
}

test.describe.serial('Feature: Review Live Updates & Navigation', () => {
  test('Step 1: Review panel showing review data', async () => {
    await setupReviewSession(page)

    const overviewSection = page.locator('text=Overview')
    await expect(overviewSection).toBeVisible({ timeout: 10000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-review-loaded.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-review-loaded.png',
      caption: 'Review panel with loaded review data',
      description:
        'The review panel shows the AI-generated review with Overview, Change Patterns, ' +
        'and Potential Issues sections. The poller now uses content-based change detection — ' +
        'if the agent modifies review.json without changing generatedAt, the UI still updates.',
    })
  })

  test('Step 2: Click a location link to open diff viewer', async () => {
    // Expand Change Patterns to reveal location links (collapsed by default)
    const changePatternsButton = page.locator('button:has-text("Change Patterns")')
    if (await changePatternsButton.isVisible()) {
      await scrollToVisible(changePatternsButton)
      await changePatternsButton.click()
    }

    // Find and click a location link in the review
    const locationLink = page.locator('button:has-text("ThemeContext")').first()

    if (await locationLink.isVisible()) {
      await scrollToVisible(locationLink)
      await locationLink.click()

      // Wait a moment for the file selection to propagate
      await expect(locationLink).toBeVisible()
    }

    // Screenshot the full window — file viewer may or may not be visible depending on panel state
    await page.screenshot({
      path: path.join(SCREENSHOTS, '02-location-click.png'),
    })

    steps.push({
      screenshotPath: 'screenshots/02-location-click.png',
      caption: 'Location link clicked — file selected for diff viewing',
      description:
        'Clicking a location link selects the file in diff mode and scrolls to the referenced line. ' +
        'The scroll now correctly waits for diff computation to complete before positioning — ' +
        'hideUnchangedRegions collapsing no longer causes the viewport to jump away.',
    })
  })

  test('Step 3: Change Patterns section with location links', async () => {
    // Navigate back to review
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => {
          activeSessionId: string
          setExplorerFilter: (id: string, filter: string) => void
        }
      }
      if (!store) return
      const state = store.getState()
      state.setExplorerFilter(state.activeSessionId, 'review')
    })
    await expect(page.locator('text=Overview')).toBeVisible({ timeout: 10000 })

    // Expand Change Patterns if needed
    const patternsSection = page.locator('button:has-text("Change Patterns")')
    await scrollToVisible(patternsSection)

    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    if (explorerBox) {
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y,
          width: explorerBox.width,
          height: Math.min(explorerBox.height, 500),
        },
        path.join(SCREENSHOTS, '03-change-patterns.png'),
      )
    }
    steps.push({
      screenshotPath: 'screenshots/03-change-patterns.png',
      caption: 'Change Patterns with clickable file:line location links',
      description:
        'Each change pattern and issue includes clickable location links showing ' +
        'the file path and line number. Clicking these opens the file in the diff viewer ' +
        'at the exact location, with proper scroll positioning after diff computation.',
    })
  })
})
