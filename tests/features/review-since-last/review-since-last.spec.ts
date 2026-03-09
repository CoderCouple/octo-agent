/**
 * Feature Documentation: Re-Review with "Changes Since Last Review"
 *
 * Exercises the re-review flow where a user who has previously reviewed a PR
 * sees structured "Since Last Review" content including:
 * - Status badges on responses to their comments (addressed/not-addressed/partially-addressed)
 * - Change patterns with clickable file locations for changes since the last review
 *
 * Run with: pnpm test:feature-docs review-since-last
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

const REVIEW_DATA = {
  version: 1,
  generatedAt: '2025-02-01T12:05:00Z',
  prNumber: 123,
  prTitle: 'Add JWT authentication',
  headCommit: 'def456',
  overview: {
    purpose: 'Adds JWT-based authentication with refresh tokens and session management.',
    approach: 'Introduces TokenService, SessionStore, and updates auth middleware to validate JWTs.',
  },
  changePatterns: [
    {
      id: 'cp1',
      title: 'Auth middleware overhaul',
      description: 'Converts synchronous token check to async JWT verification with session validation.',
      locations: [{ file: 'src/middleware/auth.ts', startLine: 12, endLine: 28 }],
    },
    {
      id: 'cp2',
      title: 'Token service',
      description: 'JWT sign/verify/rotate functionality with configurable expiry.',
      locations: [{ file: 'src/services/token.ts', startLine: 1, endLine: 45 }],
    },
  ],
  potentialIssues: [
    {
      id: 'pi1',
      severity: 'warning',
      title: 'No token expiry grace period',
      description: 'Access tokens are rejected immediately on expiry.',
      locations: [{ file: 'src/services/token.ts', startLine: 22, endLine: 24 }],
    },
  ],
  designDecisions: [
    {
      id: 'dd1',
      title: 'JWT with Redis sessions',
      description: 'Uses JWT for transport but backs it with server-side sessions for revocation.',
      alternatives: ['Stateless JWT', 'Opaque session tokens'],
      locations: [{ file: 'src/services/session.ts', startLine: 5, endLine: 12 }],
    },
  ],
  changesSinceLastReview: {
    summary: 'Added token expiry grace period, fixed Redis connection pooling, and addressed review comments. Session revocation now uses a local cache with 5s TTL.',
    responsesToComments: [
      {
        comment: 'Add a grace period for token expiry to handle clock skew',
        response: 'Added 30-second grace period in TokenService.verify(). Configurable via TOKEN_EXPIRY_GRACE_SECONDS.',
        status: 'addressed',
      },
      {
        comment: 'Session revocation check hits Redis on every request',
        response: 'Added LRU cache with 5-second TTL. Redis only hit on cache miss.',
        status: 'addressed',
      },
      {
        comment: 'Consider adding rate limiting to the refresh endpoint',
        response: 'Planned for follow-up PR. Added TODO comment at the endpoint.',
        status: 'partially-addressed',
      },
      {
        comment: 'Add integration tests for the full auth flow',
        response: 'Not yet added — will address in next iteration.',
        status: 'not-addressed',
      },
    ],
    changePatterns: [
      {
        id: 'slr-cp1',
        title: 'Token expiry grace period',
        description: 'Added configurable grace period to TokenService.verify() with TOKEN_EXPIRY_GRACE_SECONDS env var.',
        locations: [
          { file: 'src/services/token.ts', startLine: 22, endLine: 30 },
          { file: 'src/config/auth.ts', startLine: 8, endLine: 12 },
        ],
      },
      {
        id: 'slr-cp2',
        title: 'Session cache layer',
        description: 'Added LRU cache with 5s TTL in auth middleware to reduce Redis calls.',
        locations: [
          { file: 'src/middleware/auth.ts', startLine: 5, endLine: 15 },
          { file: 'src/services/sessionCache.ts', startLine: 1, endLine: 28 },
        ],
      },
      {
        id: 'slr-cp3',
        title: 'Redis connection pooling fix',
        description: 'Fixed connection leak in SessionStore by properly releasing connections.',
        locations: [
          { file: 'src/services/session.ts', startLine: 30, endLine: 38 },
        ],
      },
    ],
  },
}


test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ electronApp, page } = await resetApp())

  // Intercept fs:readFile in the main process to return our custom review data
  // for any review.json path
  await electronApp.evaluate(({ ipcMain }, reviewJson) => {
    const g = globalThis as Record<string, unknown>
    g.__customReviewJson = reviewJson

    // Replace the fs:readFile handler to intercept review.json reads
    ipcMain.removeHandler('fs:readFile')
    ipcMain.handle('fs:readFile', async (_event: unknown, filePath: string) => {
      if (filePath.endsWith('/review.json') || filePath.endsWith('\\review.json')) {
        return g.__customReviewJson as string
      }
      if (filePath.endsWith('README.md')) {
        return '# Demo Project\n\nA demo project for testing.'
      }
      return '// Mock file content for E2E tests\nexport const test = true;\n'
    })
  }, JSON.stringify(REVIEW_DATA, null, 2))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Re-Review: Changes Since Last Review',
      description:
        'When re-reviewing a PR, the review panel shows a "Since Last Review" section ' +
        'with status badges on each comment response (Addressed, Not addressed, Partial) ' +
        'and structured change patterns with clickable file locations showing what changed ' +
        'since the previous review. This replaces the old comparison.json approach with ' +
        'a unified review.json output.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Set up the first session as a review session and navigate to review tab */
