-- Migration: 010_collection_status.sql
-- Purpose: Track last processed gameweek for scheduled updates
-- Created: 2026-01-07
--
-- Collection status tracks the last processed gameweek for each collection type per season.
-- This ensures idempotent scheduled updates that skip already-processed gameweeks.
-- Multi-season support allows tracking progress independently for each FPL season.
--
-- The 'scheduled' collector is used by the combined daily update job that runs
-- Points Against and Chips collection together.
--
-- DOWN: DROP TABLE IF EXISTS collection_status;

CREATE TABLE IF NOT EXISTS collection_status (
    id TEXT NOT NULL,  -- Collector identifier (e.g., 'scheduled', 'points_against')
    season_id INTEGER NOT NULL DEFAULT 1,
    latest_gameweek INTEGER NOT NULL DEFAULT 0,
    last_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite primary key for multi-season support
    PRIMARY KEY (id, season_id),

    -- Ensure gameweek is in valid range (0-38, where 0 = none processed)
    CONSTRAINT valid_gameweek CHECK (latest_gameweek >= 0 AND latest_gameweek <= 38),

    -- Foreign key to season table
    CONSTRAINT fk_season FOREIGN KEY (season_id) REFERENCES season(id)
);

-- Composite index for efficient lookups by collector type and season
CREATE INDEX IF NOT EXISTS idx_collection_status_type_season
    ON collection_status(id, season_id, last_update DESC);

-- Add comments for documentation
COMMENT ON TABLE collection_status IS 'Tracks last processed gameweek for each data collector per season';
COMMENT ON COLUMN collection_status.id IS 'Collector identifier (scheduled, points_against, etc.)';
COMMENT ON COLUMN collection_status.season_id IS 'Season this status applies to (FK to season.id)';
COMMENT ON COLUMN collection_status.latest_gameweek IS 'Last successfully processed gameweek (0 = none)';
COMMENT ON COLUMN collection_status.last_update IS 'Timestamp of last successful update';
