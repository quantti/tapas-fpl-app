import { test, expect } from './fixtures/test-fixtures'
import { waitForPageReady, VIEWPORTS } from './helpers/page-utils'

// =============================================================================
// Dashboard Page Tests
// =============================================================================

test.describe('Dashboard - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('renders without horizontal overflow', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('page title is correct', async ({ page }) => {
    await expect(page).toHaveTitle('Tapas and Tackles')
  })

  test('header is visible', async ({ page }) => {
    const header = page.locator('header')
    await expect(header).toBeVisible()
  })

  test('hamburger menu button is visible', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]')
    await expect(menuButton).toBeVisible()
  })
})

test.describe('Dashboard - Mobile', () => {
  test.use({ viewport: VIEWPORTS.MOBILE })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('no horizontal overflow on mobile', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('app container has mobile padding', async ({ page }) => {
    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding
    })
    // Should be 12px on mobile (var(--space-12))
    expect(appPadding).toMatch(/12px/)
  })

  test('header displays logo', async ({ page }) => {
    const logo = page.locator('[class*="logo"]')
    await expect(logo).toBeVisible()
    await expect(logo).toContainText('Tapas & Tackles')
  })

  test('hamburger menu opens and closes', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]')
    const nav = page.locator('nav[class*="nav"]')

    // Menu should be hidden initially
    await expect(nav).not.toBeVisible()

    // Open menu
    await menuButton.click()
    await expect(nav).toBeVisible()

    // Close menu
    await menuButton.click()
    await expect(nav).not.toBeVisible()
  })

  test('menu closes when clicking outside', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]')
    const nav = page.locator('nav[class*="nav"]')

    // Open menu
    await menuButton.click()
    await expect(nav).toBeVisible()

    // Click outside (on the header logo area)
    await page.locator('[class*="logo"]').click()
    await expect(nav).not.toBeVisible()
  })

  test('league standings table is visible', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 5000 })
  })

  test('visual snapshot - mobile dashboard', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})

test.describe('Dashboard - Tablet', () => {
  test.use({ viewport: VIEWPORTS.TABLET })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('no horizontal overflow on tablet', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('app container has desktop padding at tablet width', async ({ page }) => {
    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding
    })
    expect(appPadding).toMatch(/24px/)
  })

  test('visual snapshot - tablet dashboard', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('dashboard-tablet.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})

test.describe('Dashboard - Desktop', () => {
  test.use({ viewport: VIEWPORTS.DESKTOP })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)
  })

  test('app container has desktop padding', async ({ page }) => {
    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding
    })
    expect(appPadding).toMatch(/24px/)
  })

  test('no horizontal overflow on desktop', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('visual snapshot - desktop dashboard', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('dashboard-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})
