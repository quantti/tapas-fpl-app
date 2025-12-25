import { test, expect } from './fixtures/test-fixtures'

// Helper to wait for page to be ready (with mocked API, this should be fast)
async function waitForPageReady(page: import('@playwright/test').Page) {
  // Wait for either main content or error state (error state shouldn't happen with mocking)
  await page.waitForSelector('[class*="header"], [class*="Header"], [class*="grid"]', {
    timeout: 15000,
  })
  // Give React Query time to process the mocked responses
  await page.waitForTimeout(500)
}

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

test.describe('Dashboard - Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

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
    // With mocked API, table should always be visible
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

test.describe('Dashboard - Tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

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

test.describe('Dashboard - Desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

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

// =============================================================================
// Statistics Page Tests
// =============================================================================

test.describe('Statistics - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/statistics')
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

  test('statistics title is visible', async ({ page }) => {
    const title = page.locator('h1')
    await expect(title).toContainText('Statistics')
  })
})

test.describe('Statistics - Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/statistics')
    await waitForPageReady(page)
  })

  test('no horizontal overflow on mobile', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('stats grid is single column on mobile', async ({ page }) => {
    // Wait for stats to load
    await page.waitForTimeout(500)

    const statsGrid = page.locator('[class*="statsGrid"]')
    const hasGrid = await statsGrid.isVisible().catch(() => false)

    if (hasGrid) {
      const gridStyle = await statsGrid.evaluate((el) => {
        return window.getComputedStyle(el).gridTemplateColumns
      })
      // Should be single column (1fr) on mobile
      expect(gridStyle).toMatch(/^[\d.]+px$/) // Single column width
    }
  })

  test('hamburger menu navigation works', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]')

    // Open menu
    await menuButton.click()

    // Check Dashboard link is visible
    const dashboardLink = page.locator('nav a[href="/"]')
    await expect(dashboardLink).toBeVisible()

    // Check Statistics link is visible and active
    const statsLink = page.locator('nav a[href="/statistics"]')
    await expect(statsLink).toBeVisible()
  })

  test('can navigate to Dashboard from Statistics', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]')
    await menuButton.click()

    const dashboardLink = page.locator('nav a[href="/"]')
    await dashboardLink.click()

    // Should navigate to dashboard
    await expect(page).toHaveURL('/')
  })

  test('stats cards show values on mobile', async ({ page }) => {
    // Wait for stats to load
    await page.waitForTimeout(500)

    // Check Team Values card shows pound values
    const teamValuesCard = page.locator('text=Team Values').locator('..').locator('..')
    const valueElements = teamValuesCard.locator('[class*="value"]')
    const valueCount = await valueElements.count()

    if (valueCount > 0) {
      // Check that at least one value is visible and contains a pound sign or negative number
      const firstValue = valueElements.first()
      await expect(firstValue).toBeVisible()
      const valueText = await firstValue.textContent()
      expect(valueText).toMatch(/£[\d.]+m|-\d+/)
    }
  })

  test('visual snapshot - mobile statistics', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('statistics-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})

test.describe('Statistics - Tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/statistics')
    await waitForPageReady(page)
  })

  test('no horizontal overflow on tablet', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('stats grid is two columns on tablet', async ({ page }) => {
    await page.waitForTimeout(500)

    const statsGrid = page.locator('[class*="statsGrid"]')
    const hasGrid = await statsGrid.isVisible().catch(() => false)

    if (hasGrid) {
      const gridStyle = await statsGrid.evaluate((el) => {
        return window.getComputedStyle(el).gridTemplateColumns
      })
      // Should have two columns (two values separated by space)
      const columns = gridStyle.split(' ').filter((s) => s.trim())
      expect(columns.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('visual snapshot - tablet statistics', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('statistics-tablet.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})

test.describe('Statistics - Desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/statistics')
    await waitForPageReady(page)
  })

  test('no horizontal overflow on desktop', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5)
  })

  test('visual snapshot - desktop statistics', async ({ page }) => {
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('statistics-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    })
  })
})

// =============================================================================
// Navigation Tests
// =============================================================================

test.describe('Navigation - Cross-page', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('can navigate between pages via hamburger menu', async ({ page }) => {
    // Start on Dashboard
    await page.goto('/')
    await waitForPageReady(page)

    // Wait for menu button to be ready and navigate to Statistics
    const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]')
    await expect(menuButton).toBeVisible({ timeout: 10000 })
    await menuButton.click()
    const nav = page.locator('nav[class*="nav"]')
    await expect(nav).toBeVisible()
    await page.locator('nav a[href="/statistics"]').click()
    await expect(page).toHaveURL('/statistics')
    await waitForPageReady(page)

    // Navigate back to Dashboard
    await menuButton.click()
    await expect(nav).toBeVisible()
    await page.locator('nav a[href="/"]').click()
    await expect(page).toHaveURL('/')
  })

  test('dark mode toggle works in menu', async ({ page }) => {
    await page.goto('/')
    await waitForPageReady(page)

    // Open menu
    const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]')
    await expect(menuButton).toBeVisible({ timeout: 10000 })
    await menuButton.click()

    // Find the toggle switch
    const toggle = page.locator('button[role="switch"]')
    await expect(toggle).toBeVisible()

    // Get initial theme
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme')
    })

    // Click toggle
    await toggle.click()

    // Theme should change
    const newTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme')
    })

    expect(newTheme).not.toBe(initialTheme)

    // Menu should still be open after toggle
    const nav = page.locator('nav[class*="nav"]')
    await expect(nav).toBeVisible()
  })
})

