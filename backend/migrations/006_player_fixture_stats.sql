-- Migration 006: Player Fixture Stats
-- Description: Per-player per-fixture stats for recommendations engine
-- Depends on: 001_core_tables.sql, 004_points_against.sql
-- Purpose: Store detailed player performance data for:
--   - Delta tracking (actual vs expected)
--   - Multi-horizon form calculations
--   - Expected Points engine foundation
--   - Player-level Points Against analysis

-- ============================================================================
-- PLAYER FIXTURE STATS
-- ============================================================================

-- Stores detailed per-gameweek stats for each player
-- This is the data we already fetch from FPL API but currently discard
CREATE TABLE player_fixture_stats (
    -- Primary identification
    fixture_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek SMALLINT NOT NULL,

    -- Match context
    player_team_id INTEGER NOT NULL,        -- Player's team
    opponent_team_id INTEGER NOT NULL,      -- Opposition team
    was_home BOOLEAN NOT NULL,
    kickoff_time TIMESTAMPTZ,

    -- Points breakdown
    minutes SMALLINT NOT NULL DEFAULT 0,
    total_points SMALLINT NOT NULL DEFAULT 0,
    bonus SMALLINT NOT NULL DEFAULT 0,
    bps SMALLINT NOT NULL DEFAULT 0,        -- Bonus Points System score

    -- Attacking stats (for delta tracking: actual - expected)
    goals_scored SMALLINT NOT NULL DEFAULT 0,
    assists SMALLINT NOT NULL DEFAULT 0,
    expected_goals DECIMAL(5,2) NOT NULL DEFAULT 0,
    expected_assists DECIMAL(5,2) NOT NULL DEFAULT 0,
    expected_goal_involvements DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Defensive stats
    clean_sheets SMALLINT NOT NULL DEFAULT 0,
    goals_conceded SMALLINT NOT NULL DEFAULT 0,
    own_goals SMALLINT NOT NULL DEFAULT 0,
    penalties_saved SMALLINT NOT NULL DEFAULT 0,
    penalties_missed SMALLINT NOT NULL DEFAULT 0,
    saves SMALLINT NOT NULL DEFAULT 0,
    expected_goals_conceded DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Cards
    yellow_cards SMALLINT NOT NULL DEFAULT 0,
    red_cards SMALLINT NOT NULL DEFAULT 0,

    -- ICT Index (Influence, Creativity, Threat)
    influence DECIMAL(6,1) NOT NULL DEFAULT 0,
    creativity DECIMAL(6,1) NOT NULL DEFAULT 0,
    threat DECIMAL(6,1) NOT NULL DEFAULT 0,
    ict_index DECIMAL(6,1) NOT NULL DEFAULT 0,

    -- Value and ownership at time of match
    value INTEGER NOT NULL,                  -- Price * 10 (e.g., 100 = £10.0m)
    selected INTEGER NOT NULL DEFAULT 0,     -- Global ownership count
    transfers_in INTEGER NOT NULL DEFAULT 0,
    transfers_out INTEGER NOT NULL DEFAULT 0,

    -- Playing status
    starts SMALLINT NOT NULL DEFAULT 0,      -- 1 if started, 0 if sub

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (fixture_id, player_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Find all stats for a player in a season
CREATE INDEX idx_pfs_player_season
    ON player_fixture_stats(player_id, season_id);

-- Find all players who played against a team (for Points Against by player)
CREATE INDEX idx_pfs_opponent
    ON player_fixture_stats(opponent_team_id, season_id);

-- Multi-horizon form: recent gameweeks for a player
CREATE INDEX idx_pfs_player_gw
    ON player_fixture_stats(player_id, season_id, gameweek DESC);

-- Find stats for a specific gameweek (for form calculations)
CREATE INDEX idx_pfs_season_gw
    ON player_fixture_stats(season_id, gameweek);

-- Delta tracking: find over/underperformers
CREATE INDEX idx_pfs_xg_delta
    ON player_fixture_stats(season_id, (goals_scored - expected_goals) DESC)
    WHERE minutes >= 60;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Player performance against each team (aggregated)
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
GROUP BY pfs.player_id, pfs.opponent_team_id, pfs.season_id;

-- Player form at different horizons (last 1, 3, 5, 10 GWs)
-- Note: This is a function, not a simple view, because it needs current GW
CREATE OR REPLACE FUNCTION get_player_form(
    p_player_id INTEGER,
    p_season_id INTEGER,
    p_current_gw INTEGER
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
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(AVG(total_points) FILTER (WHERE gameweek = p_current_gw - 1), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= p_current_gw - 3), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= p_current_gw - 5), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= p_current_gw - 10), 0)::DECIMAL(4,1),
        COALESCE(SUM(minutes) FILTER (WHERE gameweek = p_current_gw - 1), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= p_current_gw - 3), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= p_current_gw - 5), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= p_current_gw - 10), 0)::INTEGER
    FROM player_fixture_stats
    WHERE player_id = p_player_id
      AND season_id = p_season_id
      AND gameweek < p_current_gw;
END;
$$ LANGUAGE plpgsql;

-- Delta tracking: over/underperformers this season
CREATE OR REPLACE VIEW player_season_deltas AS
SELECT
    pfs.player_id,
    pfs.season_id,
    COUNT(*) as matches,
    SUM(pfs.minutes) as total_minutes,
    SUM(pfs.goals_scored) as actual_goals,
    ROUND(SUM(pfs.expected_goals)::numeric, 2) as expected_goals,
    SUM(pfs.goals_scored) - SUM(pfs.expected_goals) as goals_delta,
    SUM(pfs.assists) as actual_assists,
    ROUND(SUM(pfs.expected_assists)::numeric, 2) as expected_assists,
    SUM(pfs.assists) - SUM(pfs.expected_assists) as assists_delta,
    SUM(pfs.total_points) as total_points,
    ROUND(AVG(pfs.total_points), 1) as avg_points
FROM player_fixture_stats pfs
WHERE pfs.minutes >= 1
GROUP BY pfs.player_id, pfs.season_id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE player_fixture_stats IS
    'Per-player per-fixture stats from FPL API element-summary endpoint. Used for recommendations engine.';

COMMENT ON COLUMN player_fixture_stats.bps IS
    'Bonus Points System raw score (determines bonus allocation)';

COMMENT ON COLUMN player_fixture_stats.value IS
    'Player price at time of match, multiplied by 10 (e.g., 100 = £10.0m)';

COMMENT ON VIEW player_vs_team_stats IS
    'Aggregated stats for how each player performs against each opponent team';

COMMENT ON VIEW player_season_deltas IS
    'Over/underperformance tracking: actual goals/assists vs expected';
