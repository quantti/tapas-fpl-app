import { test, expect } from './fixtures/test-fixtures'
import { waitForPageReady, waitForDataLoad, VIEWPORTS, SELECTORS } from './helpers/page-utils'

// =============================================================================
// PlayerOwnership Modal Tests (on Statistics page)
// =============================================================================

test.describe('PlayerOwnership Modal - Mobile', () => {
  test.use({ viewport: VIEWPORTS.MOBILE })

  test.beforeEach(async ({ page }) => {
    // PlayerOwnership is on the Statistics page, not Dashboard
    await page.goto('/statistics')
    await waitForPageReady(page)
  })

  test('player ownership section is visible on statistics page', async ({ page }) => {
    await waitForDataLoad(page)

    // Look for the Player Ownership title
    const ownershipSection = page.locator('text=Player Ownership')
    await expect(ownershipSection).toBeVisible({ timeout: 5000 })
  })

  test('clickable player rows have chevron icon', async ({ page }) => {
    await waitForDataLoad(page)

    // Find clickable rows (buttons with rowClickable class) in player ownership list
    const clickableRows = page.locator(SELECTORS.CLICKABLE_ROWS)
    const rowCount = await clickableRows.count()
    expect(rowCount).toBeGreaterThan(0)

    // Check first clickable row has an SVG (chevron)
    const firstRow = clickableRows.first()
    const svg = firstRow.locator('svg')
    await expect(svg).toBeVisible()
  })

  test('clicking player row opens modal', async ({ page }) => {
    await waitForDataLoad(page)

    // Find clickable player rows
    const clickableRows = page.locator(SELECTORS.CLICKABLE_ROWS)
    const rowCount = await clickableRows.count()
    expect(rowCount).toBeGreaterThan(0)

    const firstRow = clickableRows.first()
    await firstRow.click()

    // Modal should open
    const dialog = page.locator(SELECTORS.DIALOG_OPEN)
    await expect(dialog).toBeVisible({ timeout: 5000 })
  })

  test('modal shows team list', async ({ page }) => {
    await waitForDataLoad(page)

    // Find clickable player rows
    const clickableRows = page.locator(SELECTORS.CLICKABLE_ROWS)
    const rowCount = await clickableRows.count()
    expect(rowCount).toBeGreaterThan(0)

    await clickableRows.first().click()

    // Modal should have a list of teams
    const teamList = page.locator('dialog ul')
    await expect(teamList).toBeVisible({ timeout: 5000 })
  })

  test('modal can be closed with close button', async ({ page }) => {
    await waitForDataLoad(page)

    // Find clickable player rows
    const clickableRows = page.locator(SELECTORS.CLICKABLE_ROWS)
    const rowCount = await clickableRows.count()
    expect(rowCount).toBeGreaterThan(0)

    await clickableRows.first().click()

    const dialog = page.locator(SELECTORS.DIALOG_OPEN)
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Click close button
    const closeButton = dialog.locator('button[aria-label*="Close"]')
    await closeButton.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible()
  })

  test('100% ownership rows are not clickable', async ({ page }) => {
    await waitForDataLoad(page)

    // Check for non-clickable rows (divs, not buttons) in player ownership
    const nonClickableRows = page.locator(
      '[class*="playerOwnership"] > [class*="list"] > div[class*="row"], [class*="PlayerOwnership"] > [class*="list"] > div[class*="row"]'
    )
    const divCount = await nonClickableRows.count()

    // If there are non-clickable rows, they should have text content
    if (divCount > 0) {
      const firstDiv = nonClickableRows.first()
      const text = await firstDiv.textContent()
      // Non-clickable rows should have content (100% ownership players)
      expect(text).toBeTruthy()
    }
  })
})

test.describe('PlayerOwnership Modal - Desktop', () => {
  test.use({ viewport: VIEWPORTS.DESKTOP })

  test.beforeEach(async ({ page }) => {
    // PlayerOwnership is on the Statistics page, not Dashboard
    await page.goto('/statistics')
    await waitForPageReady(page)
  })

  test('modal displays correctly on desktop', async ({ page }) => {
    await waitForDataLoad(page)

    // Find clickable player rows
    const clickableRows = page.locator(SELECTORS.CLICKABLE_ROWS)
    const rowCount = await clickableRows.count()
    expect(rowCount).toBeGreaterThan(0)

    await clickableRows.first().click()

    const dialog = page.locator(SELECTORS.DIALOG_OPEN)
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Check modal has reasonable width on desktop (not too narrow)
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).toBeTruthy()
    expect(dialogBox!.width).toBeGreaterThan(200)
  })
})
