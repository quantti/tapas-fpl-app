-- Migration 014: Add 2026-27 Season
-- Description: Adds the 2026-27 season and marks it as current.
-- FPL GW1 deadline: 2026-08-21 17:30 UTC.
-- Run this in Supabase SQL Editor BEFORE deploying frontend with CURRENT_SEASON_ID=2.

-- ============================================================================
-- ADD 2026-27 SEASON
-- ============================================================================

-- Mark previous season as not current
UPDATE season SET is_current = false WHERE is_current = true;

-- Insert 2026-27 season (current season)
INSERT INTO season (code, name, start_date, is_current)
VALUES ('2026-27', 'Season 2026/27', '2026-08-21', true)
ON CONFLICT (code) DO UPDATE SET
    is_current = true,
    start_date = '2026-08-21';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- After running, verify with:
-- SELECT * FROM season ORDER BY id;
-- Expected: 2025-26 (is_current = false), 2026-27 (is_current = true)
--
-- Then run data collection for the new season (teams, fixtures, players):
-- python -m scripts.scheduled_update
