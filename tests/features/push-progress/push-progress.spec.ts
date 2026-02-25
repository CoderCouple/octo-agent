/**
 * Feature Documentation: Push Progress Indicator
 *
 * Demonstrates that long-running git operations (sync, commit, push) show
 * a "working" spinner on the session card instead of staying idle. The
 * spinner is driven by periodically calling updateAgentMonitor during the
 * operation and clearing when it finishes.
 *
 * Run with: pnpm test:feature-docs push-progress
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotRegion } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
const steps: FeatureStep[] = []


/** Set the explorer panel to the source-control tab */
async function openSourceControl() {
  // Ensure explorer panel is open
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
    }
  }

  // Switch to source-control filter
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await expect(page.locator('[data-panel-id="explorer"]').getByText(/^Changes \(/)).toBeVisible()
}

/** Set the active session's status via the store */
async function setSessionStatus(status: string) {
  await page.evaluate((s) => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => {
        activeSessionId: string
        updateAgentMonitor: (id: string, update: { status: string }) => void
      }
    }
    if (!store) return
    const state = store.getState()
    state.updateAgentMonitor(state.activeSessionId, { status: s })
  }, status)
  // Wait for the status indicator to reflect the change
  if (status === 'working') {
    await expect(page.locator('.animate-spin').first()).toBeVisible()
  } else {
    await expect(page.locator('.bg-status-idle, .bg-green-400').first()).toBeVisible()
  }
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  ;({ page } = await resetApp({ scenario: 'marketing' }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Push Progress Indicator',
      description:
        'Long-running git operations (sync, commit, push) now show a "working" spinner ' +
        'on the session card in the sidebar. Previously the session stayed idle during these ' +
        'operations, giving no feedback. The spinner reuses the existing agent activity detection ' +
        'system \u2014 a utility wrapper periodically signals "working" status for the duration of the ' +
        'git operation, then lets normal idle detection take back over.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

})

test.describe.serial('Feature: Push Progress Indicator', () => {
  test('Step 1: Idle state before a git operation', async () => {
    await openSourceControl()

    // Ensure session is idle
    await setSessionStatus('idle')

    // Verify idle indicator is visible in sidebar
    const idleDot = page.locator('.bg-status-idle').first()
    await expect(idleDot).toBeVisible()

    // Screenshot sidebar + explorer to show context
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '01-idle-before-sync.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-idle-before-sync.png',
      caption: 'Session idle before git operation',
      description:
        'The session card in the sidebar shows a gray idle dot. The source control panel ' +
        'has a Sync button ready. Before this feature, clicking Sync would leave the dot gray ' +
        'throughout the entire operation.',
    })
  })

  test('Step 2: Working spinner during a git operation', async () => {
    // Simulate the working state that withGitProgress triggers
    await setSessionStatus('working')

    // Verify spinner is visible
    const spinner = page.locator('.animate-spin').first()
    await expect(spinner).toBeVisible()

    // Screenshot sidebar + explorer
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '02-working-during-sync.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-working-during-sync.png',
      caption: 'Working spinner shown during git operation',
      description:
        'When a git operation starts, withGitProgress immediately sets the session to "working" ' +
        'and refreshes it every 500ms. The sidebar shows a green animated spinner instead of ' +
        'the gray idle dot, giving clear feedback that something is happening.',
    })
  })

  test('Step 3: Green unread dot after operation completes', async () => {
    // First, transition the active session back to idle
    await setSessionStatus('idle')

    // Demonstrate the unread indicator on a non-active session (the second one).
    // In real usage, the user is on one session while another finishes working.
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => {
          activeSessionId: string
          sessions: { id: string; status: string; workingStartTime: number | null }[]
          updateAgentMonitor: (id: string, update: { status: string }) => void
        }
        setState: (update: { sessions: unknown[] }) => void
      }
      if (!store) return
      const state = store.getState()
      // Find a session that is NOT the active one
      const otherSession = state.sessions.find((s) => s.id !== state.activeSessionId)
      if (!otherSession) return

      // Set it to working with a start time 4 seconds ago
      const sessions = state.sessions.map((s) =>
        s.id === otherSession.id
          ? { ...s, status: 'working', workingStartTime: Date.now() - 4000 }
          : s,
      )
      store.setState({ sessions })

      // Transition to idle — triggers isUnread since working duration >= 3s
      state.updateAgentMonitor(otherSession.id, { status: 'idle' })
    })

    // Verify green unread dot is visible (green with glow shadow)
    const unreadDot = page.locator('.bg-green-400').first()
    await expect(unreadDot).toBeVisible()

    // Verify active session spinner is gone
    const spinner = page.locator('.animate-spin')
    await expect(spinner).not.toBeVisible()

    // Screenshot sidebar + explorer
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '03-unread-after-sync.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-unread-after-sync.png',
      caption: 'Green "unread" dot after operation completes',
      description:
        'When a git operation finishes on a background session, withGitProgress transitions it ' +
        'to idle. If the operation lasted 3+ seconds, the store marks the session as unread \u2014 ' +
        'shown as a green glowing dot. This reuses the same notification system that alerts ' +
        'users when an agent finishes a task.',
    })
  })
})
