/**
 * Feature Documentation: Divider Drag Resize
 *
 * Demonstrates that the file viewer divider can be dragged to resize
 * in both top and left layout positions. Tests both the original left-layout
 * fix (wrapper collapsed to zero height) and the top-layout fix (invisible
 * terminal containers intercepting pointer events after xterm 6.0 migration).
 *
 * Run with: pnpm test:feature-docs horiz-drag-resize
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

test.setTimeout(60000)

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
}, { timeout: 60000 })

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Divider Drag Resize',
      description:
        'The file viewer can be positioned above (top) or to the left of the terminal. ' +
        'This walkthrough verifies that the divider can be dragged to resize in both positions. ' +
        'The xterm 6.0 migration changed hidden terminals from display:none to visibility:hidden, ' +
        'requiring pointer-events-none on inactive containers to prevent event interception.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Find the divider element between file viewer and terminal. */
async function getDividerInfo(p: Page, direction: 'vertical' | 'horizontal') {
  const cursorClass = direction === 'vertical' ? 'cursor-col-resize' : 'cursor-row-resize'
  return p.evaluate((cls) => {
    const divider = document.querySelector(`[data-panel-id="fileViewer"]`)?.parentElement?.querySelector(`.${cls}`) as HTMLElement
    if (!divider) return null
    const rect = divider.getBoundingClientRect()
    const hitArea = divider.querySelector('[class*="z-10"]') as HTMLElement
    const hitRect = hitArea ? hitArea.getBoundingClientRect() : null
    return {
      dividerRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hitAreaRect: hitRect ? { x: hitRect.x, y: hitRect.y, width: hitRect.width, height: hitRect.height } : null,
    }
  }, cursorClass)
}

/** Add a mousedown listener to verify events reach the divider. */
async function addDividerMouseDownListener(p: Page, direction: 'vertical' | 'horizontal', key: string) {
  const cursorClass = direction === 'vertical' ? 'cursor-col-resize' : 'cursor-row-resize'
  await p.evaluate(({ cls, k }) => {
    const divider = document.querySelector(`[data-panel-id="fileViewer"]`)?.parentElement?.querySelector(`.${cls}`) as HTMLElement
    if (divider) {
      divider.addEventListener('mousedown', () => {
        (window as unknown as Record<string, boolean>)[k] = true
      }, { capture: true })
    }
  }, { cls: cursorClass, k: key })
}

