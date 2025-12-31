// App configuration
export const LEAGUE_ID = 242017

// Refresh intervals (in milliseconds)
export const LIVE_REFRESH_INTERVAL = 60_000 // 1 minute during live games
export const IDLE_REFRESH_INTERVAL = 300_000 // 5 minutes when no games

/**
 * Cache time constants (in milliseconds)
 * Use these instead of inline calculations like `5 * 60 * 1000`
 */
export const CACHE_TIMES = {
  ONE_MINUTE: 60_000,
  FIVE_MINUTES: 5 * 60_000,
  TEN_MINUTES: 10 * 60_000,
  THIRTY_MINUTES: 30 * 60_000,
  ONE_HOUR: 60 * 60_000,
} as const
