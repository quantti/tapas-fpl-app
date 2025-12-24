-- Migration 003: Analytics Support Tables
-- Description: Tables for expected points, form tracking, and recommendations
-- Depends on: 001_core_tables.sql, 002_historical.sql
-- Note: These tables can be created later when analytics features are needed

-- ============================================================================
-- EXPECTED POINTS CACHE
-- ============================================================================

-- Cached expected points calculations
CREATE TABLE expected_points_cache (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,             -- Prediction for this GW
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- xP breakdown
    xp_goals DECIMAL(5,2) DEFAULT 0,
    xp_assists DECIMAL(5,2) DEFAULT 0,
    xp_clean_sheet DECIMAL(5,2) DEFAULT 0,
    xp_appearance DECIMAL(5,2) DEFAULT 0,
    xp_bonus DECIMAL(5,2) DEFAULT 0,
    xp_goals_conceded DECIMAL(5,2) DEFAULT 0,
    xp_total DECIMAL(6,2) DEFAULT 0,
    -- Expected minutes
    expected_minutes DECIMAL(4,1) DEFAULT 0,
    minutes_probability_0 DECIMAL(4,3) DEFAULT 0,   -- P(0 min)
    minutes_probability_60 DECIMAL(4,3) DEFAULT 0,  -- P(60+ min)
    -- Calculation metadata
    model_version VARCHAR(20),
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_xp_gameweek ON expected_points_cache(season_id, gameweek);
CREATE INDEX idx_xp_total ON expected_points_cache(gameweek, xp_total DESC);

-- ============================================================================
-- DELTA TRACKING (Over/Under Performance)
-- ============================================================================

-- Tracks actual vs expected performance
CREATE TABLE performance_delta (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Deltas (actual - expected)
    goals_delta DECIMAL(5,2) DEFAULT 0,    -- goals - xG
    assists_delta DECIMAL(5,2) DEFAULT 0,  -- assists - xA
    points_delta DECIMAL(5,2) DEFAULT 0,   -- actual - xP
    -- Rolling deltas (cumulative)
    rolling_goals_delta DECIMAL(6,2) DEFAULT 0,
    rolling_assists_delta DECIMAL(6,2) DEFAULT 0,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_delta_player ON performance_delta(player_id);
CREATE INDEX idx_delta_regression ON performance_delta(rolling_goals_delta DESC);

-- ============================================================================
-- MULTI-HORIZON FORM
-- ============================================================================

-- Rolling form calculations at different horizons
CREATE TABLE player_form (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Form at different horizons (points per game)
    form_1gw DECIMAL(4,1) DEFAULT 0,       -- Last GW only
    form_3gw DECIMAL(4,1) DEFAULT 0,       -- Last 3 GWs
    form_5gw DECIMAL(4,1) DEFAULT 0,       -- Last 5 GWs
    form_10gw DECIMAL(4,1) DEFAULT 0,      -- Last 10 GWs
    -- xG-based form
    xg_form_5gw DECIMAL(5,2) DEFAULT 0,    -- xG per 90 over 5 GWs
    xa_form_5gw DECIMAL(5,2) DEFAULT 0,    -- xA per 90 over 5 GWs
    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_form_gw ON player_form(season_id, gameweek);

-- ============================================================================
-- RECOMMENDATION SCORES
-- ============================================================================

-- Pre-computed recommendation scores
CREATE TABLE recommendation_score (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Category scores (0-100)
    punt_score DECIMAL(5,2) DEFAULT 0,
    defensive_score DECIMAL(5,2) DEFAULT 0,
    sell_score DECIMAL(5,2) DEFAULT 0,     -- "Time to sell" badness score
    -- Fixture score (next 5 GWs)
    fixture_score DECIMAL(4,2) DEFAULT 0,
    -- League-specific ownership (stored per league)
    -- Note: For league-specific, use separate table
    global_ownership DECIMAL(5,2) DEFAULT 0,
    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_rec_punt ON recommendation_score(gameweek, punt_score DESC);
CREATE INDEX idx_rec_defensive ON recommendation_score(gameweek, defensive_score DESC);
CREATE INDEX idx_rec_sell ON recommendation_score(gameweek, sell_score DESC);

-- ============================================================================
-- LEAGUE-SPECIFIC OWNERSHIP
-- ============================================================================

-- League-specific ownership for recommendations
CREATE TABLE league_ownership (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (league_id, season_id) REFERENCES league(id, season_id),
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Ownership stats
    ownership_count INTEGER DEFAULT 0,     -- How many managers own
    ownership_percent DECIMAL(5,2) DEFAULT 0,
    captain_count INTEGER DEFAULT 0,
    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, player_id, season_id, gameweek)
);

CREATE INDEX idx_lo_league ON league_ownership(league_id, gameweek);
CREATE INDEX idx_lo_ownership ON league_ownership(league_id, ownership_percent DESC);