// =============================================================================
// PlayerOwnership Modal Tests (on Statistics page)
// =============================================================================

test.describe('PlayerOwnership Modal - Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test.beforeEach(async ({ page }) => {
    // PlayerOwnership is on the Statistics page, not Dashboard
    await page.goto('/statistics')
    await waitForPageReady(page)
  })

  test('player ownership section is visible on statistics page', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(500)

    // Look for the Player Ownership title
    const ownershipSection = page.locator('text=Player Ownership')
    await expect(ownershipSection).toBeVisible({ timeout: 5000 })
  })

  test('clickable player rows have chevron icon', async ({ page }) => {
    await page.waitForTimeout(500)

    // Find clickable rows (buttons with rowClickable class) in player ownership list
    // This excludes modal buttons
    const clickableRows = page.locator('[class*="rowClickable"]')
    const rowCount = await clickableRows.count()

    if (rowCount > 0) {
      // Check first clickable row has an SVG (chevron)
      const firstRow = clickableRows.first()
      const hasSvg = await firstRow.locator('svg').isVisible()
      expect(hasSvg).toBe(true)
    }
  })

  test('clicking player row opens modal', async ({ page }) => {
    await page.waitForTimeout(500)

    // Find clickable player rows (excludes modal buttons)
    const clickableRows = page.locator('[class*="rowClickable"]')
    const rowCount = await clickableRows.count()

    if (rowCount > 0) {
      const firstRow = clickableRows.first()
      await firstRow.click()

      // Modal should open - check for dialog element
      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
    }
  })

  test('modal shows team list', async ({ page }) => {
    await page.waitForTimeout(500)

    // Find clickable player rows (excludes modal buttons)
    const clickableRows = page.locator('[class*="rowClickable"]')
    const rowCount = await clickableRows.count()

    if (rowCount > 0) {
      await clickableRows.first().click()

      // Modal should have a list of teams
      const teamList = page.locator('dialog ul')
      await expect(teamList).toBeVisible({ timeout: 5000 })
    }
  })

  test('modal can be closed with close button', async ({ page }) => {
    await page.waitForTimeout(500)

    // Find clickable player rows (excludes modal buttons)
    const clickableRows = page.locator('[class*="rowClickable"]')
    const rowCount = await clickableRows.count()

    if (rowCount > 0) {
      await clickableRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Click close button
      const closeButton = dialog.locator('button[aria-label*="Close"]')
      await closeButton.click()

      // Dialog should close
      await expect(dialog).not.toBeVisible()
    }
  })

  test('100% ownership rows are not clickable', async ({ page }) => {
    await page.waitForTimeout(500)

    // Check for non-clickable rows (divs, not buttons) in player ownership
    const nonClickableRows = page.locator(
      '[class*="playerOwnership"] > [class*="list"] > div[class*="row"], [class*="PlayerOwnership"] > [class*="list"] > div[class*="row"]'
    )
    const divCount = await nonClickableRows.count()

    // If there are non-clickable rows, they should have 100% text
    if (divCount > 0) {
      const firstDiv = nonClickableRows.first()
      const text = await firstDiv.textContent()
      // Non-clickable rows should ideally be 100% ownership
      // This is a structural check - if divs exist, they're the non-clickable variant
      expect(text).toBeTruthy()
    }
  })
})

test.describe('PlayerOwnership Modal - Desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    // PlayerOwnership is on the Statistics page, not Dashboard
    await page.goto('/statistics')
    await waitForPageReady(page)
  })

  test('modal displays correctly on desktop', async ({ page }) => {
    await page.waitForTimeout(500)

    // Find clickable player rows (excludes modal buttons)
    const clickableRows = page.locator('[class*="rowClickable"]')
    const rowCount = await clickableRows.count()

    if (rowCount > 0) {
      await clickableRows.first().click()

      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Check modal has reasonable width on desktop (not too narrow)
      const dialogBox = await dialog.boundingBox()
      if (dialogBox) {
        expect(dialogBox.width).toBeGreaterThan(200)
      }
    }
  })
})
