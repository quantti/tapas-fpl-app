-- Migration 009: Fix Points Against Primary Key
-- Description: Change primary key from fixture_id to (fixture_id, team_id)
--
-- BUG: Each fixture has TWO teams that concede points (home and away).
-- With fixture_id as the sole primary key, only one team's data could be stored.
-- The second team's data would overwrite the first during collection.
--
-- This migration:
-- 1. Drops the existing table (data is stale/incorrect anyway)
-- 2. Recreates with correct composite primary key
-- 3. Re-collection is required after migration

-- Drop the old table and recreate with correct structure
DROP TABLE IF EXISTS points_against_by_fixture CASCADE;

CREATE TABLE points_against_by_fixture (
    fixture_id INTEGER NOT NULL,              -- FPL fixture ID
    team_id INTEGER NOT NULL,                 -- Team being scored against
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    home_points INTEGER NOT NULL DEFAULT 0,   -- Points scored by home team against this team
    away_points INTEGER NOT NULL DEFAULT 0,   -- Points scored by away team against this team
    is_home BOOLEAN NOT NULL,                 -- Was this team at home in this fixture?
    opponent_id INTEGER NOT NULL,             -- Who they played against
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (fixture_id, team_id)         -- Each fixture has 2 rows: one per team
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

-- Recreate the view (dropped with CASCADE)
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

-- Reset collection status to force re-collection
UPDATE points_against_collection_status
SET status = 'idle',
    latest_gameweek = 0,
    total_players_processed = 0,
    last_full_collection = NULL,
    error_message = 'Schema changed - re-collection required'
WHERE id = 'points_against';

COMMENT ON TABLE points_against_by_fixture IS 'Tracks FPL points scored against each team per fixture. Composite PK (fixture_id, team_id) allows storing data for both teams in each match.';
