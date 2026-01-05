-- Migration: 008_chip_usage.sql
-- Purpose: Store chip usage events for "Chips Remaining" feature
--
-- FPL 2025-26 Rules: ALL chips reset at GW20
-- Each half-season (GW1-19, GW20-38) has: wildcard, bboost, 3xc, freehit
-- Total: 8 chips per manager per season

CREATE TABLE IF NOT EXISTS chip_usage (
    id BIGSERIAL PRIMARY KEY,
    manager_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL CHECK (gameweek >= 1 AND gameweek <= 38),
    chip_type VARCHAR(20) NOT NULL CHECK (chip_type IN ('wildcard', 'bboost', '3xc', 'freehit')),

    -- Which half of the season (derived from gameweek, but stored for query efficiency)
    season_half SMALLINT NOT NULL CHECK (season_half IN (1, 2)),

    -- Analytics metadata
    points_gained INTEGER,              -- bench pts for BB, extra captain pts for 3xc
    team_value_at_use INTEGER,          -- in 0.1m units (e.g., 1005 = £100.5m)

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One chip of each type per half-season
    UNIQUE(manager_id, season_id, season_half, chip_type)
);

-- Indexes for common query patterns
CREATE INDEX idx_chip_usage_manager_season ON chip_usage(manager_id, season_id);
CREATE INDEX idx_chip_usage_season_half ON chip_usage(season_id, season_half);
CREATE INDEX idx_chip_usage_chip_type ON chip_usage(chip_type, season_id);

-- RLS
ALTER TABLE chip_usage OWNER TO postgres;
ALTER TABLE chip_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON chip_usage FOR SELECT USING (true);

COMMENT ON TABLE chip_usage IS 'Event log of FPL chip activations. From 2025-26, all chips reset at GW20.';
COMMENT ON COLUMN chip_usage.season_half IS '1 = GW1-19, 2 = GW20-38. All 4 chips available each half.';
COMMENT ON COLUMN chip_usage.points_gained IS 'Points benefit from chip. BB=bench points, 3xc=2x captain points, WC/FH=NULL (not directly measurable)';

-- View for easy "chips remaining" queries
CREATE OR REPLACE VIEW manager_chips_remaining AS
WITH all_chips AS (
    SELECT
        half.season_half,
        chip.chip_type
    FROM (VALUES (1), (2)) AS half(season_half)
    CROSS JOIN (VALUES ('wildcard'), ('bboost'), ('3xc'), ('freehit')) AS chip(chip_type)
),
manager_seasons AS (
    SELECT DISTINCT manager_id, season_id FROM chip_usage
)
SELECT
    ms.manager_id,
    ms.season_id,
    ac.season_half,
    ac.chip_type,
    cu.gameweek AS gameweek_used,
    cu.points_gained,
    CASE WHEN cu.id IS NULL THEN true ELSE false END AS is_available
FROM manager_seasons ms
CROSS JOIN all_chips ac
LEFT JOIN chip_usage cu
    ON ms.manager_id = cu.manager_id
    AND ms.season_id = cu.season_id
    AND ac.season_half = cu.season_half
    AND ac.chip_type = cu.chip_type;
