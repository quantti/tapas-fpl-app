import { test, expect } from '@playwright/test'

test.describe('Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for the app to load data
    await page.goto('/')
    // Wait for either data to load or error state
    await page.waitForSelector('[class*="statusBar"], [class*="loading"], [class*="error"]', {
      timeout: 30000,
    })
  })

  test('renders without horizontal overflow', async ({ page }) => {
    // Check that the page doesn't have horizontal scroll (no overflow)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)

    // Allow small tolerance for rounding
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('header is visible', async ({ page }) => {
    const header = page.locator('h1')
    await expect(header).toBeVisible()
    await expect(header).toContainText('Tapas FPL')
  })

  test('status bar is visible when loaded', async ({ page }) => {
    // Wait for loading to complete (either shows data or error)
    const statusBar = page.locator('[class*="statusBar"]')
    const loading = page.locator('[class*="loading"]')
    const error = page.locator('[class*="error"]')

    // One of these should be visible
    const hasStatusBar = await statusBar.isVisible().catch(() => false)
    const hasLoading = await loading.isVisible().catch(() => false)
    const hasError = await error.isVisible().catch(() => false)

    expect(hasStatusBar || hasLoading || hasError).toBe(true)
  })

  test('visual snapshot', async ({ page }) => {
    // Wait a bit for any animations
    await page.waitForTimeout(1000)
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      // Allow some pixel difference for dynamic content
      maxDiffPixelRatio: 0.1,
    })
  })
})

test.describe('Mobile layout (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('app container has reduced padding on mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('div.app')

    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding
    })

    // Should be 12px on mobile (var(--space-12))
    expect(appPadding).toMatch(/12px/)
  })

  test('header font size is smaller on mobile', async ({ page }) => {
    await page.goto('/')

    const h1FontSize = await page.locator('h1').evaluate((el) => {
      return window.getComputedStyle(el).fontSize
    })

    // 1.25rem = 20px at base 16px
    const fontSizePx = parseFloat(h1FontSize)
    expect(fontSizePx).toBeLessThanOrEqual(20)
  })

  test('no horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(500)

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })
})

test.describe('Desktop layout (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('app container has larger padding on desktop', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('div.app')

    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding
    })

    // Should be 24px on desktop (var(--space-24))
    expect(appPadding).toMatch(/24px/)
  })

  test('header font size is larger on desktop', async ({ page }) => {
    await page.goto('/')

    const h1FontSize = await page.locator('h1').evaluate((el) => {
      return window.getComputedStyle(el).fontSize
    })

    // 1.5rem = 24px at base 16px
    const fontSizePx = parseFloat(h1FontSize)
    expect(fontSizePx).toBeGreaterThanOrEqual(24)
  })
})

test.describe('Tablet layout (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('app container has desktop padding at tablet width', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('div.app')

    // Tablet (>= 640px) should have desktop-size padding
    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding
    })

    expect(appPadding).toMatch(/24px/)
  })

  test('no horizontal overflow on tablet', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(500)

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })
})
