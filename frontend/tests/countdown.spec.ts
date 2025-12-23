import { test, expect } from '@playwright/test'

test.describe('Gameweek Countdown', () => {
  test('displays countdown when all fixtures are finished', async ({ page }) => {
    // Mock the FPL API responses
    await page.route('**/api/bootstrap-static/', async (route) => {
      const response = await route.fetch()
      const json = await response.json()

      // Ensure GW17 is current and finished, GW18 is next
      json.events = json.events.map((event: { id: number }) => ({
        ...event,
        is_current: event.id === 17,
        is_next: event.id === 18,
        finished: event.id <= 17,
      }))

      await route.fulfill({ json })
    })

    // Mock fixtures - all finished
    await page.route('**/api/fixtures/?event=17', async (route) => {
      await route.fulfill({
        json: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          event: 17,
          started: true,
          finished: true,
          finished_provisional: true,
          kickoff_time: '2024-12-21T15:00:00Z',
        })),
      })
    })

    // Mock live data
    await page.route('**/api/event/17/live/', async (route) => {
      await route.fulfill({
        json: {
          elements: [],
        },
      })
    })

    await page.goto('/')

    // Wait for data to load - look for main grid which is always present
    await page.waitForSelector('[class*="grid"]', { timeout: 30000 })

    // Debug: Check console logs
    page.on('console', (msg) => {
      if (msg.text().includes('Countdown debug')) {
        console.log('Browser console:', msg.text())
      }
    })

    // Wait a bit for fixtures to load
    await page.waitForTimeout(2000)

    // Check if countdown is visible - look for the new design
    const countdown = page.locator('text=/Gameweek 18/')
    const isVisible = await countdown.isVisible().catch(() => false)

    // If not visible, get debug info
    if (!isVisible) {
      const debugInfo = await page.evaluate(() => {
        const logs: string[] = []
        // Check what's in the status bar
        const statusBar = document.querySelector('[class*="statusBar"]')
        if (statusBar) {
          logs.push(`StatusBar HTML: ${statusBar.innerHTML}`)
        }
        return logs
      })
      console.log('Debug info:', debugInfo)
    }

    expect(isVisible).toBe(true)
  })

  test('does not display countdown when fixtures are in progress', async ({ page }) => {
    // Mock fixtures - some not finished
    await page.route('**/api/fixtures/?event=17', async (route) => {
      await route.fulfill({
        json: [
          {
            id: 1,
            event: 17,
            started: true,
            finished: false,
            finished_provisional: false, // Still in progress
            kickoff_time: '2024-12-21T15:00:00Z',
          },
          ...Array.from({ length: 9 }, (_, i) => ({
            id: i + 2,
            event: 17,
            started: true,
            finished: true,
            finished_provisional: true,
            kickoff_time: '2024-12-21T15:00:00Z',
          })),
        ],
      })
    })

    await page.route('**/api/event/17/live/', async (route) => {
      await route.fulfill({ json: { elements: [] } })
    })

    await page.goto('/')
    await page.waitForSelector('[class*="grid"]', { timeout: 30000 })
    await page.waitForTimeout(1000)

    // Countdown should NOT be visible
    const countdown = page.locator('text=/Gameweek 18/')
    const isVisible = await countdown.isVisible().catch(() => false)

    expect(isVisible).toBe(false)
  })

  test('does not display countdown during GW38', async ({ page }) => {
    await page.route('**/api/bootstrap-static/', async (route) => {
      const response = await route.fetch()
      const json = await response.json()

      // Set GW38 as current (season finale)
      json.events = json.events.map((event: { id: number }) => ({
        ...event,
        is_current: event.id === 38,
        is_next: false,
        finished: event.id < 38,
      }))

      await route.fulfill({ json })
    })

    await page.route('**/api/fixtures/?event=38', async (route) => {
      await route.fulfill({
        json: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          event: 38,
          started: true,
          finished: true,
          finished_provisional: true,
          kickoff_time: '2025-05-25T15:00:00Z',
        })),
      })
    })

    await page.route('**/api/event/38/live/', async (route) => {
      await route.fulfill({ json: { elements: [] } })
    })

    await page.goto('/')
    await page.waitForSelector('[class*="grid"]', { timeout: 30000 })
    await page.waitForTimeout(1000)

    // Countdown should NOT be visible during GW38
    const countdown = page.locator('text=/Gameweek 39|Next Deadline/')
    const isVisible = await countdown.isVisible().catch(() => false)

    expect(isVisible).toBe(false)
  })
})
