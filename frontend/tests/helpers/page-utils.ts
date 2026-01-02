import type { Page } from '@playwright/test';

/**
 * Shared test utilities and helpers for E2E tests.
 */

/**
 * Viewport sizes used across tests.
 * Matches common device sizes for responsive testing.
 */
export const VIEWPORTS = {
  MOBILE: { width: 375, height: 667 },
  TABLET: { width: 768, height: 1024 },
  DESKTOP: { width: 1280, height: 800 },
} as const;

/**
 * Common selectors used across tests.
 * Using constants avoids duplicate strings and makes tests more maintainable.
 */
export const SELECTORS = {
  // Modal/Dialog
  DIALOG_OPEN: 'dialog[open]',
  DIALOG_CLOSE_BUTTON: 'dialog[open] button[aria-label*="Close"]',

  // Standings table
  TEAM_BUTTONS: 'table tbody button',

  // Clickable list rows (ListRowButton component)
  CLICKABLE_ROWS: '[class*="ListRowButton"]',

  // Statistics page
  STATS_PATH: '/statistics',

  // Analytics page
  ANALYTICS_PATH: '/analytics',
} as const;

/**
 * Wait for the page to be ready with mocked API data.
 * This waits for key UI elements to appear before proceeding with tests.
 */
export async function waitForPageReady(page: Page): Promise<void> {
  // Wait for either header or main content grid
  await page.waitForSelector('[class*="header"], [class*="Header"], [class*="grid"]', {
    timeout: 15000,
  });
  // Give React Query time to process the mocked responses
  await page.waitForTimeout(500);
}

/**
 * Wait for data to load in statistics/analytics pages.
 * Use this after navigation or when waiting for async data.
 */
export async function waitForDataLoad(page: Page): Promise<void> {
  await page.waitForTimeout(500);
}

/**
 * Open the hamburger menu on mobile viewports.
 */
export async function openHamburgerMenu(page: Page): Promise<void> {
  const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]');
  await menuButton.click();
  const nav = page.locator('nav[class*="nav"]');
  await nav.waitFor({ state: 'visible' });
}

/**
 * Close the hamburger menu.
 */
export async function closeHamburgerMenu(page: Page): Promise<void> {
  const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"]');
  await menuButton.click();
  const nav = page.locator('nav[class*="nav"]');
  await nav.waitFor({ state: 'hidden' });
}

/**
 * Navigate to a page via the hamburger menu.
 */
export async function navigateViaMenu(page: Page, href: string): Promise<void> {
  await openHamburgerMenu(page);
  await page.locator(`nav a[href="${href}"]`).click();
}

/**
 * Open the manager modal by clicking a team name in standings.
 */
export async function openManagerModal(page: Page, index = 0): Promise<void> {
  const teamButtons = page.locator('table tbody button');
  await teamButtons.nth(index).click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Close any open modal/dialog.
 */
export async function closeModal(page: Page): Promise<void> {
  const closeButton = page.locator('dialog[open] button[aria-label*="Close"]');
  await closeButton.click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ state: 'hidden' });
}
