/**
 * E2E tests for error states, including 503 "FPL Updating" message.
 */
import { test, expect } from '@playwright/test'
import { VIEWPORTS } from './helpers/page-utils'

/**
 * Setup API mocking to return 503 Service Unavailable.
 * This simulates FPL API being down during gameweek updates.
 */
async function setup503Error(page: import('@playwright/test').Page) {
  // Return 503 for all API calls
  await page.route('**/api/**', async (route) => {
    await route.fulfill({
      status: 503,
      statusText: 'Service Unavailable',
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service Unavailable' }),
    })
  })
}

test.describe('FPL Updating Error State', () => {
  test.beforeEach(async ({ page }) => {
    await setup503Error(page)
  })

  test('Dashboard shows FPL updating message on 503', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="fpl-updating"]', { timeout: 10000 })

    const updating = page.getByTestId('fpl-updating')
    await expect(updating).toBeVisible()
    await expect(page.getByText('FPL is updating')).toBeVisible()
    await expect(page.getByText(/Fantasy Premier League is updating/)).toBeVisible()
  })

  test('Statistics shows FPL updating message on 503', async ({ page }) => {
    await page.goto('/statistics')
    await page.waitForSelector('[data-testid="fpl-updating"]', { timeout: 10000 })

    const updating = page.getByTestId('fpl-updating')
    await expect(updating).toBeVisible()
    await expect(page.getByText('FPL is updating')).toBeVisible()
  })

  test('Analytics shows FPL updating message on 503', async ({ page }) => {
    await page.goto('/analytics')
    await page.waitForSelector('[data-testid="fpl-updating"]', { timeout: 10000 })

    const updating = page.getByTestId('fpl-updating')
    await expect(updating).toBeVisible()
    await expect(page.getByText('FPL is updating')).toBeVisible()
  })

  test('FPL updating message visual snapshot - desktop', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP)
    await page.goto('/')
    await page.waitForSelector('[data-testid="fpl-updating"]', { timeout: 10000 })

    // Wait for animation to stabilize (the spinning icon)
    await page.waitForTimeout(100)

    await expect(page).toHaveScreenshot('fpl-updating-desktop.png', {
      animations: 'disabled',
    })
  })

  test('FPL updating message visual snapshot - mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE)
    await page.goto('/')
    await page.waitForSelector('[data-testid="fpl-updating"]', { timeout: 10000 })

    await page.waitForTimeout(100)

    await expect(page).toHaveScreenshot('fpl-updating-mobile.png', {
      animations: 'disabled',
    })
  })
})
