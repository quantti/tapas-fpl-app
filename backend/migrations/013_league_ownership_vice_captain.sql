-- Migration: Add vice_captain_count to league_ownership table
-- Purpose: Track vice captain selections per player per gameweek for future analytics

ALTER TABLE league_ownership ADD COLUMN IF NOT EXISTS vice_captain_count INTEGER DEFAULT 0;

-- Verify column was added
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'league_ownership' AND column_name = 'vice_captain_count'
    ) THEN
        RAISE EXCEPTION 'Migration failed: vice_captain_count column not created';
    END IF;
END $$;
