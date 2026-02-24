/**
 * Feature Documentation: Improved PR Review UI
 *
 * Exercises the improved PR review panel including markdown-rendered PR
 * description, collapsible comment threads, filter/sort controls,
 * reaction badges, reply functionality, and verifies that the correct
 * GitHub API calls are being sent.
 *
 * Run with: pnpm test:feature-docs pr-review-ui
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
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

  // Install IPC call tracking in the main process
  await electronApp.evaluate(({ ipcMain }) => {
    const g = globalThis as Record<string, unknown>
    g.__ipcCalls = [] as { channel: string; args: unknown[] }[]
    const origHandle = ipcMain.handle.bind(ipcMain)

    // Wrap existing handlers to track calls
    const channels = ['gh:replyToComment', 'gh:addReaction']
    for (const channel of channels) {
      ipcMain.removeHandler(channel)
    }

    // Re-register with tracking
    for (const channel of channels) {
      origHandle(channel, async (_event: unknown, ...args: unknown[]) => {
        (g.__ipcCalls as { channel: string; args: unknown[] }[]).push({ channel, args })
        // Return mock success data (matches E2E_TEST behavior)
        return { success: true }
      })
    }
  })
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Improved PR Review UI',
      description:
        'The PR review panel has been enhanced with markdown-rendered PR descriptions, ' +
        'collapsible comment threads with one-line previews, filter/sort controls for comments, ' +
        'emoji reactions, and inline reply functionality. PR description defaults to collapsed, ' +
        'and when no review has been generated yet, only the "Generate Review" promo is shown ' +
        '(unless there are PR comments to display).',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

/** Read and clear tracked IPC calls from the main process */
async function getAndClearIpcCalls(app: ElectronApplication) {
  return app.evaluate(() => {
    const g = globalThis as Record<string, unknown>
    const calls = (g.__ipcCalls as { channel: string; args: unknown[] }[]) || []
    g.__ipcCalls = []
    return calls
  })
}

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
  await p.waitForTimeout(500)

  // Open explorer and switch to review filter
  const explorerButton = p.locator('button[title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await p.waitForTimeout(300)
    }
  }

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
  await p.waitForTimeout(2000)
}

