-- Migration 004: Points Against Tables
-- Description: Track FPL points scored against each Premier League team
-- This helps identify weak defenses for captain/transfer targeting

-- ============================================================================
-- POINTS AGAINST BY FIXTURE
-- ============================================================================

-- Stores points conceded per fixture (handles DGWs correctly)
-- Key design: fixture_id as primary key ensures each match is tracked once
CREATE TABLE points_against_by_fixture (
    fixture_id INTEGER PRIMARY KEY,           -- FPL fixture ID (unique per match)
    team_id INTEGER NOT NULL,                 -- Team being scored against
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    home_points INTEGER NOT NULL DEFAULT 0,   -- Points conceded when at home
    away_points INTEGER NOT NULL DEFAULT 0,   -- Points conceded when away
    is_home BOOLEAN NOT NULL,                 -- Was this team at home in this fixture?
    opponent_id INTEGER NOT NULL,             -- Who they played against
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Primary query: Get totals by team for a season
CREATE INDEX idx_pa_team_season
    ON points_against_by_fixture(team_id, season_id);

-- Query: Get all fixtures for a gameweek
CREATE INDEX idx_pa_gameweek
    ON points_against_by_fixture(season_id, gameweek);

-- Query: Get specific team's fixtures by gameweek
CREATE INDEX idx_pa_team_gw
    ON points_against_by_fixture(team_id, season_id, gameweek);

-- ============================================================================
-- DATA COLLECTION STATUS
-- ============================================================================

-- Tracks the last time we collected/refreshed points against data
CREATE TABLE points_against_collection_status (
    id TEXT PRIMARY KEY DEFAULT 'points_against',
    season_id INTEGER NOT NULL REFERENCES season(id),
    latest_gameweek INTEGER NOT NULL DEFAULT 0,
    total_players_processed INTEGER NOT NULL DEFAULT 0,
    last_full_collection TIMESTAMPTZ,
    last_incremental_update TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'idle',       -- 'idle', 'running', 'error'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- Season totals by team (most common query)
CREATE VIEW points_against_season_totals AS
SELECT
    paf.team_id,
    t.name AS team_name,
    t.short_name,
    paf.season_id,
    s.code AS season_code,
    COUNT(*) AS matches_played,
    SUM(paf.home_points + paf.away_points) AS total_points,
    SUM(CASE WHEN paf.is_home THEN paf.home_points + paf.away_points ELSE 0 END) AS home_points,
    SUM(CASE WHEN NOT paf.is_home THEN paf.home_points + paf.away_points ELSE 0 END) AS away_points,
    ROUND(
        SUM(paf.home_points + paf.away_points)::NUMERIC / NULLIF(COUNT(*), 0),
        2
    ) AS avg_per_match
FROM points_against_by_fixture paf
JOIN team t ON t.id = paf.team_id AND t.season_id = paf.season_id
JOIN season s ON s.id = paf.season_id
GROUP BY paf.team_id, t.name, t.short_name, paf.season_id, s.code;

-- Add comment for documentation
COMMENT ON TABLE points_against_by_fixture IS 'Tracks FPL points scored against each team per fixture. Use fixture_id as primary key to handle Double Gameweeks correctly.';
COMMENT ON VIEW points_against_season_totals IS 'Pre-aggregated season totals for points against by team. Use this for the main Points Against feature display.';
