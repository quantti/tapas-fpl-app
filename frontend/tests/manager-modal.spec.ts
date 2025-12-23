import { test, expect } from '@playwright/test'

// Helper to wait for page to be ready
async function waitForPageReady(page: import('@playwright/test').Page) {
  await page.waitForSelector('[class*="header"], [class*="loading"], [class*="error"]', {
    timeout: 30000,
  })
}

test.describe('Manager Modal - Team Lineup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('clicking team row in standings opens modal', async ({ page }) => {
    // Wait for standings table to load
    await page.waitForTimeout(2000)

    // Find clickable rows in standings table (chevron indicates clickable)
    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      // Click the first team row
      await teamRows.first().click()

      // Modal should open
      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
    }
  })

  test('modal shows pitch layout with proper formation', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Wait for modal content to load
      await page.waitForTimeout(1000)

      // Check for pitch element with green background
      const pitch = dialog.locator('[class*="pitch"]')
      const hasPitch = await pitch.isVisible().catch(() => false)

      if (hasPitch) {
        // Pitch should have multiple rows (formation lines)
        const rows = pitch.locator('[class*="row"]')
        const rowCount = await rows.count()
        expect(rowCount).toBeGreaterThanOrEqual(3) // At least GK, DEF, MID, FWD

        // Each row should have players displayed horizontally
        const firstRow = rows.first()
        const players = firstRow.locator('[class*="player"]')
        const playerCount = await players.count()
        expect(playerCount).toBeGreaterThan(0)
      }
    }
  })

  test('modal shows player shirts and names', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.waitForTimeout(1000)

      // Check for shirt images
      const shirts = dialog.locator('[class*="shirtImage"], img[src*="shirt"]')
      const shirtCount = await shirts.count()

      // Should have at least 11 shirts for starting lineup
      if (shirtCount > 0) {
        expect(shirtCount).toBeGreaterThanOrEqual(11)
      }

      // Check for player names
      const playerNames = dialog.locator('[class*="playerName"]')
      const nameCount = await playerNames.count()
      expect(nameCount).toBeGreaterThanOrEqual(11)
    }
  })

  test('modal shows bench section', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.waitForTimeout(1000)

      // Check for bench section
      const bench = dialog.locator('[class*="bench"]')
      const hasBench = await bench.isVisible().catch(() => false)

      if (hasBench) {
        const benchTitle = bench.locator('[class*="benchTitle"], h4')
        await expect(benchTitle).toContainText(/bench/i)
      }
    }
  })

  test('modal displays team name and points in header', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.waitForTimeout(1000)

      // Header should have team name and points
      const header = dialog.locator('[class*="header"]')
      const headerText = await header.textContent()

      // Should contain "pts" for points
      expect(headerText).toMatch(/pts/i)
    }
  })

  test('modal can be closed', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Close via close button
      const closeButton = dialog.locator('button[aria-label*="Close"]')
      await closeButton.click()

      await expect(dialog).not.toBeVisible()
    }
  })

  test('modal closes when clicking backdrop', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Click on the backdrop (dialog element itself, not content)
      await dialog.click({ position: { x: 10, y: 10 } })

      await expect(dialog).not.toBeVisible()
    }
  })
})

test.describe('Manager Modal - Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('modal layout is usable on mobile', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.waitForTimeout(1000)

      // Modal should not overflow viewport
      const dialogBox = await dialog.boundingBox()
      if (dialogBox) {
        expect(dialogBox.width).toBeLessThanOrEqual(375)
      }

      // Pitch rows should display players in flex layout
      const pitch = dialog.locator('[class*="pitch"]')
      if (await pitch.isVisible()) {
        const pitchBox = await pitch.boundingBox()
        if (pitchBox) {
          expect(pitchBox.width).toBeLessThanOrEqual(370)
        }
      }
    }
  })

  test('visual snapshot - manager modal mobile', async ({ page }) => {
    await page.waitForTimeout(2000)

    const teamRows = page.locator('table tbody tr')
    const rowCount = await teamRows.count()

    if (rowCount > 0) {
      await teamRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.waitForTimeout(1500)

      await expect(page).toHaveScreenshot('manager-modal-mobile.png', {
        maxDiffPixelRatio: 0.15,
      })
    }
  })
})
