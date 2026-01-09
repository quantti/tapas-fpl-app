-- =============================================
-- Migration: 011_pfs_captain_lookup_index.sql
-- Add index optimized for captain differential lookup query
-- =============================================
-- Depends on: 006_player_fixture_stats.sql
-- Purpose: Optimize the _PLAYER_GW_POINTS_SQL query in history.py
--
-- The query pattern:
--   SELECT player_id, gameweek, total_points
--   FROM player_fixture_stats
--   WHERE player_id = ANY($1) AND season_id = $2
--   ORDER BY player_id, gameweek
--
-- Existing idx_pfs_player_gw uses (player_id, season_id, gameweek DESC),
-- which requires a reverse scan. This ASC index enables forward scans.
-- =============================================

-- Index for captain differential lookup (forward scan for ORDER BY gameweek ASC)
CREATE INDEX IF NOT EXISTS idx_pfs_player_gw_asc
    ON player_fixture_stats(player_id, season_id, gameweek);
