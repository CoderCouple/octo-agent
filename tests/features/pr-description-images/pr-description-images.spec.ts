/**
 * Feature Documentation: PR Description Images with Lightbox
 *
 * Exercises the flow of viewing images in PR descriptions as small thumbnails
 * that expand to a full lightbox overlay on click.
 *
 * Run with: pnpm test:feature-docs pr-description-images
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotClip } from '../_shared/screenshot-helpers'
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
      title: 'PR Description Images',
      description:
        'Images in PR descriptions now render as small thumbnails instead of raw HTML markup. ' +
        'Clicking a thumbnail opens a full-screen lightbox overlay for detailed viewing. ' +
        'Both markdown image syntax and raw HTML <img> tags are supported.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Set up session with PR data and navigate to Review tab */
async function setupReviewTab(p: Page) {
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

  const firstSession = p.locator('[data-panel-id="sidebar"] div.cursor-pointer').first()
  await firstSession.click()
  await expect(firstSession).toHaveClass(/bg-accent/, { timeout: 5000 })

  // Open review tab
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

test.describe.serial('Feature: PR Description Images', () => {
  test('Step 1: PR description with image thumbnails', async () => {
    await setupReviewTab(page)

    // Expand PR Description section
    const prDescHeader = page.locator('button:has-text("PR Description")').first()
    await prDescHeader.scrollIntoViewIfNeeded()
    await prDescHeader.click()

    // Wait for images to appear as thumbnails
    const images = page.locator('[data-panel-id="explorer"] img[alt]')
    await expect(images.first()).toBeVisible({ timeout: 5000 })

    // Screenshot the PR description section with thumbnail images
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-image-thumbnails.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-image-thumbnails.png',
      caption: 'Images in PR description render as small clickable thumbnails',
      description:
        'The PR description section shows images from the GitHub PR body as compact thumbnails ' +
        'instead of full-size images or raw HTML markup. The thumbnails have a max height of 128px ' +
        'and show a pointer cursor on hover, indicating they are clickable.',
    })
  })

  test('Step 2: Click thumbnail to open lightbox', async () => {
    // Click the first image to open the lightbox
    const firstImage = page.locator('[data-panel-id="explorer"] img[alt]').first()
    await firstImage.click()

    // Wait for lightbox overlay to appear
    const lightbox = page.locator('.fixed.inset-0.z-50')
    await expect(lightbox).toBeVisible({ timeout: 3000 })

    // Screenshot the lightbox overlay
    await page.screenshot({
      path: path.join(SCREENSHOTS, '02-lightbox-open.png'),
      type: 'png',
    })
    steps.push({
      screenshotPath: 'screenshots/02-lightbox-open.png',
      caption: 'Clicking a thumbnail opens a full-screen lightbox overlay',
      description:
        'Clicking any image thumbnail opens a lightbox overlay with a semi-transparent dark background. ' +
        'The image is displayed at its full size (up to 90% of the viewport) with rounded corners ' +
        'and a drop shadow. Clicking anywhere on the overlay dismisses it.',
    })
  })

  test('Step 3: Dismiss lightbox by clicking overlay', async () => {
    // Click the overlay background to dismiss
    const lightbox = page.locator('.fixed.inset-0.z-50')
    await lightbox.click({ position: { x: 10, y: 10 } })

    // Verify lightbox is dismissed
    await expect(lightbox).toBeHidden({ timeout: 3000 })

    // Screenshot showing we're back to the normal view
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-lightbox-dismissed.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-lightbox-dismissed.png',
      caption: 'Lightbox dismissed, back to thumbnail view',
      description:
        'After clicking the overlay background, the lightbox closes and the user returns to the ' +
        'normal PR description view with the image thumbnails still visible and clickable.',
    })
  })
})
