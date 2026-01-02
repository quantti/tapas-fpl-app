import { expect, test } from './fixtures/test-fixtures';
import {
  VIEWPORTS,
  waitForPageReady,
  waitForDataLoad,
  openManagerModal,
} from './helpers/page-utils';

const SELECTORS = {
  PITCH_PLAYER: '[data-testid="player"]',
  PLAYER_MODAL: '[data-testid="player-modal"]',
} as const;

test.describe('PlayerModal', () => {
  test.describe('desktop viewport', () => {
    test.use({ viewport: VIEWPORTS.DESKTOP });

    test('player modal displays correctly', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);
      await waitForDataLoad(page);

      // Open manager modal first
      await openManagerModal(page);

      // Click on a player in the pitch to open player modal
      const pitchPlayer = page.locator(SELECTORS.PITCH_PLAYER).first();
      await pitchPlayer.click();

      // Wait for player modal to open
      const playerModal = page.locator(SELECTORS.PLAYER_MODAL);
      await expect(playerModal).toBeVisible({ timeout: 5000 });

      // Take screenshot of the player modal
      await expect(playerModal).toHaveScreenshot('player-modal-desktop.png');
    });

    test('player modal history tab with expanded view', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);
      await waitForDataLoad(page);

      // Open manager modal
      await openManagerModal(page);

      // Click on a player to open player modal
      const pitchPlayer = page.locator(SELECTORS.PITCH_PLAYER).first();
      await pitchPlayer.click();

      const playerModal = page.locator(SELECTORS.PLAYER_MODAL);
      await expect(playerModal).toBeVisible({ timeout: 5000 });

      // Click on History tab (it's a button, not ARIA tab)
      const historyTab = page.getByRole('button', { name: /history/i });
      await historyTab.click();

      // Wait for history content to load
      await page.waitForTimeout(300);

      // Click "Show more" button if visible
      const showMoreButton = page.getByRole('button', { name: /show more/i });
      if (await showMoreButton.isVisible()) {
        await showMoreButton.click();
        await page.waitForTimeout(300);
      }

      // Take screenshot of expanded history
      await expect(playerModal).toHaveScreenshot('player-modal-history-expanded-desktop.png');
    });
  });

  test.describe('tablet viewport', () => {
    test.use({ viewport: VIEWPORTS.TABLET });

    test('player modal displays correctly', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);
      await waitForDataLoad(page);

      // Open manager modal
      await openManagerModal(page);

      // Click on a player to open player modal
      const pitchPlayer = page.locator(SELECTORS.PITCH_PLAYER).first();
      await pitchPlayer.click();

      const playerModal = page.locator(SELECTORS.PLAYER_MODAL);
      await expect(playerModal).toBeVisible({ timeout: 5000 });

      // Take screenshot
      await expect(playerModal).toHaveScreenshot('player-modal-tablet.png');
    });
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: VIEWPORTS.MOBILE });

    test('player modal displays correctly', async ({ page }) => {
      await page.goto('/');
      await waitForPageReady(page);
      await waitForDataLoad(page);

      // Open manager modal
      await openManagerModal(page);

      // Click on a player to open player modal
      const pitchPlayer = page.locator(SELECTORS.PITCH_PLAYER).first();
      await pitchPlayer.click();

      const playerModal = page.locator(SELECTORS.PLAYER_MODAL);
      await expect(playerModal).toBeVisible({ timeout: 5000 });

      // Take screenshot
      await expect(playerModal).toHaveScreenshot('player-modal-mobile.png');
    });
  });
});
