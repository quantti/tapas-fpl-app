import { test, expect } from './fixtures/test-fixtures';
import { waitForPageReady, VIEWPORTS } from './helpers/page-utils';

// =============================================================================
// Dashboard Page Tests
// =============================================================================

test.describe('Dashboard - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);
  });

  test('renders without horizontal overflow', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('page title is correct', async ({ page }) => {
    await expect(page).toHaveTitle('Tapas and Tackles');
  });

  test('header is visible', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('hamburger menu button is visible', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]');
    await expect(menuButton).toBeVisible();
  });
});

test.describe('Dashboard - Mobile', () => {
  test.use({ viewport: VIEWPORTS.MOBILE });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('app container has no mobile padding', async ({ page }) => {
    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding;
    });
    expect(appPadding).toBe('0px');
  });

  test('header displays logo', async ({ page }) => {
    const logo = page.locator('[class*="logo"]');
    await expect(logo).toBeVisible();
    await expect(logo).toContainText('Tapas & Tackles');
  });

  test('hamburger menu opens and closes', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]');
    const nav = page.locator('nav[class*="nav"]');

    // Menu should be hidden initially
    await expect(nav).not.toBeVisible();

    // Open menu
    await menuButton.click();
    await expect(nav).toBeVisible();

    // Close menu
    await menuButton.click();
    await expect(nav).not.toBeVisible();
  });

  test('menu closes when clicking outside', async ({ page }) => {
    const menuButton = page.locator('button[aria-label*="menu"]');
    const nav = page.locator('nav[class*="nav"]');

    // Open menu
    await menuButton.click();
    await expect(nav).toBeVisible();

    // Click outside (on the header logo area)
    await page.locator('[class*="logo"]').click();
    await expect(nav).not.toBeVisible();
  });

  test('league standings table is visible', async ({ page }) => {
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5000 });
  });

  for (const width of [320, 390, 430]) {
    test(`leader gaps fit the table at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const table = page.getByTestId('standings-table');
      await expect(table.getByRole('columnheader', { name: 'Points behind leader' })).toBeVisible();
      const rows = table.locator('tbody tr');
      const totals = await rows.locator('td:nth-child(4)').allTextContents();
      const gaps = await rows.locator('td:nth-child(5)').allTextContents();
      expect(totals.length).toBeGreaterThan(1);
      expect(gaps).toEqual(
        totals.map((total) => {
          const gap = Number(totals[0]) - Number(total);
          return gap === 0 ? '0' : `+${gap}`;
        })
      );
      const fits = await table.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        return [...el.querySelectorAll('th, td')].every((cell) => {
          const rect = cell.getBoundingClientRect();
          return (
            rect.width === 0 ||
            (rect.left >= bounds.left &&
              rect.right <= bounds.right + 1 &&
              cell.scrollWidth <= cell.clientWidth + 1)
          );
        });
      });
      expect(fits).toBe(true);
    });
  }

  test('visual snapshot - mobile dashboard', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});

test.describe('Dashboard - Tablet', () => {
  test.use({ viewport: VIEWPORTS.TABLET });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);
  });

  test('no horizontal overflow on tablet', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('app container has desktop padding at tablet width', async ({ page }) => {
    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding;
    });
    expect(appPadding).toMatch(/24px/);
  });

  test('visual snapshot - tablet dashboard', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('dashboard-tablet.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});

test.describe('Dashboard - Desktop', () => {
  test.use({ viewport: VIEWPORTS.DESKTOP });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);
  });

  test('app container has desktop padding', async ({ page }) => {
    const appPadding = await page.locator('div.app').evaluate((el) => {
      return window.getComputedStyle(el).padding;
    });
    expect(appPadding).toMatch(/24px/);
  });

  test('no horizontal overflow on desktop', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('visual snapshot - desktop dashboard', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('dashboard-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});
