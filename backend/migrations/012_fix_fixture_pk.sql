-- Migration: Fix fixture table primary key for multi-season support
-- FPL reuses fixture IDs across seasons, so we need composite PK (id, season_id)
-- This matches the pattern used by team, player, and other FPL entity tables

-- First, drop the FK constraint that references fixture
ALTER TABLE player_gw_stats DROP CONSTRAINT IF EXISTS player_gw_stats_fixture_id_fkey;

-- Drop the existing simple primary key
ALTER TABLE fixture DROP CONSTRAINT fixture_pkey;

-- Add composite primary key (id, season_id)
ALTER TABLE fixture ADD PRIMARY KEY (id, season_id);

-- Recreate FK constraint with composite reference
-- player_gw_stats already has season_id column, so we use composite FK
ALTER TABLE player_gw_stats
ADD CONSTRAINT player_gw_stats_fixture_id_fkey
FOREIGN KEY (fixture_id, season_id) REFERENCES fixture(id, season_id);

-- Add index on season_id for efficient filtering (PK index covers id, season_id but not season_id alone)
CREATE INDEX IF NOT EXISTS idx_fixture_season ON fixture(season_id);
