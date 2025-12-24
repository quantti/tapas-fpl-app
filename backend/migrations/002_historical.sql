-- Migration 002: Historical Tracking Tables
-- Description: Tables for tracking manager picks, transfers, and gameweek snapshots
-- Depends on: 001_core_tables.sql

-- ============================================================================
-- HISTORICAL SNAPSHOTS
-- ============================================================================

-- Manager state snapshot per gameweek
CREATE TABLE manager_gw_snapshot (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (manager_id, season_id) REFERENCES manager(id, season_id),
    FOREIGN KEY (gameweek, season_id) REFERENCES gameweek(id, season_id),
    -- Points
    points INTEGER DEFAULT 0,              -- GW points (before hits)
    total_points INTEGER DEFAULT 0,        -- Cumulative after this GW
    points_on_bench INTEGER DEFAULT 0,     -- Wasted bench points
    -- Transfers
    transfers_made INTEGER DEFAULT 0,
    transfers_cost INTEGER DEFAULT 0,      -- Hit points taken
    -- Value
    bank INTEGER DEFAULT 0,                -- In 0.1m
    value INTEGER DEFAULT 0,               -- Team value
    -- Rank
    overall_rank INTEGER,
    gameweek_rank INTEGER,
    -- Chip used this GW (null if none)
    chip_used VARCHAR(20),                 -- 'wildcard', 'bboost', 'freehit', '3xc'
    -- Formation
    formation VARCHAR(10),                 -- e.g., "3-4-3"
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(manager_id, season_id, gameweek)
);

CREATE INDEX idx_mgw_manager ON manager_gw_snapshot(manager_id);
CREATE INDEX idx_mgw_gameweek ON manager_gw_snapshot(season_id, gameweek);
CREATE INDEX idx_mgw_chip ON manager_gw_snapshot(chip_used) WHERE chip_used IS NOT NULL;

-- Manager's picks per gameweek
-- Note: player_id FK requires knowing season_id; we get it via snapshot -> season
CREATE TABLE manager_pick (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES manager_gw_snapshot(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL,            -- FK enforced at application level due to snapshot indirection
    -- Pick details
    position INTEGER NOT NULL,             -- 1-15 (1-11 starting, 12-15 bench)
    multiplier INTEGER DEFAULT 1,          -- 0=bench, 1=normal, 2=captain, 3=TC
    is_captain BOOLEAN DEFAULT false,
    is_vice_captain BOOLEAN DEFAULT false,
    -- Points earned (for historical record)
    points INTEGER DEFAULT 0,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pick_snapshot ON manager_pick(snapshot_id);
CREATE INDEX idx_pick_player ON manager_pick(player_id);
CREATE INDEX idx_pick_captain ON manager_pick(snapshot_id) WHERE is_captain = true;
-- Composite index for common "player picks by gameweek" queries
CREATE INDEX idx_pick_player_snapshot ON manager_pick(player_id, snapshot_id);

-- ============================================================================
-- TRANSFER HISTORY
-- ============================================================================

-- Transfer records
CREATE TABLE transfer (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,             -- GW the transfer was for
    -- Player movement
    player_in INTEGER NOT NULL,
    player_out INTEGER NOT NULL,
    FOREIGN KEY (manager_id, season_id) REFERENCES manager(id, season_id),
    FOREIGN KEY (player_in, season_id) REFERENCES player(id, season_id),
    FOREIGN KEY (player_out, season_id) REFERENCES player(id, season_id),
    -- Prices at time of transfer
    price_in INTEGER NOT NULL,             -- In 0.1m
    price_out INTEGER NOT NULL,
    -- Transfer type
    is_hit BOOLEAN DEFAULT false,          -- Was this a -4 hit?
    -- Timestamp
    transfer_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transfer_manager ON transfer(manager_id);
CREATE INDEX idx_transfer_gw ON transfer(season_id, gameweek);
CREATE INDEX idx_transfer_player_in ON transfer(player_in);
CREATE INDEX idx_transfer_player_out ON transfer(player_out);

-- ============================================================================
-- CHIP USAGE TRACKING
-- ============================================================================

-- Chip usage history
CREATE TABLE chip_usage (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    FOREIGN KEY (manager_id, season_id) REFERENCES manager(id, season_id),
    gameweek INTEGER NOT NULL,
    -- Chip type
    chip_type VARCHAR(20) NOT NULL,        -- 'wildcard', 'bboost', 'freehit', '3xc'
    -- Optional: extra points gained (for bench boost)
    points_gained INTEGER,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(manager_id, season_id, chip_type, gameweek)
);

CREATE INDEX idx_chip_manager ON chip_usage(manager_id);
CREATE INDEX idx_chip_type ON chip_usage(chip_type);

-- ============================================================================
-- PLAYER GAMEWEEK STATS
-- ============================================================================

-- Player performance per gameweek (from /event/{gw}/live)
CREATE TABLE player_gw_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    fixture_id INTEGER REFERENCES fixture(id),  -- Can have multiple if DGW
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    FOREIGN KEY (gameweek, season_id) REFERENCES gameweek(id, season_id),
    -- Points breakdown
    total_points INTEGER DEFAULT 0,
    minutes INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    own_goals INTEGER DEFAULT 0,
    penalties_saved INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    bps INTEGER DEFAULT 0,
    -- ICT for this GW
    influence DECIMAL(6,1) DEFAULT 0,
    creativity DECIMAL(6,1) DEFAULT 0,
    threat DECIMAL(6,1) DEFAULT 0,
    ict_index DECIMAL(6,1) DEFAULT 0,
    -- Expected stats for this GW
    expected_goals DECIMAL(5,2) DEFAULT 0,
    expected_assists DECIMAL(5,2) DEFAULT 0,
    expected_goal_involvements DECIMAL(5,2) DEFAULT 0,
    expected_goals_conceded DECIMAL(5,2) DEFAULT 0,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek, fixture_id)
);

CREATE INDEX idx_pgs_player ON player_gw_stats(player_id);
CREATE INDEX idx_pgs_gameweek ON player_gw_stats(season_id, gameweek);
CREATE INDEX idx_pgs_points ON player_gw_stats(total_points DESC);

-- ============================================================================
-- PRICE CHANGES
-- ============================================================================

-- Player price change history
CREATE TABLE price_change (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Change details
    old_price INTEGER NOT NULL,            -- In 0.1m
    new_price INTEGER NOT NULL,
    change_amount INTEGER NOT NULL,        -- +1 or -1 (in 0.1m)
    -- When
    change_date DATE NOT NULL,
    gameweek INTEGER,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_player ON price_change(player_id);
CREATE INDEX idx_price_date ON price_change(change_date DESC);
