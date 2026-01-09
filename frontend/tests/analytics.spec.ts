import { test, expect } from './fixtures/test-fixtures';
import {
  waitForPageReady,
  waitForDataLoad,
  VIEWPORTS,
  openHamburgerMenu,
  SELECTORS,
} from './helpers/page-utils';

// =============================================================================
// Analytics Page Tests
// =============================================================================

test.describe('Analytics - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH);
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

  test('analytics title is visible', async ({ page }) => {
    const title = page.locator('h1');
    await expect(title).toContainText('Analytics');
  });

  test('recommendations section is visible', async ({ page }) => {
    await waitForDataLoad(page);
    const section = page.locator('h2:has-text("Recommendations")');
    await expect(section).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Analytics - Recommendation Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH);
    await waitForPageReady(page);
    await waitForDataLoad(page);
  });

  test('shows Punts recommendation card', async ({ page }) => {
    const puntsCard = page.locator('text=Punts').first();
    await expect(puntsCard).toBeVisible({ timeout: 5000 });
  });

  test('shows Defensive Options recommendation card', async ({ page }) => {
    const defensiveCard = page.locator('text=Defensive Options').first();
    await expect(defensiveCard).toBeVisible({ timeout: 5000 });
  });

  test('shows Time to Sell recommendation card', async ({ page }) => {
    const sellCard = page.locator('text=Time to Sell').first();
    await expect(sellCard).toBeVisible({ timeout: 5000 });
  });

  test('recommendation cards show player names', async ({ page }) => {
    // Wait for cards to load
    await page.waitForTimeout(500);

    // Check that at least one player name is displayed
    const playerRows = page.locator('[class*="RecommendedPlayers"] [class*="row"]');
    const rowCount = await playerRows.count();

    // Should have some player recommendations
    expect(rowCount).toBeGreaterThan(0);
  });

  test('clicking a player opens player modal', async ({ page }) => {
    // Wait for cards to load
    await page.waitForTimeout(500);

    // Find a clickable player row
    const playerRow = page.locator('[class*="RecommendedPlayers"] button').first();
    await playerRow.click();

    // Player modal should open
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test('player modal can be closed', async ({ page }) => {
    await page.waitForTimeout(500);

    // Open player modal
    const playerRow = page.locator('[class*="RecommendedPlayers"] button').first();
    await playerRow.click();

    // Wait for modal
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Close modal
    const closeButton = page.locator('dialog[open] button[aria-label*="Close"]');
    await closeButton.click();

    // Modal should be closed
    await expect(dialog).not.toBeVisible();
  });
});

