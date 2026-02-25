import { expect, type Page, type Locator } from '@playwright/test'

interface ScreenshotOpts {
  /** Padding around the element in pixels (default: 4) */
  padding?: number
  /** Maximum height to capture from the top (default: unlimited) */
  maxHeight?: number
}

/**
 * Screenshot a single element, optionally cropped to a max height.
 */
export async function screenshotElement(
  page: Page,
  locator: Locator,
  filePath: string,
  opts: ScreenshotOpts = {},
): Promise<void> {
  const { padding = 4, maxHeight } = opts
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Element not found for screenshot: ${filePath}`)

  const height = maxHeight ? Math.min(box.height + padding * 2, maxHeight) : box.height + padding * 2

  await page.screenshot({
    path: filePath,
    type: 'png',
    clip: {
      x: Math.max(0, box.x - padding),
      y: Math.max(0, box.y - padding),
      width: box.width + padding * 2,
      height,
    },
  })
}

/**
 * Screenshot a region spanning from the top of one element to the bottom of another.
 */
export async function screenshotRegion(
  page: Page,
  topLocator: Locator,
  bottomLocator: Locator,
  filePath: string,
  opts: ScreenshotOpts = {},
): Promise<void> {
  const { padding = 4, maxHeight } = opts
  const topBox = await topLocator.boundingBox()
  const bottomBox = await bottomLocator.boundingBox()
  if (!topBox || !bottomBox) throw new Error(`Elements not found for region screenshot: ${filePath}`)

  const x = Math.max(0, Math.min(topBox.x, bottomBox.x) - padding)
  const y = Math.max(0, topBox.y - padding)
  const right = Math.max(topBox.x + topBox.width, bottomBox.x + bottomBox.width) + padding
  const bottom = bottomBox.y + bottomBox.height + padding
  const width = right - x
  let height = bottom - y

  if (maxHeight) height = Math.min(height, maxHeight)

  await page.screenshot({
    path: filePath,
    type: 'png',
    clip: { x, y, width, height },
  })
}

/**
 * Wait for a Monaco editor to be fully loaded within a container.
 * Waits for the .monaco-editor element and its view lines to render.
 */
export async function waitForMonaco(container: Locator, timeout = 10000): Promise<Locator> {
  const editor = container.locator('.monaco-editor').first()
  await expect(editor).toBeVisible({ timeout })
  // Wait for actual content to render (view lines appear)
  await expect(container.locator('.view-lines')).toBeVisible({ timeout: 5000 })
  return editor
}

/**
 * Wait for a Monaco diff editor to fully stabilize.
 * In side-by-side mode, waits for both editor sides to render and forces
 * the sash to a deterministic 50% position. In inline mode, just waits
 * for the diff editor content to render.
 */
export async function waitForDiffEditor(container: Locator, opts?: { timeout?: number }): Promise<void> {
  const timeout = opts?.timeout ?? 10000
  const page = container.page()

  // Wait for the diff editor container
  await expect(container.locator('.monaco-diff-editor').first()).toBeVisible({ timeout })

  // Detect if we're in side-by-side or inline mode
  const isSideBySide = await container.locator('.original-in-monaco-diff-editor').isVisible().catch(() => false)

  if (isSideBySide) {
    // Wait for both sides to render their content
    await expect(container.locator('.original-in-monaco-diff-editor .view-lines').first()).toBeVisible({ timeout: 5000 })
    await expect(container.locator('.modified-in-monaco-diff-editor .view-lines').first()).toBeVisible({ timeout: 5000 })
  } else {
    // Inline mode — just wait for content to render
    await expect(container.locator('.monaco-diff-editor .view-lines').first()).toBeVisible({ timeout: 5000 })
  }

  // Wait for layout to stabilize (dimensions non-zero)
  await page.waitForFunction(() => {
    const el = document.querySelector('.monaco-diff-editor')
    return el && el.clientWidth > 0 && el.clientHeight > 0
  }, { timeout: 5000 })

  // In side-by-side mode, force the sash to exactly 50% to eliminate split-position variance
  if (isSideBySide) {
    await page.evaluate(() => {
      const diffContainer = document.querySelector('.monaco-diff-editor')
      if (!diffContainer) return
      const sash = diffContainer.querySelector('.monaco-sash.vertical') as HTMLElement | null
      if (!sash) return
      // Simulate a pointer drag to force Monaco to recompute the split at 50%
      const containerWidth = diffContainer.clientWidth
      const targetX = Math.round(containerWidth / 2)
      const rect = diffContainer.getBoundingClientRect()
      const clientX = rect.left + targetX
      const clientY = rect.top + rect.height / 2
      sash.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, bubbles: true }))
      sash.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }))
      sash.dispatchEvent(new PointerEvent('pointerup', { clientX, clientY, bubbles: true }))
    })

    // Wait for Monaco to process the sash move and re-layout
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
  }
}

/**
 * Wait for the explorer panel to be fully loaded with content.
 */
export async function waitForExplorer(page: Page): Promise<Locator> {
  const explorer = page.locator('[data-panel-id="explorer"]')
  await expect(explorer).toBeVisible({ timeout: 5000 })
  return explorer
}

/**
 * Click an element and wait for another element to become visible.
 * Replaces the pattern: click() → waitForTimeout() → expect().toBeVisible()
 */
export async function clickAndWaitFor(
  clickTarget: Locator,
  waitTarget: Locator,
  timeout = 5000,
): Promise<void> {
  await clickTarget.click()
  await expect(waitTarget).toBeVisible({ timeout })
}

/**
 * Scroll a container so that a target element is visible, then verify it.
 */
export async function scrollToVisible(target: Locator, timeout = 5000): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  await expect(target).toBeVisible({ timeout })
}

/**
 * Screenshot an explicit clip region of the page.
 */
export async function screenshotClip(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  filePath: string,
): Promise<void> {
  await page.screenshot({
    path: filePath,
    type: 'png',
    clip,
  })
}
