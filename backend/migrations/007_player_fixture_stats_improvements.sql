-- Migration 007: Player Fixture Stats Improvements
-- Description: Schema improvements based on code review
-- Depends on: 006_player_fixture_stats.sql

-- ============================================================================
-- TABLE IMPROVEMENTS
-- ============================================================================

-- Fix primary key to include season_id for multi-season support
-- Per project conventions: composite keys (id, season_id) for FPL entities
ALTER TABLE player_fixture_stats
    DROP CONSTRAINT IF EXISTS player_fixture_stats_pkey;
ALTER TABLE player_fixture_stats
    ADD PRIMARY KEY (fixture_id, player_id, season_id);

-- Add updated_at column for tracking data freshness
ALTER TABLE player_fixture_stats
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add check constraint to ensure selected is non-negative
ALTER TABLE player_fixture_stats
    ADD CONSTRAINT chk_pfs_selected_non_negative CHECK (selected >= 0);

-- Create trigger to auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_pfs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pfs_updated_at ON player_fixture_stats;
CREATE TRIGGER trg_pfs_updated_at
    BEFORE UPDATE ON player_fixture_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_pfs_updated_at();

-- ============================================================================
-- VIEW IMPROVEMENTS
-- ============================================================================

-- Recreate view with minutes > 0 filter to exclude non-appearances
-- (Players who didn't play skew averages)
CREATE OR REPLACE VIEW player_vs_team_stats AS
SELECT
    pfs.player_id,
    pfs.opponent_team_id,
    pfs.season_id,
    COUNT(*) as matches,
    SUM(pfs.total_points) as total_points,
    ROUND(AVG(pfs.total_points), 1) as avg_points,
    SUM(pfs.goals_scored) as goals,
    SUM(pfs.assists) as assists,
    SUM(pfs.minutes) as total_minutes,
    ROUND(SUM(pfs.expected_goals)::numeric, 2) as total_xg,
    ROUND(SUM(pfs.expected_assists)::numeric, 2) as total_xa
FROM player_fixture_stats pfs
WHERE pfs.minutes > 0  -- Only include matches where player actually played
GROUP BY pfs.player_id, pfs.opponent_team_id, pfs.season_id;

-- ============================================================================
-- FUNCTION IMPROVEMENTS
-- ============================================================================

-- Recreate function with NULL gameweek handling
-- If p_current_gw is NULL, use the max gameweek from data
CREATE OR REPLACE FUNCTION get_player_form(
    p_player_id INTEGER,
    p_season_id INTEGER,
    p_current_gw INTEGER DEFAULT NULL
) RETURNS TABLE (
    form_1gw DECIMAL(4,1),
    form_3gw DECIMAL(4,1),
    form_5gw DECIMAL(4,1),
    form_10gw DECIMAL(4,1),
    minutes_1gw INTEGER,
    minutes_3gw INTEGER,
    minutes_5gw INTEGER,
    minutes_10gw INTEGER
) AS $$
DECLARE
    v_max_gw INTEGER;
BEGIN
    -- If current GW not provided, find the latest gameweek with data
    IF p_current_gw IS NULL THEN
        SELECT COALESCE(MAX(gameweek), 0) + 1
        INTO v_max_gw
        FROM player_fixture_stats
        WHERE player_id = p_player_id AND season_id = p_season_id;
    ELSE
        v_max_gw := p_current_gw;
    END IF;

    -- Handle case where no data exists
    IF v_max_gw <= 1 THEN
        RETURN QUERY SELECT
            0::DECIMAL(4,1), 0::DECIMAL(4,1), 0::DECIMAL(4,1), 0::DECIMAL(4,1),
            0::INTEGER, 0::INTEGER, 0::INTEGER, 0::INTEGER;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(AVG(total_points) FILTER (WHERE gameweek = v_max_gw - 1), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= v_max_gw - 3), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= v_max_gw - 5), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= v_max_gw - 10), 0)::DECIMAL(4,1),
        COALESCE(SUM(minutes) FILTER (WHERE gameweek = v_max_gw - 1), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= v_max_gw - 3), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= v_max_gw - 5), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= v_max_gw - 10), 0)::INTEGER
    FROM player_fixture_stats
    WHERE player_id = p_player_id
      AND season_id = p_season_id
      AND gameweek < v_max_gw;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INDEX IMPROVEMENTS
-- ============================================================================

-- Partial index for form queries - only index players who have played
CREATE INDEX IF NOT EXISTS idx_pfs_form_queries
    ON player_fixture_stats(player_id, season_id, gameweek DESC)
    WHERE minutes > 0;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN player_fixture_stats.updated_at IS
    'Timestamp of last update, auto-maintained by trigger';

COMMENT ON FUNCTION get_player_form IS
    'Calculate player form across multiple horizons (1, 3, 5, 10 GWs). p_current_gw defaults to max+1 if not provided.';