test.describe.serial('Feature: Divider Drag Resize', () => {
  test('Step 1: Open file viewer in default top position', async () => {
    // Open explorer panel
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Click on a file to open file viewer
    await explorerPanel.locator('text=package.json').first().click()

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    // Screenshot the initial layout (default: top position)
    const contentArea = fileViewer.locator('..')
    await screenshotElement(page, contentArea, path.join(SCREENSHOTS, '01-file-viewer-top.png'), {
      maxHeight: 600,
    })

    steps.push({
      screenshotPath: 'screenshots/01-file-viewer-top.png',
      caption: 'File viewer in default top position',
      description:
        'File viewer opens above the terminal. The horizontal divider between them should be draggable.',
    })
  })

  test('Step 2: Drag divider in top position to resize file viewer height', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    const initialBox = await fileViewer.boundingBox()
    if (!initialBox) throw new Error('File viewer not visible')
    const initialHeight = initialBox.height

    const dividerInfo = await getDividerInfo(page, 'horizontal')
    if (!dividerInfo) throw new Error('Horizontal divider not found')

    // Verify mousedown events reach the divider
    await addDividerMouseDownListener(page, 'horizontal', '__topDividerMouseDown')

    // Use the hit area center for mouse interactions
    const hitRect = dividerInfo.hitAreaRect ?? dividerInfo.dividerRect
    const startX = hitRect.x + hitRect.width / 2
    const startY = hitRect.y + hitRect.height / 2

    // Drag the divider downward to make the file viewer taller
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(startX, startY + (80 * i / 12))
    }
    await page.mouse.up()

    // Verify mousedown fired and size changed
    const debugInfo = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      return { mouseDownFired: !!w.__topDividerMouseDown }
    })
    expect(debugInfo.mouseDownFired).toBe(true)

    // Wait for layout to settle, then verify file viewer grew
    await expect(async () => {
      const finalBox = await fileViewer.boundingBox()
      expect(finalBox!.height).toBeGreaterThan(initialHeight + 20)
    }).toPass({ timeout: 2000 })

    const finalBox = await fileViewer.boundingBox()!
    const finalHeight = finalBox!.height

    const contentArea = fileViewer.locator('..')
    await screenshotElement(page, contentArea, path.join(SCREENSHOTS, '02-top-drag-result.png'), {
      maxHeight: 600,
    })

    steps.push({
      screenshotPath: 'screenshots/02-top-drag-result.png',
      caption: `Top position: file viewer resized from ${Math.round(initialHeight)}px to ${Math.round(finalHeight)}px tall`,
      description:
        'After dragging the horizontal divider downward, the file viewer grows taller. ' +
        'This confirms pointer events reach the divider even with invisible terminal containers ' +
        'using visibility:hidden (they have pointer-events-none to prevent interception).',
    })
  })

  test('Step 3: Switch to horizontal (left) layout', async () => {
    const leftPositionBtn = page.locator('button[title="Position left of agent"]')
    await expect(leftPositionBtn).toBeVisible()
    await leftPositionBtn.click()

    // Wait for the layout to change to flex-row by checking divider direction
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()

    const contentArea = fileViewer.locator('..')
    await screenshotElement(page, contentArea, path.join(SCREENSHOTS, '03-file-viewer-left.png'), {
      maxHeight: 600,
    })

    steps.push({
      screenshotPath: 'screenshots/03-file-viewer-left.png',
      caption: 'File viewer switched to left position',
      description:
        'After clicking the position toggle, the file viewer moves to the left of the terminal. ' +
        'The vertical divider between them should be draggable.',
    })
  })

  test('Step 4: Verify vertical divider has non-zero height', async () => {
    const dividerHeight = await page.evaluate(() => {
      const divider = document.querySelector('[data-panel-id="fileViewer"]')?.parentElement?.querySelector('.cursor-col-resize')
      if (!divider) return 0
      return divider.getBoundingClientRect().height
    })

    expect(dividerHeight).toBeGreaterThan(100)

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    const contentArea = fileViewer.locator('..')
    await screenshotElement(page, contentArea, path.join(SCREENSHOTS, '04-divider-visible.png'), {
      maxHeight: 600,
    })

    steps.push({
      screenshotPath: 'screenshots/04-divider-visible.png',
      caption: `Vertical divider has height of ${Math.round(dividerHeight)}px`,
      description:
        'The vertical divider between file viewer and terminal has full height ' +
        'because the wrapper div uses display:flex.',
    })
  })

  test('Step 5: Drag divider in left position to resize file viewer width', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    const initialBox = await fileViewer.boundingBox()
    if (!initialBox) throw new Error('File viewer not visible')
    const initialWidth = initialBox.width

    const dividerInfo = await getDividerInfo(page, 'vertical')
    if (!dividerInfo) throw new Error('Vertical divider not found')

    await addDividerMouseDownListener(page, 'vertical', '__leftDividerMouseDown')

    const hitRect = dividerInfo.hitAreaRect ?? dividerInfo.dividerRect
    const startX = hitRect.x + hitRect.width / 2
    const startY = hitRect.y + hitRect.height / 2

    // Drag the divider to the right to make the file viewer wider
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(startX + (120 * i / 12), startY)
    }
    await page.mouse.up()

    // Verify mousedown fired
    const debugInfo = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      return { mouseDownFired: !!w.__leftDividerMouseDown }
    })
    expect(debugInfo.mouseDownFired).toBe(true)

    // Wait for layout to settle, then verify file viewer grew
    await expect(async () => {
      const finalBox = await fileViewer.boundingBox()
      expect(finalBox!.width).toBeGreaterThan(initialWidth + 20)
    }).toPass({ timeout: 2000 })

    const finalBox = await fileViewer.boundingBox()!
    const finalWidth = finalBox!.width

    const contentArea = fileViewer.locator('..')
    await screenshotElement(page, contentArea, path.join(SCREENSHOTS, '05-left-drag-result.png'), {
      maxHeight: 600,
    })

    steps.push({
      screenshotPath: 'screenshots/05-left-drag-result.png',
      caption: `Left position: file viewer resized from ${Math.round(initialWidth)}px to ${Math.round(finalWidth)}px wide`,
      description:
        'After dragging the vertical divider to the right, the file viewer grows wider. ' +
        'This confirms the horizontal layout drag resize works correctly.',
    })
  })
})
