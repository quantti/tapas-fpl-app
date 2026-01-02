import { mockBootstrapResponse, mockLiveResponse } from './fixtures/mock-data';
import { test, expect } from './fixtures/test-fixtures';

/**
 * Helper to set up countdown-specific mocks that override the default mocks.
 * The test-fixtures already set up basic mocking; these add specific scenarios.
 */

test.describe('Gameweek Countdown', () => {
  test('displays countdown when all fixtures are finished', async ({ page }) => {
    // Future deadline for GW19 (always 7 days from now)
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Override bootstrap to make GW18 current and finished, GW19 next with future deadline
    const customBootstrap = {
      ...mockBootstrapResponse,
      events: mockBootstrapResponse.events.map((event) => ({
        ...event,
        is_current: event.id === 18,
        is_next: event.id === 19,
        finished: event.id <= 18,
        // Set future deadline for GW19 so countdown displays
        deadline_time: event.id === 19 ? futureDeadline : event.deadline_time,
      })),
    };

    // Mock fixtures - all finished for current GW
    const finishedFixtures = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      event: 18,
      team_h: i + 1,
      team_a: i + 11,
      team_h_score: 2,
      team_a_score: 1,
      started: true,
      finished: true,
      finished_provisional: true,
      kickoff_time: '2025-12-21T15:00:00Z',
      team_h_difficulty: 3,
      team_a_difficulty: 3,
    }));

    // Override the default mocks with countdown-specific data
    await page.route('**/api/bootstrap-static', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(customBootstrap),
      });
    });

    await page.route('**/api/fixtures**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(finishedFixtures),
      });
    });

    await page.route('**/api/event/*/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLiveResponse),
      });
    });

    await page.goto('/');

    // Wait for data to load - look for main grid which is always present
    await page.waitForSelector('[class*="grid"]', { timeout: 15000 });

    // Wait for fixtures data to be processed
    await page.waitForTimeout(1000);

    // Check if countdown is visible - look for next GW reference
    const countdown = page.locator('text=/Gameweek 19/');
    const isVisible = await countdown.isVisible().catch(() => false);

    expect(isVisible).toBe(true);
  });

  test('does not display countdown when fixtures are in progress', async ({ page }) => {
    // Future deadline for GW19 (always 7 days from now)
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Override bootstrap - GW18 current and not finished
    const customBootstrap = {
      ...mockBootstrapResponse,
      events: mockBootstrapResponse.events.map((event) => ({
        ...event,
        is_current: event.id === 18,
        is_next: event.id === 19,
        finished: event.id < 18, // GW18 not finished
        deadline_time: event.id === 19 ? futureDeadline : event.deadline_time,
      })),
    };

    // Mock fixtures - some still in progress
    const inProgressFixtures = [
      {
        id: 1,
        event: 18,
        team_h: 1,
        team_a: 11,
        team_h_score: 1,
        team_a_score: 1,
        started: true,
        finished: false,
        finished_provisional: false, // Still in progress
        kickoff_time: '2025-12-21T15:00:00Z',
        team_h_difficulty: 3,
        team_a_difficulty: 3,
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: i + 2,
        event: 18,
        team_h: i + 2,
        team_a: i + 12,
        team_h_score: 2,
        team_a_score: 0,
        started: true,
        finished: true,
        finished_provisional: true,
        kickoff_time: '2025-12-21T12:30:00Z',
        team_h_difficulty: 3,
        team_a_difficulty: 3,
      })),
    ];

    await page.route('**/api/bootstrap-static', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(customBootstrap),
      });
    });

    await page.route('**/api/fixtures**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inProgressFixtures),
      });
    });

    await page.route('**/api/event/*/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLiveResponse),
      });
    });

    await page.goto('/');

    await page.waitForSelector('[class*="grid"]', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Countdown should NOT be visible (fixtures still in progress)
    const countdown = page.locator('text=/Gameweek 19/');
    const isVisible = await countdown.isVisible().catch(() => false);

    expect(isVisible).toBe(false);
  });

  test('does not display countdown during GW38', async ({ page }) => {
    // Override bootstrap - GW38 is current (season finale)
    const gw38Bootstrap = {
      ...mockBootstrapResponse,
      events: [
        ...mockBootstrapResponse.events.slice(0, -1), // Remove GW19
        {
          id: 38,
          name: 'Gameweek 38',
          deadline_time: '2025-05-25T15:00:00Z',
          finished: true,
          is_current: true,
          is_next: false,
          data_checked: true,
          deadline_time_epoch: 1748188800,
          deadline_time_game_offset: 0,
          highest_scoring_entry: 2000000,
          average_entry_score: 48,
          most_selected: 1,
          most_transferred_in: 2,
          top_element: 1,
          most_captained: 1,
          most_vice_captained: 2,
        },
      ],
    };

    const gw38Fixtures = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      event: 38,
      team_h: i + 1,
      team_a: i + 11,
      team_h_score: 2,
      team_a_score: 1,
      started: true,
      finished: true,
      finished_provisional: true,
      kickoff_time: '2025-05-25T15:00:00Z',
      team_h_difficulty: 3,
      team_a_difficulty: 3,
    }));

    await page.route('**/api/bootstrap-static', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(gw38Bootstrap),
      });
    });

    await page.route('**/api/fixtures**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(gw38Fixtures),
      });
    });

    await page.route('**/api/event/*/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLiveResponse),
      });
    });

    await page.goto('/');
    await page.waitForSelector('[class*="grid"]', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Countdown should NOT be visible during GW38 (no next gameweek)
    const countdown = page.locator('text=/Gameweek 39|Next Deadline/');
    const isVisible = await countdown.isVisible().catch(() => false);

    expect(isVisible).toBe(false);
  });
});
