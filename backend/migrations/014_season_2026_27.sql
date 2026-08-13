-- Migration 014: Add 2026-27 Season
-- Description: Adds the 2026-27 season (id=2) and marks it as current.
-- FPL GW1 deadline: 2026-08-21 17:30 UTC.
-- Run this in Supabase SQL Editor BEFORE deploying frontend with CURRENT_SEASON_ID=2.
--
-- Convention: season 1 = 2025-26, season 2 = 2026-27

-- ============================================================================
-- ADD 2026-27 SEASON
-- ============================================================================

-- Mark previous season as not current
UPDATE season SET is_current = false WHERE is_current = true;

-- Insert 2026-27 season with explicit id=2
INSERT INTO season (id, code, name, start_date, is_current)
VALUES (2, '2026-27', 'Season 2026/27', '2026-08-21', true)
ON CONFLICT (id) DO UPDATE SET
    is_current = true,
    start_date = '2026-08-21';

SELECT setval('season_id_seq', 2, true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- After running, verify with:
-- SELECT * FROM season ORDER BY id;
-- Expected: id=1 2025-26 (is_current = false), id=2 2026-27 (is_current = true)
--
-- Then run data collection for the new season (teams, fixtures, players):
-- python -m scripts.scheduled_update
