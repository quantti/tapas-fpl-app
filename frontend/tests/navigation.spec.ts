import { test, expect } from './fixtures/test-fixtures';
import { waitForPageReady, VIEWPORTS } from './helpers/page-utils';

// =============================================================================
// Navigation Tests
// =============================================================================

test.describe('Navigation - Cross-page', () => {
  test.use({ viewport: VIEWPORTS.MOBILE });

  test('can navigate between pages via hamburger menu', async ({ page }) => {
    // Start on Dashboard
    await page.goto('/');
    await waitForPageReady(page);

    // Wait for menu button to be ready and navigate to Statistics
    const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.click();
    const nav = page.locator('nav[class*="nav"]');
    await expect(nav).toBeVisible();
    await page.locator('nav a[href="/statistics"]').click();
    await expect(page).toHaveURL('/statistics');
    await waitForPageReady(page);

    // Navigate back to Dashboard
    await menuButton.click();
    await expect(nav).toBeVisible();
    await page.locator('nav a[href="/"]').click();
    await expect(page).toHaveURL('/');
  });

  test('dark mode toggle works in menu', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    // Open menu
    const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]');
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.click();

    // Find the toggle switch
    const toggle = page.locator('button[role="switch"]');
    await expect(toggle).toBeVisible();

    // Get initial theme
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });

    // Click toggle
    await toggle.click();

    // Theme should change
    const newTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });

    expect(newTheme).not.toBe(initialTheme);

    // Menu should still be open after toggle
    const nav = page.locator('nav[class*="nav"]');
    await expect(nav).toBeVisible();
  });
});