async function setupReReviewSession(p: Page) {
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
            prTitle: 'Add JWT authentication',
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

  // Open explorer if not already
  const explorerButton = p.locator('button[title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
    }
  }

  // Switch to review filter
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

  // Wait for the review panel to load
  await expect(p.locator('text=Overview')).toBeVisible({ timeout: 10000 })
}

test.describe.serial('Feature: Re-Review Changes Since Last Review', () => {
  test('Step 1: Review panel showing "Since Last Review" section', async () => {
    await setupReReviewSession(page)

    // Wait for the Since Last Review section to appear (from our intercepted review.json)
    const sinceLastReview = page.locator('button:has-text("Since Last Review")')
    await expect(sinceLastReview).toBeVisible({ timeout: 5000 })

    // Scroll to top to see the section
    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = 0 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-since-last-review-section.png'), {
      maxHeight: 700,
    })

    steps.push({
      screenshotPath: 'screenshots/01-since-last-review-section.png',
      caption: 'Re-review panel showing the "Since Last Review" section at the top',
      description:
        'When a PR has been reviewed before, the review panel shows a "Since Last Review" section ' +
        'at the top with a summary of what changed, status of each comment response, and ' +
        'structured change patterns with clickable file locations.',
    })
  })

  test('Step 2: Comment responses with status badges', async () => {
    // The Since Last Review section should be expanded by default
    const responsesHeader = page.locator('text=Responses to Comments')
    await scrollToVisible(responsesHeader)
    await expect(responsesHeader).toBeVisible({ timeout: 3000 })

    // Verify status badges are visible
    await expect(page.locator('text=Addressed').first()).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=Partial')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=Not addressed')).toBeVisible({ timeout: 3000 })

    // Screenshot the responses section
    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    const headerBox = await responsesHeader.boundingBox()

    if (explorerBox && headerBox) {
      const y = Math.max(explorerBox.y, headerBox.y - 40)
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y,
          width: explorerBox.width,
          height: Math.min(explorerBox.y + explorerBox.height - y, 500),
        },
        path.join(SCREENSHOTS, '02-comment-status-badges.png'),
      )
    }

    steps.push({
      screenshotPath: 'screenshots/02-comment-status-badges.png',
      caption: 'Each comment response shows a status badge: Addressed (green), Partial (yellow), Not addressed (red)',
      description:
        'The "Responses to Comments" sub-section lists each reviewer comment with a colored ' +
        'status badge indicating whether it was addressed, partially addressed, or not addressed. ' +
        'Each entry shows the agent\'s explanation of what was done in response.',
    })
  })

  test('Step 3: Change patterns with file locations since last review', async () => {
    await page.setViewportSize({ width: 1400, height: 1200 })

    const changePatternsHeader = page.locator('text=Changes Since Last Review')
    await scrollToVisible(changePatternsHeader)
    await expect(changePatternsHeader).toBeVisible({ timeout: 3000 })

    // Verify change pattern titles (use exact match to avoid matching partial text in summary)
    await expect(page.locator('.font-medium:has-text("Token expiry grace period")')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.font-medium:has-text("Session cache layer")')).toBeVisible({ timeout: 3000 })

    // Verify file location links
    await expect(page.locator('button:has-text("src/services/token.ts:22")')).toBeVisible({ timeout: 3000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    const headerBox = await changePatternsHeader.boundingBox()

    if (explorerBox && headerBox) {
      const y = Math.max(explorerBox.y, headerBox.y - 20)
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y,
          width: explorerBox.width,
          height: Math.min(explorerBox.y + explorerBox.height - y, 500),
        },
        path.join(SCREENSHOTS, '03-change-patterns-locations.png'),
      )
    }

    await page.setViewportSize({ width: 1400, height: 900 })

    steps.push({
      screenshotPath: 'screenshots/03-change-patterns-locations.png',
      caption: 'Structured change patterns with clickable file locations for changes since the last review',
      description:
        'The "Changes Since Last Review" sub-section shows structured change patterns ' +
        'with titles, descriptions, and clickable file location links — the same format ' +
        'as the main Change Patterns section.',
    })
  })

  test('Step 4: Full re-review layout', async () => {
    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = 0 })

    // Verify standard sections still appear below
    await expect(page.locator('button:has-text("Overview")')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('button:has-text("Change Patterns")')).toBeVisible({ timeout: 3000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '04-full-review-layout.png'), {
      maxHeight: 800,
    })

    steps.push({
      screenshotPath: 'screenshots/04-full-review-layout.png',
      caption: 'Full re-review layout: Since Last Review at top, followed by standard review sections',
      description:
        'The complete re-review layout shows "Since Last Review" prominently at the top, ' +
        'followed by Overview, Change Patterns, Potential Issues, and Design Decisions. ' +
        'This gives the reviewer an immediate view of what changed since their last review.',
    })
  })
})
