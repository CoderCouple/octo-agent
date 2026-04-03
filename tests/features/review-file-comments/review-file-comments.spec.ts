/**
 * Feature Documentation: File Viewer Review Comments
 *
 * Exercises the glyph margin comment functionality in both the normal
 * Monaco editor and the diff viewer when a review context is present.
 *
 * Run with: pnpm test:feature-docs review-file-comments
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, scrollToVisible, waitForDiffEditor } from '../_shared/screenshot-helpers'
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
      title: 'File Viewer Review Comments',
      description:
        'When viewing files in a review session, both the normal Monaco editor and ' +
        'the diff viewer now support adding comments by clicking the glyph margin. ' +
        'Comments are saved to .octoagent/comments.json (aligned with the review panel) ' +
        'and show as decorations in the editor.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Set up the first session as a review session and ensure file viewer is visible */
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
            panelVisibility: { ...pv, explorer: true, fileViewer: true },
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
    state.setPanelVisibility(state.activeSessionId, 'fileViewer', true)
    state.setExplorerFilter(state.activeSessionId, 'review')
  })
  await expect(p.locator('text=Overview')).toBeVisible({ timeout: 10000 })
}

test.describe.serial('Feature: File Viewer Review Comments', () => {
  test('Step 1: Open a file from review location link — file viewer visible', async () => {
    await setupReviewSession(page)

    // Expand the Change Patterns section (collapsed by default) to reveal location links
    const changePatternsButton = page.locator('button:has-text("Change Patterns")')
    await expect(changePatternsButton).toBeVisible({ timeout: 5000 })
    await scrollToVisible(changePatternsButton)
    await changePatternsButton.click()

    // Click a location link to open a file in diff mode
    const locationLink = page.locator('button:has-text("ThemeContext")').first()
    await expect(locationLink).toBeVisible({ timeout: 5000 })
    await scrollToVisible(locationLink)
    await locationLink.click()

    // Wait for the diff editor to fully render in the file viewer
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await waitForDiffEditor(fileViewer)

    await page.screenshot({
      path: path.join(SCREENSHOTS, '01-file-opened.png'),
    })
    steps.push({
      screenshotPath: 'screenshots/01-file-opened.png',
      caption: 'File opened in diff mode from review location link',
      description:
        'Clicking a location link in the review opens the file in diff mode. ' +
        'In review sessions, the file viewer has glyph margin commenting enabled — ' +
        'clicking the margin opens an inline comment form.',
    })
  })

  test('Step 2: Comments file path aligned with review panel', async () => {
    // Navigate back to review to show the review panel
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

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-review-panel.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-review-panel.png',
      caption: 'Review panel shares .octoagent/comments.json with file viewer',
      description:
        'The file viewer now writes comments to .octoagent/comments.json in the session directory, ' +
        'matching the review panel. Comments added in either the file viewer or the review panel ' +
        'appear in both places and can be pushed as a draft review.',
    })
  })

  test('Step 3: Diff viewer with glyph margin enabled', async () => {
    // Expand Change Patterns if collapsed and click location link
    const changePatternsButton = page.locator('button:has-text("Change Patterns")')
    await expect(changePatternsButton).toBeVisible({ timeout: 5000 })
    await scrollToVisible(changePatternsButton)
    // Check if section content is visible; if not, click to expand
    const locationLink = page.locator('button:has-text("ThemeContext")').first()
    if (!(await locationLink.isVisible().catch(() => false))) {
      await changePatternsButton.click()
    }
    await expect(locationLink).toBeVisible({ timeout: 5000 })
    await scrollToVisible(locationLink)
    await locationLink.click()

    // Wait for the diff editor to fully render
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await waitForDiffEditor(fileViewer)

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '03-diff-glyph-margin.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-diff-glyph-margin.png',
      caption: 'Diff viewer with glyph margin for adding comments',
      description:
        'The diff viewer in review sessions shows a glyph margin on the modified side. ' +
        'Clicking the margin opens an inline comment input, identical to the normal editor experience. ' +
        'Comments include the file path and line number for the draft review.',
    })
  })

  test('Step 4: Inline comment input in diff viewer', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()

    // Click glyph margin area on the modified side to trigger comment input
    const glyphMargin = fileViewer.locator('.modified-in-monaco-diff-editor .margin-view-overlays').first()
    await expect(glyphMargin).toBeVisible({ timeout: 5000 })
    const box = await glyphMargin.boundingBox()
    if (box) {
      // Click near the left edge of the glyph margin, a few lines down
      await page.mouse.click(box.x + 5, box.y + 40)
    }

    // Wait briefly for the comment input to appear
    const commentInput = fileViewer.locator('input[placeholder="Type your comment..."]')
    const hasInput = await commentInput.isVisible({ timeout: 3000 }).catch(() => false)
    if (hasInput) {
      await commentInput.fill('This needs error handling for the edge case')
    }

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '04-diff-comment-input.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/04-diff-comment-input.png',
      caption: 'Inline comment input appears above the diff editor',
      description:
        'When the glyph margin is clicked in the diff viewer, an inline comment input ' +
        'appears above the editor showing the target line number. The comment is saved ' +
        'to .octoagent/comments.json and displayed as a decoration in the editor gutter.',
    })
  })
})
