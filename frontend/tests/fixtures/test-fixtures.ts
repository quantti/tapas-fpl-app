/**
 * Playwright test fixtures with API mocking.
 * Extends base test to intercept API calls and return mock data.
 * Uses wildcard patterns (**) to match any origin, ensuring mocks work
 * regardless of how API_BASE_URL is configured.
 */

import { test as base, Page } from '@playwright/test';

import {
  mockBootstrapResponse,
  mockFixturesResponse,
  mockEntryResponse,
  mockPicksResponse,
  mockLeagueResponse,
  mockLiveResponse,
  mockEntryHistoryResponse,
  mockEntryTransfersResponse,
  mockElementSummaryResponse,
  mockEventStatusResponse,
  mockComparisonResponse,
  MOCK_MANAGER_IDS,
} from './mock-data';

/**
 * Setup API mocking for a page.
 * Intercepts all FPL API calls and returns mock data.
 * Note: Frontend uses /api/fpl/* routes (via Vercel serverless functions)
 */
export async function setupApiMocking(page: Page) {
  // Mock bootstrap-static
  await page.route('**/api/fpl/bootstrap-static', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockBootstrapResponse),
    });
  });

  // Mock fixtures - handle both with and without event parameter
  await page.route('**/api/fpl/fixtures**', async (route) => {
    const url = new URL(route.request().url());
    const event = url.searchParams.get('event');

    // Filter fixtures by event if specified
    let fixtures = mockFixturesResponse;
    if (event) {
      fixtures = mockFixturesResponse.filter((f) => f.event === Number.parseInt(event));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures),
    });
  });

  // Mock league standings
  await page.route('**/api/fpl/leagues-classic/*/standings**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLeagueResponse),
    });
  });

  // Mock entry (manager) details - use ** to match multiple path segments
  // Matches /api/fpl/entry/12345, /api/fpl/entry/12345/event/18/picks, etc.
  await page.route('**/api/fpl/entry/**', async (route) => {
    const url = route.request().url();
    // Extract entry ID from URL, handling various patterns
    const match = url.match(/\/api\/fpl\/entry\/(\d+)(?:\/|$|\?)/);
    const entryId = match ? Number.parseInt(match[1]) : MOCK_MANAGER_IDS.manager1;

    // Check if this is a sub-route (history, picks, transfers)
    if (url.includes('/history')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEntryHistoryResponse(entryId)),
      });
    } else if (url.includes('/event/') && url.includes('/picks')) {
      const gwMatch = url.match(/\/event\/(\d+)\/picks/);
      const gw = gwMatch ? Number.parseInt(gwMatch[1]) : 18;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPicksResponse(entryId, gw)),
      });
    } else if (url.includes('/transfers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEntryTransfersResponse(entryId)),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEntryResponse(entryId)),
      });
    }
  });

  // Mock live gameweek data
  await page.route('**/api/fpl/event/*/live', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockLiveResponse),
    });
  });

  // Mock element summary (player details)
  await page.route('**/api/fpl/element-summary/*', async (route) => {
    const match = route
      .request()
      .url()
      .match(/\/element-summary\/(\d+)/);
    const playerId = match ? Number.parseInt(match[1]) : 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockElementSummaryResponse(playerId)),
    });
  });

  // Mock event status
  await page.route('**/api/fpl/event-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockEventStatusResponse),
    });
  });

  // Mock backend API endpoints - return 503 to simulate unavailable backend
  // This ensures consistent test snapshots regardless of backend availability
  const unavailableResponse = {
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Service temporarily unavailable' }),
  };

  // Points Against
  await page.route('**/api/v1/points-against**', (route) => route.fulfill(unavailableResponse));

  // Chips
  await page.route('**/api/v1/chips/**', (route) => route.fulfill(unavailableResponse));

  // League stats (bench points, free transfers, captain differential)
  await page.route('**/api/v1/history/league/*/stats**', (route) =>
    route.fulfill(unavailableResponse)
  );

  // League positions (position history chart)
  await page.route('**/api/v1/history/league/*/positions**', (route) =>
    route.fulfill(unavailableResponse)
  );

  // Mock H2H comparison endpoint
  await page.route('**/api/v1/history/comparison**', async (route) => {
    const url = new URL(route.request().url());
    const managerA = Number(url.searchParams.get('manager_a')) || MOCK_MANAGER_IDS.manager1;
    const managerB = Number(url.searchParams.get('manager_b')) || MOCK_MANAGER_IDS.manager2;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockComparisonResponse(managerA, managerB)),
    });
  });
}

/**
 * Extended test with API mocking.
 * Use this instead of the base test for E2E tests that need mocked API.
 */
export const test = base.extend<{ mockApi: void }>({
  mockApi: [
    async ({ page }, use) => {
      await setupApiMocking(page);
      await use();
    },
    { auto: true }, // Automatically apply to all tests
  ],
});

// Re-export expect for convenience
export { expect } from '@playwright/test';
