-- Migration 005: Add 2025-26 Season and Clean Test Data
-- Description: Adds the current season (2025-26), clears test data from points_against tables
-- Run this in Supabase SQL Editor

-- ============================================================================
-- CLEAN UP TEST DATA
-- ============================================================================

-- Delete all test data from points_against tables
-- This removes any sample/test data that was inserted before proper collection
DELETE FROM points_against_by_fixture;
DELETE FROM points_against_collection_status;

-- Note: player_fixture_stats table is created in 006, no cleanup needed here

-- ============================================================================
-- ADD 2025-26 SEASON
-- ============================================================================

-- Mark previous season as not current
UPDATE season SET is_current = false WHERE is_current = true;

-- Insert 2025-26 season (current season)
INSERT INTO season (code, name, start_date, is_current)
VALUES ('2025-26', 'Season 2025/26', '2025-08-15', true)
ON CONFLICT (code) DO UPDATE SET
    is_current = true,
    start_date = '2025-08-15';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- After running, verify with:
-- SELECT * FROM season ORDER BY id;
-- SELECT * FROM points_against_by_fixture LIMIT 5;  -- Should be empty
-- SELECT * FROM points_against_collection_status;   -- Should be empty
