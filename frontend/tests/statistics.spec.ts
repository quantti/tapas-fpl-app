import { test, expect } from './fixtures/test-fixtures';
import {
  waitForPageReady,
  waitForDataLoad,
  VIEWPORTS,
  openHamburgerMenu,
  SELECTORS,
} from './helpers/page-utils';

// =============================================================================
// Statistics Page Tests
// =============================================================================

test.describe('Statistics - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.STATS_PATH);
    await waitForPageReady(page);
  });

  test('renders without horizontal overflow', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('header is visible', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('statistics title is visible', async ({ page }) => {
    const title = page.locator('h1');
    await expect(title).toContainText('Statistics');
  });
});

test.describe('Statistics - Mobile', () => {
  test.use({ viewport: VIEWPORTS.MOBILE });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.STATS_PATH);
    await waitForPageReady(page);
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('stats grid is single column on mobile', async ({ page }) => {
    await waitForDataLoad(page);

    const statsGrid = page.locator('[class*="statsGrid"]');
    await expect(statsGrid).toBeVisible({ timeout: 5000 });

    const gridStyle = await statsGrid.evaluate((el) => {
      return window.getComputedStyle(el).gridTemplateColumns;
    });
    // Should be single column (1fr) on mobile - single width value
    expect(gridStyle).toMatch(/^[\d.]+px$/);
  });

  test('hamburger menu navigation works', async ({ page }) => {
    await openHamburgerMenu(page);

    // Check Dashboard link is visible
    const dashboardLink = page.locator('nav a[href="/"]');
    await expect(dashboardLink).toBeVisible();

    // Check Statistics link is visible and active
    const statsLink = page.locator('nav a[href="/statistics"]');
    await expect(statsLink).toBeVisible();
  });

  test('can navigate to Dashboard from Statistics', async ({ page }) => {
    await openHamburgerMenu(page);

    const dashboardLink = page.locator('nav a[href="/"]');
    await dashboardLink.click();

    // Should navigate to dashboard
    await expect(page).toHaveURL('/');
  });

  test('stats cards show values on mobile', async ({ page }) => {
    await waitForDataLoad(page);

    // Check Finance card shows pound values (Squad and Bank columns)
    const financeHeading = page.getByRole('heading', { name: 'Finance' });
    await expect(financeHeading).toBeVisible({ timeout: 5000 });

    // The Finance table has pound values in Squad and Bank columns
    const financeCard = financeHeading.locator('..').locator('..');
    const poundValues = financeCard.locator('text=/£[\\d.]+m/');
    const valueCount = await poundValues.count();
    expect(valueCount).toBeGreaterThan(0);
  });

  test('visual snapshot - mobile statistics', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('statistics-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});

test.describe('Statistics - Tablet', () => {
  test.use({ viewport: VIEWPORTS.TABLET });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.STATS_PATH);
    await waitForPageReady(page);
  });

  test('no horizontal overflow on tablet', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('stats grid is two columns on tablet', async ({ page }) => {
    await waitForDataLoad(page);

    const statsGrid = page.locator('[class*="statsGrid"]');
    await expect(statsGrid).toBeVisible({ timeout: 5000 });

    const gridStyle = await statsGrid.evaluate((el) => {
      return window.getComputedStyle(el).gridTemplateColumns;
    });
    // Should have two columns (two values separated by space)
    const columns = gridStyle.split(' ').filter((s) => s.trim());
    expect(columns.length).toBeGreaterThanOrEqual(2);
  });

  test('visual snapshot - tablet statistics', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('statistics-tablet.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});

test.describe('Statistics - Desktop', () => {
  test.use({ viewport: VIEWPORTS.DESKTOP });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.STATS_PATH);
    await waitForPageReady(page);
  });

  test('no horizontal overflow on desktop', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('visual snapshot - desktop statistics', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('statistics-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});