test.describe('Analytics - Mobile', () => {
  test.use({ viewport: VIEWPORTS.MOBILE });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH);
    await waitForPageReady(page);
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('hamburger menu navigation works', async ({ page }) => {
    await openHamburgerMenu(page);

    // Check Dashboard link is visible
    const dashboardLink = page.locator('nav a[href="/"]');
    await expect(dashboardLink).toBeVisible();

    // Check Analytics link is visible
    const analyticsLink = page.locator('nav a[href="/analytics"]');
    await expect(analyticsLink).toBeVisible();
  });

  test('can navigate to Dashboard from Analytics', async ({ page }) => {
    await openHamburgerMenu(page);

    const dashboardLink = page.locator('nav a[href="/"]');
    await dashboardLink.click();

    // Should navigate to dashboard
    await expect(page).toHaveURL('/');
  });

  test('recommendation cards are visible on mobile', async ({ page }) => {
    await waitForDataLoad(page);

    // Check that recommendation cards are visible
    const puntsCard = page.locator('text=Punts').first();
    await expect(puntsCard).toBeVisible({ timeout: 5000 });

    const defensiveCard = page.locator('text=Defensive Options').first();
    await expect(defensiveCard).toBeVisible({ timeout: 5000 });
  });

  test('visual snapshot - mobile analytics', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('analytics-mobile.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});

test.describe('Analytics - Tablet', () => {
  test.use({ viewport: VIEWPORTS.TABLET });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH);
    await waitForPageReady(page);
  });

  test('no horizontal overflow on tablet', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('visual snapshot - tablet analytics', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('analytics-tablet.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});

test.describe('Analytics - Desktop', () => {
  test.use({ viewport: VIEWPORTS.DESKTOP });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH);
    await waitForPageReady(page);
  });

  test('no horizontal overflow on desktop', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('visual snapshot - desktop analytics', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('analytics-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.15,
    });
  });
});

// =============================================================================
// Head-to-Head Component Tests
// =============================================================================

const MANAGER_A_SELECT = '#manager-a-select';
const MANAGER_B_SELECT = '#manager-b-select';

test.describe('Analytics - Head-to-Head Component', () => {
  test.use({ viewport: VIEWPORTS.DESKTOP });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH);
    await waitForPageReady(page);
    await waitForDataLoad(page);
  });

  test('shows Head-to-Head card with title', async ({ page }) => {
    const h2hCard = page.locator('[class*="HeadToHead"]').first();
    await expect(h2hCard).toBeVisible({ timeout: 5000 });
    const cardTitle = h2hCard.locator('h3');
    await expect(cardTitle).toContainText('Head-to-Head');
  });

  test('shows manager selection dropdowns', async ({ page }) => {
    // Check for Manager A dropdown
    const managerASelect = page.locator(MANAGER_A_SELECT);
    await expect(managerASelect).toBeVisible({ timeout: 5000 });

    // Check for Manager B dropdown
    const managerBSelect = page.locator(MANAGER_B_SELECT);
    await expect(managerBSelect).toBeVisible({ timeout: 5000 });
  });

  test('shows empty state when no managers selected', async ({ page }) => {
    const emptyState = page.locator('text=Select two managers to compare');
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test('dropdowns contain manager options', async ({ page }) => {
    const managerASelect = page.locator(MANAGER_A_SELECT);
    const options = managerASelect.locator('option');
    const optionCount = await options.count();

    // Should have placeholder + at least 2 manager options
    expect(optionCount).toBeGreaterThan(2);
  });

  test('selecting managers shows comparison', async ({ page }) => {
    // Select first manager
    const managerASelect = page.locator(MANAGER_A_SELECT);
    await managerASelect.selectOption({ index: 1 });

    // Select second manager
    const managerBSelect = page.locator(MANAGER_B_SELECT);
    await managerBSelect.selectOption({ index: 2 });

    // Wait for comparison to load
    await page.waitForTimeout(500);

    // Should show comparison grid with season overview
    const seasonOverview = page.locator('text=Season Overview');
    await expect(seasonOverview).toBeVisible({ timeout: 5000 });

    // Should show Total Points row (use exact match to avoid tooltip text)
    const totalPoints = page.getByText('Total Points', { exact: true });
    await expect(totalPoints).toBeVisible();
  });

  test('comparison shows all stat sections', async ({ page }) => {
    // Select managers
    await page.locator(MANAGER_A_SELECT).selectOption({ index: 1 });
    await page.locator(MANAGER_B_SELECT).selectOption({ index: 2 });
    await page.waitForTimeout(500);

    // Check all section titles are visible (using class selector for section titles)
    const sectionTitles = page.locator('[class*="HeadToHead"] [class*="sectionTitle"]');
    await expect(sectionTitles.filter({ hasText: 'Season Overview' })).toBeVisible();
    await expect(sectionTitles.filter({ hasText: 'Transfers' })).toBeVisible();
    await expect(sectionTitles.filter({ hasText: 'Captain' })).toBeVisible();
    await expect(sectionTitles.filter({ hasText: 'Chips (Current Half)' })).toBeVisible();
    await expect(sectionTitles.filter({ hasText: 'Value' })).toBeVisible();
  });

  test('comparison shows colored stat boxes', async ({ page }) => {
    // Select managers
    await page.locator(MANAGER_A_SELECT).selectOption({ index: 1 });
    await page.locator(MANAGER_B_SELECT).selectOption({ index: 2 });
    await page.waitForTimeout(500);

    // Check for colored stat values (better/worse classes)
    const betterStats = page.locator('[class*="better"]');
    const worseStats = page.locator('[class*="worse"]');

    // Should have some colored stats
    const betterCount = await betterStats.count();
    const worseCount = await worseStats.count();
    expect(betterCount + worseCount).toBeGreaterThan(0);
  });

  test('visual snapshot - head-to-head with comparison', async ({ page }) => {
    // Select managers
    await page.locator(MANAGER_A_SELECT).selectOption({ index: 1 });
    await page.locator(MANAGER_B_SELECT).selectOption({ index: 2 });
    await page.waitForTimeout(500);

    // Scroll to H2H component for focused snapshot
    const h2hCard = page.locator('[class*="HeadToHead"]').first();
    await h2hCard.scrollIntoViewIfNeeded();

    await expect(h2hCard).toHaveScreenshot('head-to-head-comparison.png', {
      maxDiffPixelRatio: 0.15,
    });
  });
});

test.describe('Analytics - Head-to-Head Mobile', () => {
  test.use({ viewport: VIEWPORTS.MOBILE });

  test.beforeEach(async ({ page }) => {
    await page.goto(SELECTORS.ANALYTICS_PATH);
    await waitForPageReady(page);
    await waitForDataLoad(page);
  });

  test('dropdowns are usable on mobile', async ({ page }) => {
    const managerASelect = page.locator(MANAGER_A_SELECT);
    await expect(managerASelect).toBeVisible({ timeout: 5000 });

    // Verify dropdown is full width on mobile
    const selectWidth = await managerASelect.evaluate((el) => el.getBoundingClientRect().width);
    expect(selectWidth).toBeGreaterThan(100);
  });

  test('comparison renders correctly on mobile', async ({ page }) => {
    // Select managers
    await page.locator(MANAGER_A_SELECT).selectOption({ index: 1 });
    await page.locator(MANAGER_B_SELECT).selectOption({ index: 2 });
    await page.waitForTimeout(500);

    // Check stat rows are visible
    const statRows = page.locator('[class*="statRow"]');
    const rowCount = await statRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('visual snapshot - head-to-head mobile', async ({ page }) => {
    // Select managers
    await page.locator(MANAGER_A_SELECT).selectOption({ index: 1 });
    await page.locator(MANAGER_B_SELECT).selectOption({ index: 2 });
    await page.waitForTimeout(500);

    const h2hCard = page.locator('[class*="HeadToHead"]').first();
    await h2hCard.scrollIntoViewIfNeeded();

    await expect(h2hCard).toHaveScreenshot('head-to-head-mobile.png', {
      maxDiffPixelRatio: 0.15,
    });
  });
});