test.describe.serial('Feature: Improved PR Review UI', () => {
  test('Step 1: Review panel with PR data — markdown-rendered description', async () => {
    await setupReviewSession(page)

    // Wait for review data to load
    const overviewSection = page.locator('text=Overview')
    await expect(overviewSection).toBeVisible({ timeout: 10000 })

    // PR Description should be visible (collapsed by default)
    const prDescHeader = page.locator('button:has-text("PR Description")')
    await expect(prDescHeader).toBeVisible({ timeout: 5000 })

    // Click to expand PR Description
    await prDescHeader.click()
    await page.waitForTimeout(500)

    // Scroll to top to see the PR Description content
    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = 0 })
    await page.waitForTimeout(300)

    // Verify the markdown is rendered (the mock description has "## Changes" heading)
    const changesHeading = page.locator('h2:has-text("Changes")')
    await expect(changesHeading).toBeVisible({ timeout: 3000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-markdown-description.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-markdown-description.png',
      caption: 'PR Description rendered as markdown with dark theme styling',
      description:
        'The PR description is now rendered as markdown instead of raw text. ' +
        'The "## Changes" heading renders as an h2, and the bullet list items are properly formatted. ' +
        'The section defaults to collapsed and can be expanded on demand.',
    })
  })

  test('Step 2: PR Description collapsed by default', async () => {
    // Collapse PR Description
    const prDescHeader = page.locator('button:has-text("PR Description")')
    await prDescHeader.click()
    await page.waitForTimeout(300)

    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = 0 })
    await page.waitForTimeout(300)

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-description-collapsed.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-description-collapsed.png',
      caption: 'PR Description defaults to collapsed to reduce noise',
      description:
        'The PR Description section is collapsed by default, keeping the focus on the ' +
        'AI-generated review content. Users can expand it when they want to reference ' +
        'the original PR description.',
    })
  })

  test('Step 3: Collapsible comment threads with previews', async () => {
    await page.setViewportSize({ width: 1400, height: 1200 })
    await page.waitForTimeout(500)

    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(500)

    const prCommentsSection = page.locator('text=PR Comments')
    await expect(prCommentsSection).toBeVisible({ timeout: 5000 })

    const headerBox = await prCommentsSection.boundingBox()
    const explorerBox = await page.locator('[data-panel-id="explorer"]').boundingBox()
    if (headerBox && explorerBox) {
      const y = Math.max(0, headerBox.y - 8)
      const bottom = explorerBox.y + explorerBox.height
      await screenshotClip(
        page,
        { x: explorerBox.x, y, width: explorerBox.width, height: Math.min(bottom - y, 500) },
        path.join(SCREENSHOTS, '03-collapsed-threads.png'),
      )
    }

    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(300)

    steps.push({
      screenshotPath: 'screenshots/03-collapsed-threads.png',
      caption: 'Comment threads are collapsed with one-line previews',
      description:
        'Each comment thread is collapsed by default, showing the author, relative timestamp, ' +
        'reply count, and a truncated one-line preview of the comment body. ' +
        'This makes it easy to scan through many comments without scrolling.',
    })
  })

  test('Step 4: Filter and sort controls', async () => {
    await page.setViewportSize({ width: 1400, height: 1200 })
    await page.waitForTimeout(300)

    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)

    const allButton = page.locator('button:has-text("All")').first()
    const activeButton = page.locator('button:has-text("Active")').first()

    if (await allButton.isVisible() && await activeButton.isVisible()) {
      const allBox = await allButton.boundingBox()
      const explorerBox = await page.locator('[data-panel-id="explorer"]').boundingBox()
      if (allBox && explorerBox) {
        await screenshotClip(
          page,
          {
            x: explorerBox.x,
            y: Math.max(0, allBox.y - 30),
            width: explorerBox.width,
            height: 200,
          },
          path.join(SCREENSHOTS, '04-filter-sort.png'),
        )
      }
    }

    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(300)

    steps.push({
      screenshotPath: 'screenshots/04-filter-sort.png',
      caption: 'Filter (All/Active) and sort (Newest/Oldest) controls for comments',
      description:
        'A compact toolbar above the comments list provides filter and sort controls. ' +
        '"All" shows all comments, while "Active" hides outdated review comments ' +
        '(those on diff positions that no longer exist). Sort toggles between ' +
        '"Newest first" and "Oldest first".',
    })
  })

  test('Step 5: Expanded comment with reactions and reply button', async () => {
    await page.setViewportSize({ width: 1400, height: 1200 })
    await page.waitForTimeout(300)

    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)

    // Expand all reviewer comment threads to see reactions and reply buttons
    const commentButtons = page.locator('button.w-full.text-left:has-text("reviewer")')
    const count = await commentButtons.count()
    for (let i = 0; i < count; i++) {
      await commentButtons.nth(i).click()
      await page.waitForTimeout(300)
    }

    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)

    // Verify a Reply button is visible (review comments have Reply)
    const replyBtn = page.locator('button:has-text("Reply")').first()
    await expect(replyBtn).toBeVisible({ timeout: 3000 })

    // Verify reaction badges are visible (mock data has +1 reaction on review comment 1)
    const reactionBadge = page.locator('.rounded-full:has-text("\uD83D\uDC4D")')
    await expect(reactionBadge.first()).toBeVisible({ timeout: 3000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    if (explorerBox) {
      const captureHeight = Math.min(explorerBox.height, 500)
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y + explorerBox.height - captureHeight,
          width: explorerBox.width,
          height: captureHeight,
        },
        path.join(SCREENSHOTS, '05-expanded-comment.png'),
      )
    }

    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(300)

    steps.push({
      screenshotPath: 'screenshots/05-expanded-comment.png',
      caption: 'Expanded comment showing full body, reaction badges, and reply button',
      description:
        'Clicking a comment thread expands it to show the full comment body (at a readable text-sm size), ' +
        'emoji reaction badges with counts (e.g. \uD83D\uDC4D 2), a "+" button to add reactions, ' +
        'and a "Reply" button for inline replies.',
    })
  })

  test('Step 6: Typing and submitting an inline reply', async () => {
    await page.setViewportSize({ width: 1400, height: 1200 })
    await page.waitForTimeout(300)

    // Clear any prior IPC calls
    await getAndClearIpcCalls(electronApp)

    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)

    // Click the Reply button on an expanded review comment
    const replyBtn = page.locator('button:has-text("Reply")').first()
    await expect(replyBtn).toBeVisible({ timeout: 3000 })
    await replyBtn.click()
    await page.waitForTimeout(500)

    // A textarea should appear
    const textarea = page.locator('textarea[placeholder="Write a reply..."]')
    await expect(textarea).toBeVisible({ timeout: 3000 })

    // Type a reply
    await textarea.fill('Looks good, I\'ll add a comment there. Thanks!')
    await page.waitForTimeout(300)

    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)

    // Screenshot the reply textarea with typed content
    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    if (explorerBox) {
      const captureHeight = Math.min(explorerBox.height, 500)
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y + explorerBox.height - captureHeight,
          width: explorerBox.width,
          height: captureHeight,
        },
        path.join(SCREENSHOTS, '06-typing-reply.png'),
      )
    }

    steps.push({
      screenshotPath: 'screenshots/06-typing-reply.png',
      caption: 'Typing an inline reply to a review comment',
      description:
        'Clicking "Reply" reveals a textarea below the comment thread. ' +
        'The user can type their reply and submit with the Reply button or \u2318+Enter.',
    })

    // Click the submit button (the bg-accent "Reply" button inside the reply box, not the text link)
    const submitBtn = page.locator('button.bg-accent:has-text("Reply")')
    await submitBtn.click()
    await page.waitForTimeout(1500)

    // Verify the correct IPC call was sent to the main process
    const calls = await getAndClearIpcCalls(electronApp)
    const replyCalls = calls.filter(c => c.channel === 'gh:replyToComment')
    expect(replyCalls.length).toBe(1)

    // Assert on the arguments: [repoDir, prNumber, commentId, body]
    const replyArgs = replyCalls[0].args
    expect(replyArgs[1]).toBe(123) // prNumber
    expect(replyArgs[3]).toBe('Looks good, I\'ll add a comment there. Thanks!') // body

    // The textarea should have disappeared after successful reply
    await expect(textarea).not.toBeVisible({ timeout: 3000 })

    // Screenshot showing the reply was submitted (textarea gone)
    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)

    if (explorerBox) {
      const captureHeight = Math.min(explorerBox.height, 400)
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y + explorerBox.height - captureHeight,
          width: explorerBox.width,
          height: captureHeight,
        },
        path.join(SCREENSHOTS, '07-reply-submitted.png'),
      )
    }

    steps.push({
      screenshotPath: 'screenshots/07-reply-submitted.png',
      caption: 'Reply submitted successfully — sends gh:replyToComment with correct args',
      description:
        'After submitting, the reply textarea closes and the comment thread refreshes. ' +
        'The IPC call gh:replyToComment is sent with the correct PR number (123) and reply body. ' +
        'Comments are automatically refreshed to show the new reply.',
    })

    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(300)
  })

  test('Step 7: Adding an emoji reaction via the picker', async () => {
    await page.setViewportSize({ width: 1400, height: 1200 })
    await page.waitForTimeout(300)

    // Clear prior IPC calls
    await getAndClearIpcCalls(electronApp)

    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(300)

    // Click the "+" button to open the reaction picker
    const addReactionBtn = page.locator('button[title="Add reaction"]').first()
    await expect(addReactionBtn).toBeVisible({ timeout: 3000 })
    await addReactionBtn.click()
    await page.waitForTimeout(500)

    // The reaction picker popover should appear with emoji buttons
    const rocketBtn = page.locator('button[title="rocket"]')
    await expect(rocketBtn).toBeVisible({ timeout: 3000 })

    // Screenshot showing the reaction picker popover
    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    if (explorerBox) {
      const captureHeight = Math.min(explorerBox.height, 500)
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y + explorerBox.height - captureHeight,
          width: explorerBox.width,
          height: captureHeight,
        },
        path.join(SCREENSHOTS, '08-reaction-picker.png'),
      )
    }

    steps.push({
      screenshotPath: 'screenshots/08-reaction-picker.png',
      caption: 'Reaction picker with all 8 GitHub emoji reactions',
      description:
        'Clicking the "+" button opens a popover with all 8 GitHub reaction emojis: ' +
        '\uD83D\uDC4D \uD83D\uDC4E \uD83D\uDE04 \uD83C\uDF89 \uD83D\uDE15 \u2764\uFE0F \uD83D\uDE80 \uD83D\uDC40. ' +
        'Clicking one sends the reaction via gh:addReaction and refreshes the comment.',
    })

    // Click the rocket emoji reaction
    await rocketBtn.click()
    await page.waitForTimeout(1500)

    // Verify the correct IPC call was sent for addReaction
    const calls = await getAndClearIpcCalls(electronApp)
    const reactionCalls = calls.filter(c => c.channel === 'gh:addReaction')
    expect(reactionCalls.length).toBe(1)

    // Assert on arguments: [repoDir, commentId, reactionContent, commentType]
    const reactionArgs = reactionCalls[0].args
    expect(reactionArgs[2]).toBe('rocket') // reaction content
    expect(reactionArgs[3]).toBe('review') // commentType (it's a review comment)

    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(300)
  })
})
