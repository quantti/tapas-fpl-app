import { test, expect } from './fixtures/test-fixtures'
import {
  waitForPageReady,
  waitForDataLoad,
  VIEWPORTS,
  openHamburgerMenu,
  SELECTORS,
} from './helpers/page-utils'

// =============================================================================
// Analytics Page Tests
// =============================================================================

test.describe('Analytics - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH)
    await waitForPageReady(page)
  })

  test('renders without horizontal overflow', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('header is visible', async ({ page }) => {
    const header = page.locator('header')
    await expect(header).toBeVisible()
  })

  test('analytics title is visible', async ({ page }) => {
    const title = page.locator('h1')
    await expect(title).toContainText('Analytics')
  })

  test('recommendations section is visible', async ({ page }) => {
    await waitForDataLoad(page)
    const section = page.locator('h2:has-text("Recommendations")')
    await expect(section).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Analytics - Recommendation Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH)
    await waitForPageReady(page)
    await waitForDataLoad(page)
  })

  test('shows Punts recommendation card', async ({ page }) => {
    const puntsCard = page.locator('text=Punts').first()
    await expect(puntsCard).toBeVisible({ timeout: 5000 })
  })

  test('shows Defensive Options recommendation card', async ({ page }) => {
    const defensiveCard = page.locator('text=Defensive Options').first()
    await expect(defensiveCard).toBeVisible({ timeout: 5000 })
  })

  test('shows Time to Sell recommendation card', async ({ page }) => {
    const sellCard = page.locator('text=Time to Sell').first()
    await expect(sellCard).toBeVisible({ timeout: 5000 })
  })

  test('recommendation cards show player names', async ({ page }) => {
    // Wait for cards to load
    await page.waitForTimeout(500)

    // Check that at least one player name is displayed
    const playerRows = page.locator('[class*="RecommendedPlayers"] [class*="row"]')
    const rowCount = await playerRows.count()

    // Should have some player recommendations
    expect(rowCount).toBeGreaterThan(0)
  })

  test('clicking a player opens player modal', async ({ page }) => {
    // Wait for cards to load
    await page.waitForTimeout(500)

    // Find a clickable player row
    const playerRow = page.locator('[class*="RecommendedPlayers"] button').first()
    await playerRow.click()

    // Player modal should open
    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
  })

  test('player modal can be closed', async ({ page }) => {
    await page.waitForTimeout(500)

    // Open player modal
    const playerRow = page.locator('[class*="RecommendedPlayers"] button').first()
    await playerRow.click()

    // Wait for modal
    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Close modal
    const closeButton = page.locator('dialog[open] button[aria-label*="Close"]')
    await closeButton.click()

    // Modal should be closed
    await expect(dialog).not.toBeVisible()
  })
})

test.describe('Analytics - Mobile', () => {
  test.use({ viewport: VIEWPORTS.MOBILE })

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH)
    await waitForPageReady(page)
  })

  test('no horizontal overflow on mobile', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('hamburger menu navigation works', async ({ page }) => {
    await openHamburgerMenu(page)

    // Check Dashboard link is visible
    const dashboardLink = page.locator('nav a[href="/"]')
    await expect(dashboardLink).toBeVisible()

    // Check Analytics link is visible
    const analyticsLink = page.locator('nav a[href="/analytics"]')
    await expect(analyticsLink).toBeVisible()
  })

  test('can navigate to Dashboard from Analytics', async ({ page }) => {
    await openHamburgerMenu(page)

    const dashboardLink = page.locator('nav a[href="/"]')
    await dashboardLink.click()

    // Should navigate to dashboard
    await expect(page).toHaveURL('/')
  })

  test('recommendation cards are visible on mobile', async ({ page }) => {
    await waitForDataLoad(page)

    // Check that recommendation cards are visible
    const puntsCard = page.locator('text=Punts').first()
    await expect(puntsCard).toBeVisible({ timeout: 5000 })

    const defensiveCard = page.locator('text=Defensive Options').first()
    await expect(defensiveCard).toBeVisible({ timeout: 5000 })
  })

  test('visual snapshot - mobile analytics', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('analytics-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})

test.describe('Analytics - Tablet', () => {
  test.use({ viewport: VIEWPORTS.TABLET })

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH)
    await waitForPageReady(page)
  })

  test('no horizontal overflow on tablet', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('visual snapshot - tablet analytics', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('analytics-tablet.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})

test.describe('Analytics - Desktop', () => {
  test.use({ viewport: VIEWPORTS.DESKTOP })

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH)
    await waitForPageReady(page)
  })

  test('no horizontal overflow on desktop', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('visual snapshot - desktop analytics', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('analytics-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})
